import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, canAccessService } from "@/lib/auth";
import { isUniqueViolation, parseSaveGuard, RacedCreateError, saveConflictResponse, StaleWriteError } from "@/lib/save-conflict";

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
  showTypeInCal?: boolean; // 달력 회기 칸에 서비스 종류(언어·놀이·감통) 표기
  formId?: number; // 출력에 쓸 업로드 양식
  sessions: { day: number; time: string; makeup: boolean }[];
  // 낙관적 잠금(lib/save-conflict.ts) — 이 창이 불러온 시점의 Schedule.updatedAt.
  // null = '이 달 저장본이 아직 없다'. 아예 안 보내면 검사하지 않는다(옛 클라이언트 호환).
  baseUpdatedAt?: string | null;
  // 충돌 안내에서 사용자가 '이 창 내용으로 저장'을 고른 경우에만 true.
  overwrite?: boolean;
};

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as SaveBody;
  if (!body.childServiceId || !body.year || !body.month) {
    return Response.json({ error: "missing childServiceId/year/month" }, { status: 400 });
  }

  const parsedGuard = parseSaveGuard(body);
  if (!parsedGuard.ok) return Response.json({ error: "invalid baseUpdatedAt" }, { status: 400 });
  const guard = parsedGuard.guard;

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
    showTypeInCal: body.showTypeInCal === true,
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

  let saved: { id: number; updatedAt: Date | null };
  try {
    saved = await prisma.$transaction(async (tx) => {
      let id: number | null = null;
      if (existing) {
        if (guard.active) {
          // 낙관적 잠금 — 대조와 갱신이 한 문장(UPDATE … WHERE updatedAt=?)이라 검사와 쓰기 사이에
          // 다른 창이 끼어들 틈이 없다. 진 쪽은 count 0 이 되어 아래에서 되돌아간다.
          // (기록지 /api/record/save 와 같은 방식·같은 범위)
          const hit = guard.base
            ? await tx.schedule.updateMany({ where: { id: existing.id, updatedAt: guard.base }, data: meta })
            : { count: 0 }; // 이 창은 '저장본이 없다'고 알고 있었는데 이미 있다 → 남의 저장본이다
          if (hit.count === 0) {
            const cur = await tx.schedule.findUnique({ where: { id: existing.id }, select: { updatedAt: true } });
            // 행이 아직 있으면 그 사이 다른 곳이 저장한 것 → 충돌(한 달치 일정을 조용히 덮지 않는다).
            // 행이 사라졌으면 지워진 것 → 새로 만든다(덮어쓸 남의 내용이 없다).
            if (cur) throw new StaleWriteError(existing.id, cur.updatedAt);
          } else {
            id = existing.id;
          }
        } else {
          await tx.schedule.update({ where: { id: existing.id }, data: meta });
          id = existing.id;
        }
      }
      if (id === null) {
        try {
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
        } catch (e) {
          // 여기서의 P2002 = unique(childServiceId, year, month) → 다른 창이 방금 먼저 만들었다.
          // 회기 unique 위반 등 다른 P2002 는 충돌이 아니므로 그대로 500 으로 흘린다.
          if (isUniqueViolation(e)) throw new RacedCreateError();
          throw e;
        }
      }
      await tx.scheduleSession.deleteMany({ where: { scheduleId: id } });
      if (sessionData.length > 0) {
        await tx.scheduleSession.createMany({
          data: sessionData.map((s) => ({ ...s, scheduleId: id })),
        });
      }
      // 새 기준시각을 함께 돌려준다 — 화면이 이걸로 자기 값을 갱신해야 다음 저장이
      // 자기 자신과 충돌하지 않는다(자동저장이 1.8초마다 도는 화면에서 제일 중요한 부분).
      const after = await tx.schedule.findUnique({ where: { id }, select: { updatedAt: true } });
      return { id, updatedAt: after?.updatedAt ?? null };
    });
  } catch (e) {
    const conflict = saveConflictResponse(e);
    if (conflict) return conflict;
    throw e;
  }
  const scheduleId = saved.id;

  // 서비스 제공자명(제공기관명)을 아동 기본값으로 저장 → 다음 달 불러올 때 자동 유지.
  // 일정표 본체와 달리 '다음 달 편의값'이라 트랜잭션 밖에 둔다 — 이게 실패했다고
  // 방금 저장한 한 달치 일정을 되돌리면 손해가 훨씬 크다.
  if (body.pvOrg && body.pvOrg !== cs.org) {
    await prisma.childService.update({ where: { id: body.childServiceId }, data: { org: body.pvOrg } });
  }

  return Response.json({
    ok: true,
    scheduleId,
    updatedAt: saved.updatedAt ? saved.updatedAt.toISOString() : null,
  });
}
