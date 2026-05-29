import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, canAccessService } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const childServiceId = Number(req.nextUrl.searchParams.get("childServiceId"));
  if (!Number.isInteger(childServiceId)) {
    return Response.json({ error: "childServiceId required" }, { status: 400 });
  }
  const cs = await prisma.childService.findUnique({
    where: { id: childServiceId },
    include: { child: true },
  });
  if (!cs || cs.child.centerId !== user.centerId || !canAccessService(user, cs)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const schedules = await prisma.schedule.findMany({
    where: { childServiceId },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: {
      id: true, year: true, month: true,
      target: true, updatedAt: true,
      _count: { select: { sessions: true } },
    },
  });
  return Response.json(schedules);
}
