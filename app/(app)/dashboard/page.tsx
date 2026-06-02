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

  // 1인 사물함 모드 — 모든 사용자가 본인 데이터만 보는 단일 대시보드
  // (역할에 관계없이 동일. 행정만 옛 센터 전체 뷰 사용)
  if (user.role === "ADMIN") {
    return <AdminDashboard
      user={user}
      centerId={centerId}
      year={y}
      month={m}
      todayDay={todayDay}
      todayDow={todayDow}
      weekDates={weekDates}
    />;
  }
  // OWNER 도 자동으로 본인의 Therapist 레코드와 연결돼 있어 본인 데이터만 보임
  // (effective therapistId 로 필터링)
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

// ─── 행정 전용 대시보드 — 센터 운영 전체 (본인은 치료사가 아님) ─────────
async function AdminDashboard({ user, centerId, year: y, month: m, todayDay, todayDow, weekDates }: CommonProps) {
  const [data, onboard] = await Promise.all([
    loadCenterStats(centerId, y, m, weekDates),
    loadOnboardingState(centerId),
  ]);

  return (
    <>
      <div className="section-head">
        <div>
          <h2>안녕하세요, {user.name} 선생님</h2>
          <p>{y}년 {m}월 {todayDay}일 ({WEEK[todayDow]}) · 센터 전체 회기 {data.totalSessionsThisMonth}건</p>
        </div>
      </div>

      {!onboard.allDone && <OnboardingCard state={onboard} />}

      <CenterStats data={data} />

      <div className="dash-row-2">
        <WeekScheduleCard weekDates={weekDates} weekSessions={data.weekSessions} />
        <AlertsCard pendingUsers={data.pendingUsers} unwrittenCount={data.unwrittenCount} />
      </div>

      <div className="dash-row-equal">
        <ServiceDistributionCard dist={data.dist} totalChildren={data.children.length} />
        <TherapistProgressCard therStats={data.therStats} />
      </div>
    </>
  );
}

// ─── 원장 대시보드 — 본인 회기 + 센터 전체 ──────────────────────────────
async function OwnerDashboard({
  user, centerId, myTherapistId, year: y, month: m, todayDay, todayDow, weekDates,
}: CommonProps & { myTherapistId: number | null }) {
  // 본인 데이터 + 센터 전체 데이터 둘 다 가져오기
  const [myData, centerData, onboard] = await Promise.all([
    loadMyStats(centerId, myTherapistId, y, m, weekDates, todayDay),
    loadCenterStats(centerId, y, m, weekDates),
    loadOnboardingState(centerId),
  ]);

  return (
    <>
      <div className="section-head">
        <div>
          <h2>안녕하세요, {user.name} 원장님</h2>
          <p>
            {y}년 {m}월 {todayDay}일 ({WEEK[todayDow]}) ·{" "}
            {myData.todaySessions > 0 ? `오늘 내 회기 ${myData.todaySessions}건` : "오늘 내 회기 없음"}
            {" · "}센터 전체 {centerData.totalSessionsThisMonth}건
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
            한꺼번에 다운로드
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

      {!onboard.allDone && <OnboardingCard state={onboard} />}

      {/* 본인(원장) 회기 — 치료사 대시보드와 동일 */}
      <div className="dash-section-divider">내 회기 — 본인이 담당하는 아동</div>

      <MyStats data={myData} />

      <div className="dash-row-2">
        <WeekScheduleCard weekDates={weekDates} weekSessions={myData.weekSessions} />
        <TodaySessionsCard todaySessionList={myData.todaySessionList} />
      </div>

      <div className="dash-row-equal">
        <MyProgressCard
          totalSessions={myData.totalSessionsThisMonth}
          targetTotal={myData.targetTotal}
          progressPct={myData.progressPct}
        />
        <UnwrittenCard
          unwrittenCount={myData.unwrittenCount}
          unwrittenChildNames={myData.unwrittenChildNames}
        />
      </div>

      {/* 센터 전체 운영 — 행정 대시보드의 일부 */}
      <div className="dash-section-divider">센터 전체 현황</div>

      <CenterStats data={centerData} />

      <div className="dash-row-equal">
        <ServiceDistributionCard dist={centerData.dist} totalChildren={centerData.children.length} />
        <TherapistProgressCard therStats={centerData.therStats} />
      </div>

      {(centerData.pendingUsers > 0 || centerData.unwrittenCount > 0) && (
        <AlertsCard pendingUsers={centerData.pendingUsers} unwrittenCount={centerData.unwrittenCount} />
      )}
    </>
  );
}

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
            한꺼번에 다운로드
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
            아동 직접 등록
          </Link>{" "}
          또는{" "}
          <Link href="/children" style={{ color: "var(--primary)", fontWeight: 700 }}>
            엑셀로 가져오기
          </Link>{" "}
          로 시작하세요.
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

