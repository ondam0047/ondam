import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, canAccessService } from "@/lib/auth";

type SaveBody = {
  childServiceId: number;
  year: number;
  month: number;
  therapist: string;
  serviceType: string;
  target: number;
  mgmtNumber?: string;
  pvOrg: string;
  pvTel?: string;
  pvCharge?: string;
  pvType: string;
  costUnit: string;
  costSelf: string;
  writeDate?: string;
  formId?: number; // 출력에 쓸 업로드 양식
  sessions: { day: number; time: string; makeup: boolean }[];
};

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as SaveBody;
  if (!body.childServiceId || !body.year || !body.month) {
    return Response.json({ error: "missing childServiceId/year/month" }, { status: 400 });
  }

  const cs = await prisma.childService.findUnique({
    where: { id: body.childServiceId },
    include: { child: true },
  });
  if (!cs || cs.child.centerId !== user.centerId || !canAccessService(user, cs)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  // 출력 양식: 내 소유의 schedule 양식만 기억(아니면 null)
  let formId: number | null = null;
  if (body.formId) {
    const rf = await prisma.recordForm.findFirst({
      where: { id: Number(body.formId), ownerUserId: user.id, kind: "schedule" },
      select: { id: true },
    });
    formId = rf?.id ?? null;
  }

  const meta = {
    therapist: body.therapist,
    serviceType: body.serviceType,
    target: body.target,
    mgmtNumber: body.mgmtNumber || null,
    pvOrg: body.pvOrg,
    pvTel: body.pvTel || null,
    pvCharge: body.pvCharge || null,
    pvType: body.pvType,
    costUnit: body.costUnit,
    costSelf: body.costSelf,
    writeDate: body.writeDate || null,
    formId,
  };

  const existing = await prisma.schedule.findUnique({
    where: { childServiceId_year_month: { childServiceId: body.childServiceId, year: body.year, month: body.month } },
  });

  let scheduleId: number;
  if (existing) {
    await prisma.schedule.update({ where: { id: existing.id }, data: meta });
    await prisma.scheduleSession.deleteMany({ where: { scheduleId: existing.id } });
    scheduleId = existing.id;
  } else {
    const created = await prisma.schedule.create({
      data: {
        childServiceId: body.childServiceId,
        year: body.year,
        month: body.month,
        ...meta,
        createdById: user.id,
      },
    });
    scheduleId = created.id;
  }

  if (body.sessions.length > 0) {
    await prisma.scheduleSession.createMany({
      data: body.sessions.map((s) => ({
        scheduleId, day: s.day, time: s.time, makeup: s.makeup,
      })),
    });
  }

  // 서비스 제공자명(제공기관명)을 아동 기본값으로 저장 → 다음 달 불러올 때 자동 유지
  if (body.pvOrg && body.pvOrg !== cs.org) {
    await prisma.childService.update({ where: { id: body.childServiceId }, data: { org: body.pvOrg } });
  }

  return Response.json({ ok: true, scheduleId });
}
