import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, canAccessService } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  // 1) id 로 직접 로드
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const recordId = Number(id);
    const rec = await prisma.record.findUnique({
      where: { id: recordId },
      include: {
        sessions: { orderBy: { ordinal: "asc" } },
        childService: { include: { child: true } },
      },
    });
    if (!rec) return Response.json({ error: "not found" }, { status: 404 });
    if (rec.childService.child.centerId !== user.centerId || !canAccessService(user, rec.childService)) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    return Response.json(rec);
  }

  // 2) (childServiceId, year, month) 로 찾기 — 없으면 null 반환
  const childServiceId = Number(req.nextUrl.searchParams.get("childServiceId"));
  const year = Number(req.nextUrl.searchParams.get("year"));
  const month = Number(req.nextUrl.searchParams.get("month"));
  if (!Number.isInteger(childServiceId) || !Number.isInteger(year) || !Number.isInteger(month)) {
    return Response.json({ error: "missing childServiceId/year/month" }, { status: 400 });
  }
  const cs = await prisma.childService.findUnique({
    where: { id: childServiceId },
    include: { child: true },
  });
  if (!cs) return Response.json(null);
  if (cs.child.centerId !== user.centerId || !canAccessService(user, cs)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const rec = await prisma.record.findUnique({
    where: { childServiceId_year_month: { childServiceId, year, month } },
    include: { sessions: { orderBy: { ordinal: "asc" } } },
  });
  return Response.json(rec);
}
