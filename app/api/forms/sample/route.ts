import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readSection0, patchSection0 } from "@/lib/hwpx";
import { fillCells } from "@/lib/record-fill";
import { resolveForm, buildSampleEdits } from "@/lib/record-resolver";
import { removeTableColumns } from "@/lib/record-trim";

const OP = (process.env.BETA_ADMIN_EMAIL ?? "yj2000102@gmail.com").toLowerCase();

// 업로드한 양식에 더미 샘플 데이터를 채워 .hwpx 로 돌려줌 — 미리보기 안전망.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (user.email.toLowerCase() !== OP) return Response.json({ error: "forbidden" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) return Response.json({ error: "no file" }, { status: 400 });

  const srcBuf = Buffer.from(await file.arrayBuffer());
  let xml: string;
  try {
    xml = readSection0(srcBuf);
  } catch {
    return Response.json({ error: "분석할 수 없는 파일이에요." }, { status: 422 });
  }

  const { spec } = resolveForm(xml);
  // ?trim=1 이면 5칸 초과 회기 열을 물리적으로 제거(실험).
  const trim = new URL(req.url).searchParams.get("trim") === "1";
  if (trim && spec.dateTable != null && spec.extraSessionCols?.length) {
    xml = removeTableColumns(xml, spec.dateTable, spec.extraSessionCols);
  }
  const filled = fillCells(xml, buildSampleEdits(spec));
  const out = patchSection0(srcBuf, filled);

  return new Response(new Uint8Array(out), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="sample-filled.hwpx"`,
    },
  });
}
