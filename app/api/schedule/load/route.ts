import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, canAccessService } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  // 1) id 로 직접 로드
  const idRaw = req.nextUrl.searchParams.get("id");
  if (idRaw) {
    const id = Number(idRaw);
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

  // 2) (childServiceId, year, month) 로 로드 — 없으면 null
  const csId = Number(req.nextUrl.searchParams.get("childServiceId"));
  const year = Number(req.nextUrl.searchParams.get("year"));
  const month = Number(req.nextUrl.searchParams.get("month"));
  if (!Number.isInteger(csId) || !Number.isInteger(year) || !Number.isInteger(month)) {
    return Response.json({ error: "id or (childServiceId/year/month) required" }, { status: 400 });
  }
  const cs = await prisma.childService.findUnique({
    where: { id: csId },
    include: { child: true },
  });
  if (!cs) return Response.json(null);
  if (cs.child.centerId !== user.centerId || !canAccessService(user, cs)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const schedule = await prisma.schedule.findUnique({
    where: { childServiceId_year_month: { childServiceId: csId, year, month } },
    include: {
      sessions: { orderBy: { day: "asc" } },
      childService: { include: { child: true } },
    },
  });
  return Response.json(schedule);
}
