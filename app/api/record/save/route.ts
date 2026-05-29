import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, canAccessChild } from "@/lib/auth";

type SessionInput = {
  ordinal: number;
  date?: string;
  startTime?: string;
  endTime?: string;
  voucher?: string;
  extra?: string;
  amount?: string;
  useDay?: string;
  payDay?: string;
  apprNumber?: string;
  result?: string;
  resultExtra?: string;
};

type Body = {
  childId: number;
  year: number;
  month: number;
  org: string;
  childName: string;
  childBirth?: string;
  opinion?: string;
  sessions: SessionInput[];
};

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as Body;
  if (!body.childId || !body.year || !body.month) {
    return Response.json({ error: "missing childId/year/month" }, { status: 400 });
  }

  const child = await prisma.child.findUnique({ where: { id: body.childId } });
  if (!child) return Response.json({ error: "child not found" }, { status: 404 });
  if (child.centerId !== user.centerId) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (!canAccessChild(user, child)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const meta = {
    org: body.org,
    childName: body.childName,
    childBirth: body.childBirth || null,
    opinion: body.opinion || null,
  };

  const existing = await prisma.record.findUnique({
    where: { childId_year_month: { childId: body.childId, year: body.year, month: body.month } },
  });

  let recordId: number;
  if (existing) {
    await prisma.record.update({ where: { id: existing.id }, data: meta });
    await prisma.recordSession.deleteMany({ where: { recordId: existing.id } });
    recordId = existing.id;
  } else {
    const created = await prisma.record.create({
      data: {
        childId: body.childId,
        year: body.year,
        month: body.month,
        ...meta,
        createdById: user.id,
      },
    });
    recordId = created.id;
  }

  if (body.sessions.length > 0) {
    await prisma.recordSession.createMany({
      data: body.sessions.map((s) => ({
        recordId,
        ordinal: s.ordinal,
        date: s.date || null,
        startTime: s.startTime || null,
        endTime: s.endTime || null,
        voucher: s.voucher || null,
        extra: s.extra || null,
        amount: s.amount || null,
        useDay: s.useDay || null,
        payDay: s.payDay || null,
        apprNumber: s.apprNumber || null,
        result: s.result || null,
        resultExtra: s.resultExtra || null,
      })),
    });
  }

  return Response.json({ ok: true, recordId });
}
