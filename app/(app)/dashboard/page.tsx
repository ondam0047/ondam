import Link from "next/link";
import { prisma } from "@/lib/db";
import { WEEK } from "@/lib/constants";
import { requireUser, getEffectiveTherapistId } from "@/lib/auth";

export const dynamic = "force-dynamic";

const SVC_COLORS: Record<string, string> = {
  "언어재활": "var(--primary)",
  "놀이치료": "#8A6F3A",
  "감각통합치료": "#7A4D81",
  "인지재활": "#456C7F",
  "미술심리": "#7A4D81",
  "음악심리": "#456C7F",
};

export default async function DashboardPage() {
  const user = await requireUser();

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const todayDay = now.getDate();
  const todayDow = now.getDay();
  const centerId = user.centerId ?? -1;

  // 이번 주 월~토 6일
  const monOffset = todayDow === 0 ? -6 : 1 - todayDow;
  const monDate = new Date(y, now.getMonth(), todayDay + monOffset);
  const weekDates: { d: Date; weekday: string; isToday: boolean }[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(monDate.getFullYear(), monDate.getMonth(), monDate.getDate() + i);
    weekDates.push({
      d,
      weekday: WEEK[d.getDay()],
      isToday: d.toDateString() === now.toDateString(),
    });
  }

  // 1인 사물함 — 모든 사용자가 본인 데이터만 보는 단일 대시보드.
  // effective therapistId 로 본인 회기만 필터링.
  const myTherapistId = await getEffectiveTherapistId(user);
  return <TherapistDashboard
    user={{ ...user, therapistId: myTherapistId ?? user.therapistId }}
    centerId={centerId}
    year={y}
    month={m}
    todayDay={todayDay}
    todayDow={todayDow}
    weekDates={weekDates}
  />;
}

type CommonProps = {
  user: { name: string; therapistId: number | null };
  centerId: number;
  year: number;
  month: number;
  todayDay: number;
  todayDow: number;
  weekDates: { d: Date; weekday: string; isToday: boolean }[];
};

