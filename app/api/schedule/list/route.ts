import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, canAccessChild } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const childId = Number(req.nextUrl.searchParams.get("childId"));
  if (!Number.isInteger(childId)) {
    return Response.json({ error: "childId required" }, { status: 400 });
  }
  const child = await prisma.child.findUnique({ where: { id: childId } });
  if (!child || !canAccessChild(user, child)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
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
