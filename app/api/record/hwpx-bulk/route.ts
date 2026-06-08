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
      })),
      opinion: r.opinion ?? undefined,
      serviceType: r.childService.serviceType,
    };
    const sheets = buildRecordSheets(templateBuf, payload, form);

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

  const zipBuf = bundleAsZip(files);
  const zipName = encodeURIComponent(`${year}년${pad(month)}월_기록지_모음_${records.length}건.zip`);
  return new Response(new Uint8Array(zipBuf), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${zipName}`,
    },
  });
}
