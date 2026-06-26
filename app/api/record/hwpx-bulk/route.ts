import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, getEffectiveTherapistId } from "@/lib/auth";
import { pad } from "@/lib/constants";
import { isRecordFormKey } from "@/lib/record-forms";
import {
  buildRecordSheets,
  bundleAsZip,
  readRecordTemplate,
  safeFileName,
  type RecordPayload,
} from "@/lib/record-hwpx";
import { generateRecordFromForm } from "@/lib/record-fill-spec";
import { buildSchedExtra } from "@/lib/record-sched-enrich";

// 한 사용자의 (연·월) 저장된 모든 기록지를 한 번에 .hwpx 생성 → ZIP 으로.
//   GET /api/record/hwpx-bulk?year=2026&month=2
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const year = Number(req.nextUrl.searchParams.get("year"));
  const month = Number(req.nextUrl.searchParams.get("month"));
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return Response.json({ error: "year/month required" }, { status: 400 });
  }
  const idsRaw = req.nextUrl.searchParams.get("ids");
  const ids = idsRaw
    ? idsRaw.split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n))
    : null;

  const myTherapistId = await getEffectiveTherapistId(user);
  if (!myTherapistId) {
    return Response.json({ error: "치료사 정보가 없어요" }, { status: 400 });
  }

  const records = await prisma.record.findMany({
    where: {
      year,
      month,
      ...(ids && ids.length > 0 ? { childServiceId: { in: ids } } : {}),
      childService: {
        therapistId: myTherapistId,
        child: { centerId: user.centerId ?? -1 },
      },
    },
    include: {
      sessions: { orderBy: { ordinal: "asc" } },
      childService: { include: { child: true } },
    },
    orderBy: [{ childService: { child: { name: "asc" } } }],
  });

  if (records.length === 0) {
    return Response.json({ error: `${year}년 ${month}월 선택한 기록지가 없어요.` }, { status: 404 });
  }

  const center = user.centerId
    ? await prisma.center.findUnique({ where: { id: user.centerId }, select: { recordForm: true } })
    : null;
  const form = isRecordFormKey(center?.recordForm) ? center!.recordForm : "standard";

  let templateBuf: Buffer;
  try {
    templateBuf = await readRecordTemplate(form);
  } catch {
    return Response.json({ error: "템플릿 파일을 찾을 수 없어요." }, { status: 500 });
  }

  // 저장된 업로드 양식(내 소유 record) 일괄 로드 — 각 기록지의 formId 로 출력에 사용.
  const formIds = [...new Set(records.map((r) => r.formId).filter((v): v is number => !!v))];
  const formMap = new Map<number, { template: Buffer; spec: string }>();
  if (formIds.length > 0) {
    const forms = await prisma.recordForm.findMany({
      where: { id: { in: formIds }, ownerUserId: user.id, kind: "record" },
      select: { id: true, template: true, spec: true },
    });
    for (const f of forms) formMap.set(f.id, { template: Buffer.from(f.template), spec: f.spec });
  }
  // 출력 양식 사용 시 치료사 이름(담당재활사 자동 채움)
  const therapist = await prisma.therapist.findUnique({ where: { id: myTherapistId }, select: { name: true } });
  const therapistName = therapist?.name ?? user.name ?? "";

  const files: { name: string; data: Buffer }[] = [];
  const usedNames = new Set<string>();

  for (const r of records) {
    const child = r.childService.child;
    const payload: RecordPayload = {
      childName: r.childName,
      childBirth: r.childBirth ?? "",
      org: r.org,
      month: r.month,
      sessions: r.sessions.map((s) => ({
        date: s.date ?? "",
        startTime: s.startTime ?? "",
        endTime: s.endTime ?? "",
        voucher: s.voucher ?? "",
        extra: s.extra ?? "",
        amount: s.amount ?? "",
        useDay: s.useDay ?? "",
        payDay: s.payDay ?? "",
        apprNumber: s.apprNumber ?? "",
        result: s.result ?? "",
        resultExtra: s.resultExtra ?? undefined,
        retroReason: s.retroReason ?? undefined,
      })),
      opinion: r.opinion ?? undefined,
      serviceType: r.childService.serviceType,
    };
    const savedForm = r.formId ? formMap.get(r.formId) : undefined;
    let sheets: Buffer[];
    if (savedForm) {
      // 통합 양식이면 일정표 라벨 데이터 보강
      let schedExtra: Record<string, string> | undefined;
      let hasSchedule = false;
      try { const sp = JSON.parse(savedForm.spec); hasSchedule = Array.isArray(sp?.schedule) && sp.schedule.length > 0; } catch {}
      if (hasSchedule) {
        schedExtra = await buildSchedExtra({
          user, childServiceId: r.childServiceId, year, month: r.month,
          sessionDates: payload.sessions.map((s) => s.date ?? ""),
        });
      }
      sheets = generateRecordFromForm(savedForm.template, savedForm.spec, payload, therapistName, schedExtra, year);
    } else {
      sheets = buildRecordSheets(templateBuf, payload, form);
    }

    const baseName = `${safeFileName(child.name)}_${pad(r.month)}월_기록지`;
    if (sheets.length === 1) {
      let name = `${baseName}.hwpx`;
      let n = 2;
      while (usedNames.has(name)) {
        name = `${baseName}_${n}.hwpx`;
        n++;
      }
      usedNames.add(name);
      files.push({ name, data: sheets[0] });
    } else {
      sheets.forEach((data, idx) => {
        let name = `${baseName}_${idx + 1}.hwpx`;
        let n = 2;
        while (usedNames.has(name)) {
          name = `${baseName}_${idx + 1}_${n}.hwpx`;
          n++;
        }
        usedNames.add(name);
        files.push({ name, data });
      });
    }
  }

  // 파일이 하나면(단일 아동·단일 시트) 압축하지 않고 .hwpx 를 바로 내려준다.
  if (files.length === 1) {
    const fname = encodeURIComponent(files[0].name);
    return new Response(new Uint8Array(files[0].data), {
      headers: {
        "Content-Type": "application/hwp+zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${fname}`,
      },
    });
  }

  const zipBuf = bundleAsZip(files);
  const zipName = encodeURIComponent(`${year}년${pad(month)}월_기록지_모음_${records.length}건.zip`);
  return new Response(new Uint8Array(zipBuf), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${zipName}`,
    },
  });
}
