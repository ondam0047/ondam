import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, canAccessChild } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  // 1) id 로 직접 로드
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const recordId = Number(id);
    const rec = await prisma.record.findUnique({
      where: { id: recordId },
      include: { sessions: { orderBy: { ordinal: "asc" } }, child: true },
    });
    if (!rec) return Response.json({ error: "not found" }, { status: 404 });
    if (rec.child.centerId !== user.centerId || !canAccessChild(user, rec.child)) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    return Response.json(rec);
  }

  // 2) (childId, year, month) 로 찾기 — 없으면 null 반환
  const childId = Number(req.nextUrl.searchParams.get("childId"));
  const year = Number(req.nextUrl.searchParams.get("year"));
  const month = Number(req.nextUrl.searchParams.get("month"));
  if (!Number.isInteger(childId) || !Number.isInteger(year) || !Number.isInteger(month)) {
    return Response.json({ error: "missing childId/year/month" }, { status: 400 });
  }
  const child = await prisma.child.findUnique({ where: { id: childId } });
  if (!child) return Response.json(null);
  if (child.centerId !== user.centerId || !canAccessChild(user, child)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const rec = await prisma.record.findUnique({
    where: { childId_year_month: { childId, year, month } },
    include: { sessions: { orderBy: { ordinal: "asc" } } },
  });
  return Response.json(rec); // null 이어도 OK
}
