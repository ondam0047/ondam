import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, canAccessService } from "@/lib/auth";
import { isUniqueViolation, parseSaveGuard, RacedCreateError, saveConflictResponse, StaleWriteError } from "@/lib/save-conflict";

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
  // 낙관적 잠금(lib/save-conflict.ts) — 이 창이 불러온 시점의 Record.updatedAt.
  // null = '이 달 저장본이 아직 없다'. 아예 안 보내면 검사하지 않는다(옛 클라이언트 호환).
  baseUpdatedAt?: string | null;
  // 충돌 안내에서 사용자가 '이 창 내용으로 저장'을 고른 경우에만 true.
  overwrite?: boolean;
};

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as Body;
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

  let saved: { id: number; updatedAt: Date | null };
  try {
    saved = await prisma.$transaction(async (tx) => {
      let id: number | null = null;
      if (existing) {
        if (guard.active) {
          // 낙관적 잠금 — 대조와 갱신이 한 문장(UPDATE … WHERE updatedAt=?)이라 검사와 쓰기 사이에
          // 다른 창이 끼어들 틈이 없다. 진 쪽은 count 0 이 되어 아래에서 되돌아간다.
          const hit = guard.base
            ? await tx.record.updateMany({ where: { id: existing.id, updatedAt: guard.base }, data: meta })
            : { count: 0 }; // 이 창은 '저장본이 없다'고 알고 있었는데 이미 있다 → 남의 저장본이다
          if (hit.count === 0) {
            const cur = await tx.record.findUnique({ where: { id: existing.id }, select: { updatedAt: true } });
            // 행이 아직 있으면 그 사이 다른 곳이 저장한 것 → 충돌(작성분을 조용히 덮지 않는다).
            // 행이 사라졌으면 지워진 것 → 새로 만든다(덮어쓸 남의 내용이 없다).
            if (cur) throw new StaleWriteError(existing.id, cur.updatedAt);
          } else {
            id = existing.id;
          }
        } else {
          await tx.record.update({ where: { id: existing.id }, data: meta });
          id = existing.id;
        }
      }
      if (id === null) {
        try {
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
        } catch (e) {
          // 여기서의 P2002 = unique(childServiceId, year, month) → 다른 창이 방금 먼저 만들었다.
          // 회기 unique 위반 등 다른 P2002 는 충돌이 아니므로 그대로 500 으로 흘린다.
          if (isUniqueViolation(e)) throw new RacedCreateError();
          throw e;
        }
      }
      await tx.recordSession.deleteMany({ where: { recordId: id } });
      if (sessionData.length > 0) {
        await tx.recordSession.createMany({
          data: sessionData.map((s) => ({ ...s, recordId: id })),
        });
      }
      // 새 기준시각을 함께 돌려준다 — 화면이 이걸로 자기 값을 갱신해야 다음 저장이
      // 자기 자신과 충돌하지 않는다(자동저장이 1.8초마다 도는 화면에서 제일 중요한 부분).
      const after = await tx.record.findUnique({ where: { id }, select: { updatedAt: true } });
      return { id, updatedAt: after?.updatedAt ?? null };
    });
  } catch (e) {
    const conflict = saveConflictResponse(e);
    if (conflict) return conflict;
    throw e;
  }

  return Response.json({
    ok: true,
    recordId: saved.id,
    updatedAt: saved.updatedAt ? saved.updatedAt.toISOString() : null,
  });
}
