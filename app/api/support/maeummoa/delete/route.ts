import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const OWNER_EMAIL = "yj2000102@gmail.com";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (user.email.toLowerCase() !== OWNER_EMAIL) return Response.json({ error: "forbidden" }, { status: 403 });

  const { id } = (await req.json()) as { id?: number };
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  await prisma.supportRecord.deleteMany({
    where: { id: Number(id), ownerUserId: user.id, program: "maeummoa" },
  });
  return Response.json({ ok: true });
}
