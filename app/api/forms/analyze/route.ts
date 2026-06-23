import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readSection0 } from "@/lib/hwpx";
import { resolveForm } from "@/lib/record-resolver";
import { formFingerprint } from "@/lib/record-fingerprint";

// 업로드한 .hwpx 기록지 양식을 자동매핑 → 커버리지 + 격자(미리보기용) + spec.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

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
  // 미리보기용으로 격자를 가볍게 — norm 제외
  const slimGrid = grid.map((cells) =>
    cells.map((c) => ({ r: c.r, c: c.c, cs: c.cs, rs: c.rs, text: c.text, role: c.role ?? null, p: c.p, paras: c.paras })),
  );

  // 학습 캐시 — 같은 구조의 양식을 이전에 매핑한 적 있으면 그 매핑을 돌려줘 자동 채움.
  const fingerprint = formFingerprint(grid);
  let cached: { overrides: Record<string, string>; label: string | null } | null = null;
  try {
    const hit = await prisma.formMapping.findUnique({ where: { fingerprint } });
    if (hit) {
      const cspec = JSON.parse(hit.spec);
      const overrides: Record<string, string> = {};
      for (const m of cspec.manual ?? []) overrides[`${m.table},${m.row},${m.col},${m.p ?? 0}`] = m.role;
      if (Object.keys(overrides).length) cached = { overrides, label: hit.label };
    }
  } catch { /* 캐시 조회 실패는 무시 */ }

  return Response.json({ coverage, grid: slimGrid, spec, fingerprint, cached });
}
