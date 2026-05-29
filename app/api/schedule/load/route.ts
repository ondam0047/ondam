import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, canAccessService } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return Response.json({ error: "id required" }, { status: 400 });
  }
  const schedule = await prisma.schedule.findUnique({
    where: { id },
    include: {
      sessions: { orderBy: { day: "asc" } },
      childService: { include: { child: true } },
    },
  });
  if (!schedule) return Response.json({ error: "not found" }, { status: 404 });
  if (schedule.childService.child.centerId !== user.centerId || !canAccessService(user, schedule.childService)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  return Response.json(schedule);
}
