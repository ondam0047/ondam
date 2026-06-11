import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readSection0 } from "@/lib/hwpx";
import { resolveForm } from "@/lib/record-resolver";

const OP = (process.env.BETA_ADMIN_EMAIL ?? "yj2000102@gmail.com").toLowerCase();

// 업로드한 .hwpx 기록지 양식을 자동매핑 → 커버리지 + 격자(미리보기용) + spec.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (user.email.toLowerCase() !== OP) return Response.json({ error: "forbidden" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) return Response.json({ error: "no file" }, { status: 400 });

  let xml: string;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    xml = readSection0(buf);
  } catch {
    return Response.json({ error: "이 파일은 편집 가능한 .hwpx 가 아니거나 표가 없어 분석할 수 없어요. (.hwp·스캔·PDF 미지원)" }, { status: 422 });
  }

  const { spec, coverage, grid } = resolveForm(xml);
  // 미리보기용으로 격자를 가볍게 — norm/p 제외
  const slimGrid = grid.map((cells) =>
    cells.map((c) => ({ r: c.r, c: c.c, cs: c.cs, rs: c.rs, text: c.text, role: c.role ?? null })),
  );
  return Response.json({ coverage, grid: slimGrid, spec });
}
