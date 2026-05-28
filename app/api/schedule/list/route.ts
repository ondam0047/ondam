import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const childId = Number(req.nextUrl.searchParams.get("childId"));
  if (!Number.isInteger(childId)) {
    return Response.json({ error: "childId required" }, { status: 400 });
  }
  const schedules = await prisma.schedule.findMany({
    where: { childId },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: {
      id: true, year: true, month: true,
      target: true, updatedAt: true,
      _count: { select: { sessions: true } },
    },
  });
  return Response.json(schedules);
}
