import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readSection0 } from "@/lib/hwpx";
import { resolveForm, applyOverrides } from "@/lib/record-resolver";

type Params = { params: Promise<{ id: string }> };

async function getOwnedProgram(userId: number, id: string) {
  const pid = Number(id);
  if (!pid) return null;
  return prisma.program.findFirst({ where: { id: pid, ownerId: userId, active: true } });
}

// GET: 저장된 양식 격자 + 현재 매핑(역할) — 매핑 재수정용
export async function GET(_req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const program = await getOwnedProgram(user.id, id);
  if (!program) return Response.json({ error: "not found" }, { status: 404 });
  if (!program.formTemplate) return Response.json({ error: "양식이 등록되지 않았습니다." }, { status: 400 });

  let xml: string;
  try { xml = readSection0(Buffer.from(program.formTemplate)); }
  catch { return Response.json({ error: "양식 파일을 읽을 수 없어요." }, { status: 422 }); }

  const { coverage, grid } = resolveForm(xml);
  const slimGrid = grid.map((cells) =>
    cells.map((c) => ({ r: c.r, c: c.c, cs: c.cs, rs: c.rs, text: c.text, role: c.role ?? null, p: c.p, paras: c.paras })),
  );
  // 저장된 spec.manual → 클라이언트 override 시드(좌표→역할)
  const overrides: Record<string, string> = {};
  try {
    const spec = JSON.parse(program.formSpec ?? "{}");
    for (const m of spec.manual ?? []) overrides[`${m.table},${m.row},${m.col},${m.p ?? 0}`] = m.role;
  } catch { /* noop */ }

  return Response.json({ coverage, grid: slimGrid, overrides });
}

// PATCH: 양식 업로드(파일) · 이름 수정 · 또는 기존 양식의 매핑만 갱신(overrides)
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const program = await getOwnedProgram(user.id, id);
  if (!program) return Response.json({ error: "not found" }, { status: 404 });

  const fd = await req.formData();
  const name = fd.get("name") ? String(fd.get("name")).trim() : undefined;
  const file = fd.get("file");

  const data: Record<string, unknown> = {};
  if (name) data.name = name;

  const ovRaw = fd.get("overrides");

  if (file instanceof Blob && file.size > 0) {
    // 새 양식 업로드 + (선택)매핑
    try {
      const ab = await file.arrayBuffer() as ArrayBuffer;
      const buf = Buffer.from(ab);
      const xml = readSection0(buf);
      let { spec } = resolveForm(xml);
      if (typeof ovRaw === "string" && ovRaw.length > 1) {
        try { spec = applyOverrides(spec, JSON.parse(ovRaw)); } catch { /* noop */ }
      }
      data.formTemplate = new Uint8Array(ab);
      data.formSpec = JSON.stringify(spec);
    } catch {
      return Response.json({ error: "이 파일은 편집 가능한 .hwpx 가 아닙니다. (.hwp·스캔·PDF 미지원)" }, { status: 422 });
    }
  } else if (typeof ovRaw === "string" && ovRaw.length > 1 && program.formTemplate) {
    // 파일 없이 기존 양식의 매핑만 갱신
    try {
      const xml = readSection0(Buffer.from(program.formTemplate));
      let { spec } = resolveForm(xml);
      spec = applyOverrides(spec, JSON.parse(ovRaw));
      data.formSpec = JSON.stringify(spec);
    } catch {
      return Response.json({ error: "매핑을 갱신하지 못했어요." }, { status: 422 });
    }
  }

  const updated = await prisma.program.update({
    where: { id: program.id },
    data,
    select: { id: true, name: true, formSpec: true },
  });
  return Response.json({ program: updated });
}

// DELETE: 사업 비활성화(소프트 삭제)
export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const program = await getOwnedProgram(user.id, id);
  if (!program) return Response.json({ error: "not found" }, { status: 404 });

  await prisma.program.update({ where: { id: program.id }, data: { active: false } });
  return Response.json({ ok: true });
}
