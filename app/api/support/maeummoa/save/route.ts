import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as { id?: number; student?: string; payload?: unknown };
  const student = (body.student ?? "").trim() || "(이름 없음)";
  const payload = JSON.stringify(body.payload ?? {});

  if (body.id) {
    // 본인 소유만 수정
    const r = await prisma.supportRecord.updateMany({
      where: { id: Number(body.id), ownerUserId: user.id, program: "maeummoa" },
      data: { student, payload },
    });
    if (r.count === 0) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ id: Number(body.id) });
  }

  const created = await prisma.supportRecord.create({
    data: { ownerUserId: user.id, program: "maeummoa", student, payload },
    select: { id: true },
  });
  return Response.json({ id: created.id });
}
