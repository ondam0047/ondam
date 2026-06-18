import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const children = await prisma.toolChild.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, memo: true, createdAt: true },
  });
  return Response.json({ children });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { name?: string; memo?: string };
  const name = String(body.name ?? "").trim();
  if (!name) return Response.json({ error: "이름을 입력하세요." }, { status: 400 });

  const child = await prisma.toolChild.create({
    data: { ownerId: user.id, name, memo: body.memo?.trim() || null },
    select: { id: true, name: true, memo: true, createdAt: true },
  });
  return Response.json({ child }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!id) return Response.json({ error: "missing id" }, { status: 400 });

  const child = await prisma.toolChild.findFirst({ where: { id, ownerId: user.id } });
  if (!child) return Response.json({ error: "not found" }, { status: 404 });

  await prisma.toolChild.delete({ where: { id } });
  return Response.json({ ok: true });
}
