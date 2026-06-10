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

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const p = (await req.json()) as RecordPayload;

  const center = user.centerId
    ? await prisma.center.findUnique({ where: { id: user.centerId }, select: { recordForm: true } })
    : null;
  const form = isRecordFormKey(center?.recordForm) ? center!.recordForm : "standard";

  let templateBuf: Buffer;
  try {
    templateBuf = await readRecordTemplate(form);
  } catch {
    return Response.json(
      { error: "기록지 템플릿 파일을 찾을 수 없어요." },
      { status: 500 }
    );
  }
  const sheets = buildRecordSheets(templateBuf, p, form);

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
