import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
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

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const p = (await req.json()) as RecordPayload & {
    formId?: number;
    therapist?: string;
    childServiceId?: number;
    year?: number;
  };

  const baseName = `${safeFileName(p.childName)}_${String(p.month).padStart(2, "0")}월_기록지`;
  let sheets: Buffer[];

  if (p.formId) {
    // 저장한 우리 센터 양식으로 채움
    const rf = await prisma.recordForm.findFirst({
      where: { id: Number(p.formId), ownerUserId: user.id, kind: "record" },
      select: { template: true, spec: true },
    });
    if (!rf) return Response.json({ error: "저장된 양식을 찾을 수 없어요." }, { status: 404 });
    // 통합 양식(일정표+기록지 한 장)이면 일정표 라벨 데이터를 서버에서 보강.
    let schedExtra: Record<string, string> | undefined;
    let hasSchedule = false;
    try {
      hasSchedule = Array.isArray(JSON.parse(rf.spec)?.schedule) && JSON.parse(rf.spec).schedule.length > 0;
    } catch { hasSchedule = false; }
    if (hasSchedule) {
      schedExtra = await buildSchedExtra({
        user,
        childServiceId: p.childServiceId,
        year: p.year,
        month: Number(p.month) || new Date().getMonth() + 1,
        sessionDates: (p.sessions ?? []).map((s) => s.date ?? ""),
      });
    }
    try {
      sheets = generateRecordFromForm(Buffer.from(rf.template), rf.spec, p, p.therapist ?? "", schedExtra, p.year);
    } catch {
      return Response.json({ error: "양식에 데이터를 채우는 중 문제가 생겼어요." }, { status: 500 });
    }
  } else {
    // 기본(코드 내장) 양식
    const center = user.centerId
      ? await prisma.center.findUnique({ where: { id: user.centerId }, select: { recordForm: true } })
      : null;
    const form = isRecordFormKey(center?.recordForm) ? center!.recordForm : "standard";
    let templateBuf: Buffer;
    try {
      templateBuf = await readRecordTemplate(form);
    } catch {
      return Response.json({ error: "기록지 템플릿 파일을 찾을 수 없어요." }, { status: 500 });
    }
    sheets = buildRecordSheets(templateBuf, p, form);
  }

  if (sheets.length === 1) {
    const filename = encodeURIComponent(`${baseName}.hwpx`);
    return new Response(new Uint8Array(sheets[0]), {
      headers: {
        "Content-Type": "application/hwp+zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      },
    });
  }

  const zipBuf = bundleAsZip(
    sheets.map((data, idx) => ({ name: `${baseName}_${idx + 1}.hwpx`, data })),
  );
  const filename = encodeURIComponent(`${baseName}.zip`);
  return new Response(new Uint8Array(zipBuf), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
