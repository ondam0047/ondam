import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canAddProgram, maxCustomPrograms } from "@/lib/plan";
import { readSection0 } from "@/lib/hwpx";
import { resolveForm } from "@/lib/record-resolver";

async function getPlanUser(userId: number) {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true, trialEndsAt: true } });
  return { plan: row?.plan ?? "trial", trialEndsAt: row?.trialEndsAt ?? null };
}

// GET: 내 커스텀 사업 목록
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const [programs, planUser] = await Promise.all([
    prisma.program.findMany({
      where: { ownerId: user.id, active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, formSpec: true, createdAt: true },
    }),
    getPlanUser(user.id),
  ]);
  return Response.json({ programs, limit: maxCustomPrograms(planUser) });
}

// POST: 커스텀 사업 생성 (name 필수, file 선택)
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const [count, planUser] = await Promise.all([
    prisma.program.count({ where: { ownerId: user.id, active: true } }),
    getPlanUser(user.id),
  ]);
  if (!canAddProgram(planUser, count)) {
    return Response.json({ error: `사업 추가 한도(${maxCustomPrograms(planUser)}개)에 도달했습니다.` }, { status: 403 });
  }

  const fd = await req.formData();
  const name = String(fd.get("name") ?? "").trim();
  if (!name) return Response.json({ error: "사업 이름을 입력하세요." }, { status: 400 });

  const file = fd.get("file");
  let formTemplate: Uint8Array | null = null;
  let formSpec: string | null = null;

  if (file instanceof Blob && file.size > 0) {
    try {
      const ab = await file.arrayBuffer() as ArrayBuffer;
      const buf = Buffer.from(ab);
      const xml = readSection0(buf);
      const { spec } = resolveForm(xml);
      formTemplate = new Uint8Array(ab);
      formSpec = JSON.stringify(spec);
    } catch {
      return Response.json({ error: "이 파일은 편집 가능한 .hwpx 가 아닙니다. (.hwp·스캔·PDF 미지원)" }, { status: 422 });
    }
  }

  const program = await prisma.program.create({
    data: {
      ownerId: user.id,
      name,
      formTemplate: formTemplate ?? undefined,
      formSpec: formSpec ?? undefined,
    },
    select: { id: true, name: true, formSpec: true },
  });

  return Response.json({ program }, { status: 201 });
}