// ─── 치료사 대시보드 ────────────────────────────────────────────────────
async function TherapistDashboard({ user, centerId, year: y, month: m, todayDay, todayDow, weekDates }: CommonProps) {
  const data = await loadMyStats(centerId, user.therapistId, y, m, weekDates, todayDay);

  return (
    <>
      <div className="section-head">
        <div>
          <h2>안녕하세요, {user.name} 선생님</h2>
          <p>
            {y}년 {m}월 {todayDay}일 ({WEEK[todayDow]}) ·{" "}
            {data.todaySessions > 0 ? `오늘 회기 ${data.todaySessions}건 예정` : "오늘 회기 없음"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link
            className="btn"
            href="/export"
            style={{
              background: "linear-gradient(135deg, #9FD6C0, #1F7A52)",
              color: "#fff", border: "1px solid #1F7A52",
              fontWeight: 700, padding: "12px 18px", fontSize: 14,
              boxShadow: "0 2px 6px rgba(31,122,82,0.25)",
            }}
          >
            일괄 다운로드
          </Link>
          <Link
            className="btn"
            href="/record"
            style={{
              background: "linear-gradient(135deg, #FBC4B0, #C8554E)",
              color: "#fff", border: "1px solid #C8554E",
              fontWeight: 700, padding: "12px 18px", fontSize: 14,
              boxShadow: "0 2px 6px rgba(200,85,78,0.25)",
            }}
          >
            기록지 작성
          </Link>
          <Link className="btn btn-primary" href="/schedule" style={{ padding: "12px 18px", fontWeight: 700 }}>
            일정표 만들기
          </Link>
        </div>
      </div>

      {data.myChildrenCount === 0 && (
        <div className="tip">
          아직 담당 아동이 없어요.{" "}
          <Link href="/children/new" style={{ color: "var(--primary)", fontWeight: 700 }}>
            아동 등록
          </Link>{" "}
          으로 시작하세요.
        </div>
      )}

      <MyStats data={data} />

      <div className="dash-row-2">
        <WeekScheduleCard weekDates={weekDates} weekSessions={data.weekSessions} />
        <TodaySessionsCard todaySessionList={data.todaySessionList} />
      </div>

      <div className="dash-row-equal">
        <MyProgressCard
          totalSessions={data.totalSessionsThisMonth}
          targetTotal={data.targetTotal}
          progressPct={data.progressPct}
        />
        <UnwrittenCard
          unwrittenCount={data.unwrittenCount}
          unwrittenChildNames={data.unwrittenChildNames}
        />
      </div>
    </>
  );
}

// ─── 데이터 로딩 헬퍼 ────────────────────────────────────────────────────

async function loadMyStats(
  centerId: number,
  therapistId: number | null,
  y: number,
  m: number,
  weekDates: { d: Date; weekday: string; isToday: boolean }[],
  todayDay: number,
) {
  const tid = therapistId ?? -1;
  const [myServices, mySchedules] = await Promise.all([
    prisma.childService.findMany({
      where: { active: true, therapistId: tid, child: { centerId, active: true } },
      include: { child: true },
      orderBy: [{ child: { name: "asc" } }, { id: "asc" }],
    }),
    prisma.schedule.findMany({
      where: {
        year: y, month: m,
        childService: { therapistId: tid, child: { centerId } },
      },
      include: { sessions: true, childService: { include: { child: true } } },
    }),
  ]);

  // 미작성 = 일정표는 있는데 기록지가 없는 ChildService
  const csIdsWithSchedule = [...new Set(mySchedules.map((s) => s.childServiceId))];
  const savedRecords = await prisma.record.findMany({
    where: { year: y, month: m, childServiceId: { in: csIdsWithSchedule } },
    select: { childServiceId: true },
  });
  const recordedCsIds = new Set(savedRecords.map((r) => r.childServiceId));
  const unwrittenCsIds = csIdsWithSchedule.filter((id) => !recordedCsIds.has(id));
  const unwrittenCount = unwrittenCsIds.length;

  // 미작성 아동(서비스) 이름 — 한 아동에 여러 서비스면 "이름·서비스" 로 구분
  const csById = new Map(myServices.map((s) => [s.id, s]));
  const childIdCount = new Map<number, number>();
  for (const s of myServices) childIdCount.set(s.childId, (childIdCount.get(s.childId) ?? 0) + 1);
  const unwrittenChildNames = unwrittenCsIds
    .map((id) => csById.get(id))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .map((s) => (childIdCount.get(s.childId) ?? 1) > 1 ? `${s.child.name} · ${s.serviceType}` : s.child.name);

  let todaySessions = 0;
  const todaySessionList: { time: string; name: string }[] = [];
  for (const sch of mySchedules) {
    const sess = sch.sessions.find((s) => s.day === todayDay);
    if (sess) {
      todaySessions++;
      todaySessionList.push({ time: sess.time, name: sch.childService.child.name });
    }
  }
  todaySessionList.sort((a, b) => a.time.localeCompare(b.time));

  const totalSessionsThisMonth = mySchedules.reduce((s, sch) => s + sch.sessions.length, 0);
  const targetTotal = myServices.reduce((s, c) => s + c.defaultTarget, 0);
  const progressPct = targetTotal > 0 ? Math.round((totalSessionsThisMonth / targetTotal) * 100) : 0;

  const weekSessions = weekDates.map(({ d, weekday, isToday }) => {
    const items: { time: string; name: string; svc: string }[] = [];
    if (d.getMonth() + 1 === m && d.getFullYear() === y) {
      const dayN = d.getDate();
      for (const sch of mySchedules) {
        const sess = sch.sessions.find((s) => s.day === dayN);
        if (sess) items.push({
          time: sess.time.split("~")[0],
          name: sch.childService.child.name,
          svc: sch.serviceType,
        });
      }
      items.sort((a, b) => a.time.localeCompare(b.time));
    }
    return { day: weekday, date: `${d.getMonth() + 1}.${d.getDate()}`, isToday, items };
  });

  return {
    myChildrenCount: new Set(myServices.map((s) => s.childId)).size,
    todaySessions,
    todaySessionList,
    totalSessionsThisMonth,
    targetTotal,
    progressPct,
    unwrittenCount,
    unwrittenChildNames,
    weekSessions,
  };
}

// ─── 공용 카드 컴포넌트 ─────────────────────────────────────────────────

function MyStats({ data }: { data: Awaited<ReturnType<typeof loadMyStats>> }) {
  return (
    <div className="stats">
      <div className="stat">
        <div className="label">오늘 회기</div>
        <div className="value" style={{ color: data.todaySessions > 0 ? "var(--primary)" : "var(--text-mute)" }}>
          {data.todaySessions}<span style={{ fontSize: 13, color: "var(--text-mute)", fontWeight: 500, marginLeft: 4 }}>건</span>
        </div>
        <div className="delta">{data.todaySessionList.length > 0 ? `첫 회기 ${data.todaySessionList[0].time.split("~")[0]}` : "예정 없음"}</div>
      </div>
      <div className="stat">
        <div className="label">이번 달 회기</div>
        <div className="value">{data.totalSessionsThisMonth}<span style={{ fontSize: 13, color: "var(--text-mute)", fontWeight: 500, marginLeft: 4 }}>회</span></div>
        <div className="delta">목표 {data.targetTotal}회 중 {data.progressPct}%</div>
      </div>
      <div className="stat">
        <div className="label">담당 아동</div>
        <div className="value">{data.myChildrenCount}<span style={{ fontSize: 13, color: "var(--text-mute)", fontWeight: 500, marginLeft: 4 }}>명</span></div>
        <div className="delta">활동 중</div>
      </div>
      <div className="stat">
        <div className="label">미작성 기록지</div>
        <div className="value" style={{ color: data.unwrittenCount > 0 ? "var(--danger)" : "var(--text)" }}>
          {data.unwrittenCount}<span style={{ fontSize: 13, color: "var(--text-mute)", fontWeight: 500, marginLeft: 4 }}>건</span>
        </div>
        <div className={"delta" + (data.unwrittenCount > 0 ? " down" : "")}>
          {data.unwrittenCount > 0 ? "작성 필요" : "모두 작성됨 ✓"}
        </div>
      </div>
    </div>
  );
}

function TodaySessionsCard({ todaySessionList }: { todaySessionList: { time: string; name: string }[] }) {
  return (
    <div className="card">
      <div className="card-header">
        <h2>오늘 회기</h2>
        {todaySessionList.length > 0 && <span className="hint">{todaySessionList.length}건</span>}
      </div>
      <div style={{ padding: "12px 18px" }}>
        {todaySessionList.length === 0 ? (
          <div className="placeholder" style={{ padding: 16 }}>오늘 예정된 회기가 없어요.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {todaySessionList.map((s, i) => (
              <div key={i} style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                background: "var(--surface-2)",
                borderRadius: "var(--r-sm)",
                borderLeft: "3px solid var(--primary)",
              }}>
                <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "var(--primary)", minWidth: 100 }}>
                  {s.time}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MyProgressCard({
  totalSessions, targetTotal, progressPct,
}: { totalSessions: number; targetTotal: number; progressPct: number }) {
  return (
    <div className="card">
      <div className="card-header">
        <h2>이번 달 진행률</h2>
        <span className="hint">완료 {totalSessions} / 목표 {targetTotal}회</span>
      </div>
      <div style={{ padding: "22px 22px 26px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 700, letterSpacing: "-0.03em" }}>
            {progressPct}<span style={{ fontSize: 18 }}>%</span>
          </span>
          <span className="sub-mute">완료</span>
        </div>
        <div className="progress" style={{ height: 10 }}>
          <i style={{ width: `${Math.min(progressPct, 100)}%`, background: "var(--primary)" }} />
        </div>
      </div>
    </div>
  );
}

function UnwrittenCard({
  unwrittenCount, unwrittenChildNames,
}: { unwrittenCount: number; unwrittenChildNames: string[] }) {
  return (
    <div className="card">
      <div className="card-header">
        <h2>미작성 기록지</h2>
        {unwrittenCount > 0 && <span className="badge badge-warn">{unwrittenCount}건</span>}
      </div>
      <div style={{ padding: "12px 18px 18px" }}>
        {unwrittenCount === 0 ? (
          <div className="placeholder" style={{ padding: 16 }}>모든 회기 기록지가 작성됐어요 ✓</div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {unwrittenChildNames.map((name) => (
                <div key={name} style={{
                  padding: "8px 12px",
                  background: "#FBEAE7",
                  borderRadius: "var(--r-sm)",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--danger)",
                }}>
                  {name}
                </div>
              ))}
            </div>
            <Link className="btn btn-primary btn-sm" href="/record" style={{ marginTop: 12, width: "100%", justifyContent: "center" }}>
              기록지 작성하러 가기 →
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

function WeekScheduleCard({
  weekDates, weekSessions,
}: {
  weekDates: { d: Date; weekday: string; isToday: boolean }[];
  weekSessions: { day: string; date: string; isToday: boolean; items: { time: string; name: string; svc: string }[] }[];
}) {
  return (
    <div className="card">
      <div className="card-header">
        <h2>이번 주 회기</h2>
        <span className="hint">
          {weekDates[0].d.getMonth() + 1}.{weekDates[0].d.getDate()} ({weekDates[0].weekday}) — {weekDates[5].d.getMonth() + 1}.{weekDates[5].d.getDate()} ({weekDates[5].weekday})
        </span>
        <span style={{ flex: 1 }} />
        <Link className="btn btn-ghost btn-sm" href="/timetable">전체 일정 →</Link>
      </div>
      <div style={{ padding: "14px 18px 18px" }}>
        <div className="dash-week">
          {weekSessions.map((col, i) => (
            <div key={i} style={{
              background: col.isToday ? "var(--primary-soft)" : "var(--surface-2)",
              borderRadius: "var(--r-md)",
              padding: "10px 8px 12px",
              minHeight: 220,
              border: col.isToday ? "1px solid var(--primary)" : "1px solid var(--border)",
            }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, padding: "0 4px" }}>
                <span style={{ fontWeight: 700, color: col.isToday ? "var(--primary)" : "var(--text)", fontSize: 13 }}>{col.day}</span>
                <span style={{ fontSize: 11, color: "var(--text-mute)", fontVariantNumeric: "tabular-nums" }}>{col.date}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {col.items.length === 0 && (
                  <div style={{ fontSize: 11, color: "var(--text-mute)", padding: "8px 4px", textAlign: "center" }}>회기 없음</div>
                )}
                {col.items.map((it, j) => (
                  <div key={j} style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderLeft: `3px solid ${col.isToday ? "var(--primary)" : SVC_COLORS[it.svc] ?? "var(--primary)"}`,
                    borderRadius: "var(--r-xs)",
                    padding: "6px 8px",
                    fontSize: 11.5,
                    lineHeight: 1.3,
                  }}>
                    <div style={{ fontSize: 10.5, color: "var(--text-mute)", fontVariantNumeric: "tabular-nums" }}>{it.time}</div>
                    <div style={{ fontWeight: 600, marginTop: 1 }}>{it.name}</div>
                    <div style={{ fontSize: 10.5, color: "var(--text-mute)" }}>{it.svc}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

