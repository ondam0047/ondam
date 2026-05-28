import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { id } = (await req.json()) as { id: number };
  if (!Number.isInteger(id)) {
    return Response.json({ error: "id required" }, { status: 400 });
  }
  await prisma.schedule.delete({ where: { id } });
  return Response.json({ ok: true });
}
