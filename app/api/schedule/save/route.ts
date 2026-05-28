import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

type SaveBody = {
  childId: number;
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
  sessions: { day: number; time: string; makeup: boolean }[];
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as SaveBody;
  if (!body.childId || !body.year || !body.month) {
    return Response.json({ error: "missing childId/year/month" }, { status: 400 });
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
  };

  // upsert: 같은 (child, year, month) 면 덮어쓰기
  const existing = await prisma.schedule.findUnique({
    where: { childId_year_month: { childId: body.childId, year: body.year, month: body.month } },
  });

  let scheduleId: number;
  if (existing) {
    await prisma.schedule.update({ where: { id: existing.id }, data: meta });
    await prisma.scheduleSession.deleteMany({ where: { scheduleId: existing.id } });
    scheduleId = existing.id;
  } else {
    const created = await prisma.schedule.create({
      data: { childId: body.childId, year: body.year, month: body.month, ...meta },
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

  return Response.json({ ok: true, scheduleId });
}