async function loadCenterStats(
  centerId: number,
  y: number,
  m: number,
  weekDates: { d: Date; weekday: string; isToday: boolean }[],
) {
  const [children, services, therapists, currentSchedules, pendingUsers] = await Promise.all([
    prisma.child.findMany({
      where: { centerId, active: true },
    }),
    prisma.childService.findMany({
      where: { active: true, child: { centerId, active: true } },
    }),
    prisma.therapist.findMany({ where: { centerId, active: true } }),
    prisma.schedule.findMany({
      where: { year: y, month: m, childService: { child: { centerId } } },
      include: { sessions: true, childService: { include: { child: true } } },
    }),
    prisma.user.count({ where: { centerId, role: "THERAPIST", active: false } }),
  ]);

  const csIdsWithSchedule = [...new Set(currentSchedules.map((s) => s.childServiceId))];
  const savedRecords = await prisma.record.findMany({
    where: { year: y, month: m, childServiceId: { in: csIdsWithSchedule } },
    select: { childServiceId: true },
  });
  const recordedCsIds = new Set(savedRecords.map((r) => r.childServiceId));
  const unwrittenCount = csIdsWithSchedule.filter((id) => !recordedCsIds.has(id)).length;
  const totalSessionsThisMonth = currentSchedules.reduce((s, sch) => s + sch.sessions.length, 0);

  const weekSessions = weekDates.map(({ d, weekday, isToday }) => {
    const items: { time: string; name: string; svc: string }[] = [];
    if (d.getMonth() + 1 === m && d.getFullYear() === y) {
      const dayN = d.getDate();
      for (const sch of currentSchedules) {
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

  // 서비스 종류 분포 (ChildService 단위)
  const distMap = new Map<string, number>();
  for (const s of services) distMap.set(s.serviceType, (distMap.get(s.serviceType) ?? 0) + 1);
  const dist = [...distMap.entries()]
    .map(([name, count]) => ({ name, count, color: SVC_COLORS[name] ?? "var(--primary)" }))
    .sort((a, b) => b.count - a.count);

  const therStats = therapists.map((t) => {
    const tServices = services.filter((s) => s.therapistId === t.id);
    const target = tServices.reduce((s, c) => s + c.defaultTarget, 0);
    const done = currentSchedules
      .filter((sch) => tServices.some((s) => s.id === sch.childServiceId))
      .reduce((s, sch) => s + sch.sessions.length, 0);
    return { name: t.name, done, total: Math.max(target, done) };
  }).filter((t) => t.total > 0).sort((a, b) => b.done - a.done);

  return {
    children,
    therapists,
    currentSchedules,
    pendingUsers,
    totalSessionsThisMonth,
    unwrittenCount,
    weekSessions,
    dist,
    therStats,
    isEmpty: children.length === 0 && therapists.length === 0,
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

function CenterStats({ data }: { data: Awaited<ReturnType<typeof loadCenterStats>> }) {
  return (
    <div className="stats">
      <div className="stat">
        <div className="label">이번 달 회기</div>
        <div className="value">{data.totalSessionsThisMonth}<span style={{ fontSize: 13, color: "var(--text-mute)", fontWeight: 500, marginLeft: 4 }}>회</span></div>
        <div className="delta">저장된 일정표 {data.currentSchedules.length}건</div>
      </div>
      <div className="stat">
        <div className="label">활동 아동</div>
        <div className="value">{data.children.length}<span style={{ fontSize: 13, color: "var(--text-mute)", fontWeight: 500, marginLeft: 4 }}>명</span></div>
        <div className="delta">전체 등록</div>
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
      <div className="stat">
        <div className="label">활동 치료사</div>
        <div className="value">{data.therapists.length}<span style={{ fontSize: 13, color: "var(--text-mute)", fontWeight: 500, marginLeft: 4 }}>명</span></div>
        <div className="delta">
          {data.pendingUsers > 0 ? (
            <Link href="/therapists" style={{ color: "var(--accent)", fontWeight: 600 }}>
              승인 대기 {data.pendingUsers}건 →
            </Link>
          ) : "전체 등록 인원"}
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

function AlertsCard({ pendingUsers, unwrittenCount }: { pendingUsers: number; unwrittenCount: number }) {
  const alerts: { kind: "warn" | "info"; text: string; href: string }[] = [];
  if (pendingUsers > 0) alerts.push({ kind: "warn", text: `치료사 가입 승인 대기 ${pendingUsers}건`, href: "/therapists" });
  if (unwrittenCount > 0) alerts.push({ kind: "warn", text: `센터 전체 미작성 기록지 ${unwrittenCount}건`, href: "/record" });

  return (
    <div className="card">
      <div className="card-header">
        <h2>알림 · 할 일</h2>
        {alerts.length > 0 && <span className="badge badge-warn">{alerts.length}</span>}
      </div>
      <div style={{ padding: alerts.length === 0 ? "16px 18px" : 0 }}>
        {alerts.length === 0 ? (
          <div className="sub-mute">처리할 알림이 없어요 ✓</div>
        ) : (
          alerts.map((a, i) => (
            <Link
              key={i}
              href={a.href}
              style={{
                display: "block",
                padding: "13px 18px",
                borderBottom: i < alerts.length - 1 ? "1px solid var(--border)" : "none",
                fontSize: 13,
                color: "var(--text)",
                textDecoration: "none",
              }}
            >
              <span style={{
                display: "inline-block",
                width: 8, height: 8,
                background: "var(--danger)",
                borderRadius: "50%",
                marginRight: 8,
                verticalAlign: "middle",
              }} />
              {a.text}
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

function ServiceDistributionCard({
  dist, totalChildren,
}: {
  dist: { name: string; count: number; color: string }[];
  totalChildren: number;
}) {
  return (
    <div className="card">
      <div className="card-header">
        <h2>서비스 종류별 분포</h2>
        <span className="hint">총 {totalChildren}명</span>
      </div>
      <div style={{ padding: "18px 22px 22px" }}>
        {totalChildren === 0 ? (
          <div className="placeholder">아동을 등록하면 분포가 표시돼요.</div>
        ) : (
          <>
            <div style={{ display: "flex", height: 12, borderRadius: 999, overflow: "hidden", marginBottom: 18, background: "var(--surface-2)" }}>
              {dist.map((d) => (
                <div key={d.name} style={{ background: d.color, width: `${(d.count / totalChildren) * 100}%` }} />
              ))}
            </div>
            <div className="dash-row-equal" style={{ gap: 10 }}>
              {dist.map((d) => (
                <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: d.color }} />
                  <span style={{ fontSize: 13, flex: 1 }}>{d.name}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{d.count}명</span>
                  <span style={{ fontSize: 11.5, color: "var(--text-mute)", minWidth: 36, textAlign: "right" }}>
                    {Math.round((d.count / totalChildren) * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── 온보딩 체크리스트 ──────────────────────────────────────────────────
async function loadOnboardingState(centerId: number) {
  const [center, childCount, scheduleCount] = await Promise.all([
    prisma.center.findUnique({ where: { id: centerId } }),
    prisma.child.count({ where: { centerId, active: true, waiting: false } }),
    prisma.schedule.count({ where: { childService: { child: { centerId } } } }),
  ]);
  // 1인 사물함 모드: 시간대/서비스 종류가 한 번이라도 수정됐는지 체크
  // (기본값 그대로면 namedCenter=false)
  const namedCenter = !!center && center.name !== "내 센터"
    && center.name.trim().length > 0
    && center.address !== null;
  const hasChildren = childCount > 0;
  const hasSchedule = scheduleCount > 0;
  const done = [namedCenter, hasChildren, hasSchedule].filter(Boolean).length;
  return {
    namedCenter, hasChildren, hasSchedule,
    done, total: 3,
    allDone: done >= 3,
  };
}

function OnboardingCard({ state }: { state: Awaited<ReturnType<typeof loadOnboardingState>> }) {
  const items: { ok: boolean; label: string; href: string; cta: string }[] = [
    { ok: state.namedCenter, label: "내 정보 · 시간대 설정",   href: "/center",       cta: "설정하러" },
    { ok: state.hasChildren, label: "첫 아동 등록",            href: "/children/new", cta: "아동 등록" },
    { ok: state.hasSchedule, label: "첫 일정표 작성",          href: "/schedule",     cta: "일정표 만들기" },
  ];
  return (
    <div className="card" style={{
      background: "linear-gradient(135deg, var(--primary-soft), #F8FBFE)",
      borderColor: "var(--primary)",
    }}>
      <div className="card-header" style={{ borderColor: "rgba(91,143,207,0.3)" }}>
        <h2>시작 가이드 ({state.done} / {state.total})</h2>
        <span className="hint">다 끝나면 이 카드는 사라져요</span>
      </div>
      <div style={{ padding: "12px 18px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((it) => (
          <div key={it.label} style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 12px",
            background: it.ok ? "rgba(91,143,207,0.08)" : "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-sm)",
          }}>
            <span style={{ fontSize: 18, width: 22 }}>{it.ok ? "✓" : "○"}</span>
            <span style={{
              flex: 1,
              textDecoration: it.ok ? "line-through" : "none",
              color: it.ok ? "var(--text-mute)" : "var(--text)",
              fontWeight: it.ok ? 500 : 600,
            }}>{it.label}</span>
            {!it.ok && (
              <Link href={it.href} className="btn btn-primary btn-sm">{it.cta} →</Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TherapistProgressCard({ therStats }: { therStats: { name: string; done: number; total: number }[] }) {
  return (
    <div className="card">
      <div className="card-header">
        <h2>치료사별 이번 달 진행률</h2>
        <span className="hint">저장된 회기 / 목표</span>
      </div>
      <div style={{ padding: "18px 22px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
        {therStats.length === 0 ? (
          <div className="placeholder">치료사를 등록하고 일정표를 저장하면 진행률이 표시돼요.</div>
        ) : (
          therStats.map((t) => {
            const pct = t.total > 0 ? Math.round((t.done / t.total) * 100) : 0;
            return (
              <div key={t.name}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</span>
                  <span style={{ fontSize: 12, color: "var(--text-mute)", fontVariantNumeric: "tabular-nums" }}>
                    {t.done}<span style={{ color: "var(--text-mute)" }}> / {t.total}회</span>
                    <span style={{ marginLeft: 8, fontWeight: 600, color: "var(--text)" }}>{pct}%</span>
                  </span>
                </div>
                <div className="progress"><i style={{ width: `${pct}%`, background: "var(--primary)" }} /></div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
