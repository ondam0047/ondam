import { NextRequest } from "next/server";
import {
  buildScheduleHwpx,
  readScheduleTemplate,
  safeFileName,
  type SchedulePayload,
} from "@/lib/schedule-hwpx";

export async function POST(req: NextRequest) {
  const p = (await req.json()) as SchedulePayload;

  let templateBuf: Buffer;
  try {
    templateBuf = await readScheduleTemplate();
  } catch {
    return Response.json(
      { error: "템플릿(samples/일정표_template.hwpx)을 찾을 수 없어요." },
      { status: 500 }
    );
  }

  const out = buildScheduleHwpx(templateBuf, p);
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
