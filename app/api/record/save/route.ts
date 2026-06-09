import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, canAccessService } from "@/lib/auth";

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
  status?: string;
};

type Body = {
  childServiceId: number;
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
  if (!body.childServiceId || !body.year || !body.month) {
    return Response.json({ error: "missing childServiceId/year/month" }, { status: 400 });
  }

  const cs = await prisma.childService.findUnique({
    where: { id: body.childServiceId },
    include: { child: true },
  });
  if (!cs) return Response.json({ error: "service not found" }, { status: 404 });
  if (cs.child.centerId !== user.centerId || !canAccessService(user, cs)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  // 아동 성명·생년월일은 클라이언트 입력이 아니라 권한 검증된 DB 레코드에서 도출 (무결성)
  const meta = {
    org: body.org,
    childName: cs.child.name,
    childBirth: cs.child.birthDate || null,
    opinion: body.opinion || null,
  };

  const existing = await prisma.record.findUnique({
    where: { childServiceId_year_month: { childServiceId: body.childServiceId, year: body.year, month: body.month } },
  });

  let recordId: number;
  if (existing) {
    await prisma.record.update({ where: { id: existing.id }, data: meta });
    await prisma.recordSession.deleteMany({ where: { recordId: existing.id } });
    recordId = existing.id;
  } else {
    const created = await prisma.record.create({
      data: {
        childServiceId: body.childServiceId,
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
        status: s.status || null,
      })),
    });
  }

  return Response.json({ ok: true, recordId });
}
