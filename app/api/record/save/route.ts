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
  retroReason?: string;
  status?: string;
  // 시작·종료시간을 임상가가 직접 고쳤는지. true 면 재시드에서 잠금(엑셀·일정표가 못 덮는다).
  timeFixed?: boolean;
};

type Body = {
  childServiceId: number;
  year: number;
  month: number;
  org: string;
  childName: string;
  childBirth?: string;
  opinion?: string;
  formId?: number; // 출력에 쓸 업로드 양식
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

  // 출력 양식: 내 소유의 record 양식만 기억(아니면 null)
  let formId: number | null = null;
  if (body.formId) {
    const rf = await prisma.recordForm.findFirst({
      where: { id: Number(body.formId), ownerUserId: user.id, kind: "record" },
      select: { id: true },
    });
    formId = rf?.id ?? null;
  }

  // 아동 성명·생년월일은 클라이언트 입력이 아니라 권한 검증된 DB 레코드에서 도출 (무결성)
  const meta = {
    org: body.org,
    childName: cs.child.name,
    childBirth: cs.child.birthDate || null,
    opinion: body.opinion || null,
    formId,
  };

  const existing = await prisma.record.findUnique({
    where: { childServiceId_year_month: { childServiceId: body.childServiceId, year: body.year, month: body.month } },
  });

  // ⚠ 회기 저장은 '전부 지우고 다시 넣기'다. 트랜잭션으로 묶지 않으면 두 문장 사이에서
  //   프로세스가 죽거나(배포 중 pm2 restart) 요청이 겹칠 때 그 달 회기가 0개로 남는다
  //   — 결과 서술·사유·시간·금액이 통째로 사라지고 자동저장이 그 빈 상태를 확정해 버린다.
  const sessionData = body.sessions.map((s) => ({
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
    retroReason: s.retroReason || null,
    status: s.status || null,
    timeFixed: s.timeFixed === true,
  }));

  const recordId = await prisma.$transaction(async (tx) => {
    let id: number;
    if (existing) {
      await tx.record.update({ where: { id: existing.id }, data: meta });
      await tx.recordSession.deleteMany({ where: { recordId: existing.id } });
      id = existing.id;
    } else {
      const created = await tx.record.create({
        data: {
          childServiceId: body.childServiceId,
          year: body.year,
          month: body.month,
          ...meta,
          createdById: user.id,
        },
      });
      id = created.id;
    }
    if (sessionData.length > 0) {
      await tx.recordSession.createMany({
        data: sessionData.map((s) => ({ ...s, recordId: id })),
      });
    }
    return id;
  });

  return Response.json({ ok: true, recordId });
}
