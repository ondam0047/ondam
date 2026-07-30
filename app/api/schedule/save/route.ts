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

  // ⚠ 회기 저장은 '전부 지우고 다시 넣기'다. 트랜잭션으로 묶지 않으면 두 문장 사이에서
  //   프로세스가 죽거나(배포 중 pm2 restart) 요청이 겹칠 때 그 달 일정이 0개로 남는다
  //   — 한 달치 회기·시간·보충 표시가 통째로 사라지고 자동저장이 그 빈 상태를 확정해 버린다.
  //   (기록지 /api/record/save 와 같은 방식·같은 범위)
  //   unique(scheduleId, day) 를 다른 창이 동시에 저장해 위반하면 트랜잭션 전체가 되돌아가
  //   먼저 저장한 쪽의 회기가 그대로 살아남고, 진 쪽은 500 을 받아 화면에 실패 배너가 뜬다.
  const sessionData = body.sessions.map((s) => ({
    day: s.day, time: s.time, makeup: s.makeup,
  }));

  const scheduleId = await prisma.$transaction(async (tx) => {
    let id: number;
    if (existing) {
      await tx.schedule.update({ where: { id: existing.id }, data: meta });
      await tx.scheduleSession.deleteMany({ where: { scheduleId: existing.id } });
      id = existing.id;
    } else {
      const created = await tx.schedule.create({
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
      await tx.scheduleSession.createMany({
        data: sessionData.map((s) => ({ ...s, scheduleId: id })),
      });
    }
    return id;
  });

  // 서비스 제공자명(제공기관명)을 아동 기본값으로 저장 → 다음 달 불러올 때 자동 유지.
  // 일정표 본체와 달리 '다음 달 편의값'이라 트랜잭션 밖에 둔다 — 이게 실패했다고
  // 방금 저장한 한 달치 일정을 되돌리면 손해가 훨씬 크다.
  if (body.pvOrg && body.pvOrg !== cs.org) {
    await prisma.childService.update({ where: { id: body.childServiceId }, data: { org: body.pvOrg } });
  }

  return Response.json({ ok: true, scheduleId });
}
