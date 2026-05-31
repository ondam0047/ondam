import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  buildRecordSheets,
  buildManualRecordSheets,
  bundleAsZip,
  readRecordTemplate,
  readManualRecordTemplate,
  safeFileName,
  type RecordPayload,
} from "@/lib/record-hwpx";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const p = (await req.json()) as RecordPayload;

  const center = await prisma.center.findUnique({
    where: { id: user.centerId ?? -1 },
    select: { manualMode: true, printUseDay: true, printPayDay: true, printApprNo: true },
  });
  const manualMode = center?.manualMode ?? false;

  let sheets: Buffer[];
  if (manualMode) {
    // 수기 모드: 제공일자(일정표)·승인일자/승인번호(엑셀) 만 미니 표로. 결과는 손으로.
    let templateBuf: Buffer;
    try {
      templateBuf = await readManualRecordTemplate();
    } catch {
      return Response.json(
        { error: "수기 템플릿(samples/기록지_수기_template.hwpx)을 찾을 수 없어요." },
        { status: 500 }
      );
    }
    sheets = buildManualRecordSheets(templateBuf, p, {
      manualMode: true,
      printUseDay: center?.printUseDay ?? true,
      printPayDay: center?.printPayDay ?? true,
      printApprNo: center?.printApprNo ?? true,
    });
  } else {
    let templateBuf: Buffer;
    try {
      templateBuf = await readRecordTemplate();
    } catch {
      return Response.json(
        { error: "템플릿(samples/기록지_template.hwpx)을 찾을 수 없어요." },
        { status: 500 }
      );
    }
    sheets = buildRecordSheets(templateBuf, p);
  }

  const baseName = `${safeFileName(p.childName)}_${String(p.month).padStart(2, "0")}월_기록지`;

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
    sheets.map((data, idx) => ({ name: `${baseName}_${idx + 1}.hwpx`, data }))
  );
  const filename = encodeURIComponent(`${baseName}.zip`);
  return new Response(new Uint8Array(zipBuf), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
