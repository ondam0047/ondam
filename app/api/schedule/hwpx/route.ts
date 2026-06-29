import { NextRequest } from "next/server";
import {
  buildScheduleHwpx,
  readScheduleTemplate,
  safeFileName,
  type SchedulePayload,
} from "@/lib/schedule-hwpx";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateScheduleFromForm } from "@/lib/schedule-fill-spec";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const p = (await req.json()) as SchedulePayload & { formId?: number };

  let out: Buffer;
  if (p.formId) {
    // 저장한 우리 센터 일정표 양식으로 채움(라벨 칸)
    const rf = await prisma.recordForm.findFirst({
      where: { id: Number(p.formId), ownerUserId: user.id, kind: "schedule" },
      select: { template: true, spec: true },
    });
    if (!rf) return Response.json({ error: "저장된 일정표 양식을 찾을 수 없어요." }, { status: 404 });
    try {
      out = generateScheduleFromForm(Buffer.from(rf.template), rf.spec, p);
    } catch {
      return Response.json({ error: "양식에 데이터를 채우는 중 문제가 생겼어요." }, { status: 500 });
    }
  } else {
    // 우리 센터 양식 미등록 — 발달바우처 기본 서식(내장 표준 일정표)으로 출력.
    let templateBuf: Buffer;
    try {
      templateBuf = await readScheduleTemplate();
    } catch {
      return Response.json(
        { error: "템플릿(samples/일정표_template.hwpx)을 찾을 수 없어요." },
        { status: 500 }
      );
    }
    out = buildScheduleHwpx(templateBuf, p);
  }

  const filename = encodeURIComponent(
    `${safeFileName(p.childName) || "일정표"}_${p.year}년${String(p.month).padStart(2, "0")}월.hwpx`
  );
  return new Response(new Uint8Array(out), {
    headers: {
      "Content-Type": "application/hwp+zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
