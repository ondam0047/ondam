import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return Response.json({ error: "id required" }, { status: 400 });
  }
  const schedule = await prisma.schedule.findUnique({
    where: { id },
    include: { sessions: { orderBy: { day: "asc" } }, child: true },
  });
  if (!schedule) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(schedule);
}
