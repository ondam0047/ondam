import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readSection0 } from "@/lib/hwpx";
import { resolveForm } from "@/lib/record-resolver";

type Params = { params: Promise<{ id: string }> };

async function getOwnedProgram(userId: number, id: string) {
  const pid = Number(id);
  if (!pid) return null;
  return prisma.program.findFirst({ where: { id: pid, ownerId: userId, active: true } });
}

// PATCH: 양식 업로드(파일) 또는 이름 수정
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

  if (file instanceof Blob && file.size > 0) {
    try {
      const ab = await file.arrayBuffer() as ArrayBuffer;
      const buf = Buffer.from(ab);
      const xml = readSection0(buf);
      const { spec } = resolveForm(xml);
      data.formTemplate = new Uint8Array(ab);
      data.formSpec = JSON.stringify(spec);
    } catch {
      return Response.json({ error: "이 파일은 편집 가능한 .hwpx 가 아닙니다. (.hwp·스캔·PDF 미지원)" }, { status: 422 });
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
