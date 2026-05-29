import Link from "next/link";
import { prisma } from "@/lib/db";
import { WEEK } from "@/lib/constants";
import { requireUser, isAdmin } from "@/lib/auth";

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
  const isAdminUser = isAdmin(user);

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

  // 역할별 데이터 분기
  if (isAdminUser) {
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
  return <TherapistDashboard
    user={user}
    centerId={centerId}
    year={y}
    month={m}
    todayDay={todayDay}
    todayDow={todayDow}
    weekDates={weekDates}
  />;
}

// ─── 원장·행정용 대시보드 — 센터 운영 전체 ────────────────────────────
type CommonProps = {
  user: { name: string; therapistId: number | null };
  centerId: number;
  year: number;
  month: number;
  todayDay: number;
  todayDow: number;
  weekDates: { d: Date; weekday: string; isToday: boolean }[];
};

async function AdminDashboard({ user, centerId, year: y, month: m, todayDay, todayDow, weekDates }: CommonProps) {
  const [children, therapists, currentSchedules, pendingUsers] = await Promise.all([
    prisma.child.findMany({
      where: { centerId, active: true },
      include: { therapist: true },
    }),
    prisma.therapist.findMany({ where: { centerId, active: true } }),
    prisma.schedule.findMany({
      where: { year: y, month: m, child: { centerId } },
      include: { sessions: true, child: true },
    }),
    prisma.user.count({ where: { centerId, role: "THERAPIST", active: false } }),
  ]);

  // 미작성 기록지
  const childIdsWithSchedule = [...new Set(currentSchedules.map((s) => s.childId))];
  const savedRecords = await prisma.record.findMany({
    where: { year: y, month: m, childId: { in: childIdsWithSchedule } },
    select: { childId: true },
  });
  const recordedChildIds = new Set(savedRecords.map((r) => r.childId));
  const unwrittenCount = childIdsWithSchedule.filter((id) => !recordedChildIds.has(id)).length;

  const totalSessionsThisMonth = currentSchedules.reduce((s, sch) => s + sch.sessions.length, 0);

  // 이번 주 회기
  const weekSessions = weekDates.map(({ d, weekday, isToday }) => {
    const items: { time: string; name: string; svc: string }[] = [];
    if (d.getMonth() + 1 === m && d.getFullYear() === y) {
      const dayN = d.getDate();
      for (const sch of currentSchedules) {
        const sess = sch.sessions.find((s) => s.day === dayN);
        if (sess) items.push({
          time: sess.time.split("~")[0],
          name: sch.child.name,
          svc: sch.serviceType,
        });
      }
      items.sort((a, b) => a.time.localeCompare(b.time));
    }
    return { day: weekday, date: `${d.getMonth() + 1}.${d.getDate()}`, isToday, items };
  });

  // 서비스 분포
  const distMap = new Map<string, number>();
  for (const c of children) distMap.set(c.serviceType, (distMap.get(c.serviceType) ?? 0) + 1);
  const dist = [...distMap.entries()]
    .map(([name, count]) => ({ name, count, color: SVC_COLORS[name] ?? "var(--primary)" }))
    .sort((a, b) => b.count - a.count);

  // 치료사별 진행률
  const therStats = therapists.map((t) => {
    const tChildren = children.filter((c) => c.therapistId === t.id);
    const target = tChildren.reduce((s, c) => s + c.defaultTarget, 0);
    const done = currentSchedules
      .filter((sch) => tChildren.some((c) => c.id === sch.childId))
      .reduce((s, sch) => s + sch.sessions.length, 0);
    return { name: t.name, done, total: Math.max(target, done) };
  }).filter((t) => t.total > 0).sort((a, b) => b.done - a.done);

  const isEmpty = children.length === 0 && therapists.length === 0;

  return (
    <>
      <div className="section-head">
        <div>
          <h2>안녕하세요, {user.name} 선생님 👋</h2>
          <p>{y}년 {m}월 {todayDay}일 ({WEEK[todayDow]}) · 센터 전체 회기 {totalSessionsThisMonth}건</p>
        </div>
      </div>

      {isEmpty && (
        <div className="tip">
          💡 아직 데이터가 없어요. <Link href="/import"><b>엑셀 가져오기</b></Link>로 기존 아동·치료사 정보를 한 번에 등록하거나, <Link href="/children/new"><b>아동을 직접 등록</b></Link>해보세요.
        </div>
      )}

      <div className="stats">
        <div className="stat">
          <div className="label">이번 달 회기</div>
          <div className="value">{totalSessionsThisMonth}<span style={{ fontSize: 13, color: "var(--text-mute)", fontWeight: 500, marginLeft: 4 }}>회</span></div>
          <div className="delta">저장된 일정표 {currentSchedules.length}건</div>
        </div>
        <div className="stat">
          <div className="label">활동 아동</div>
          <div className="value">{children.length}<span style={{ fontSize: 13, color: "var(--text-mute)", fontWeight: 500, marginLeft: 4 }}>명</span></div>
          <div className="delta">전체 등록</div>
        </div>
        <div className="stat">
          <div className="label">미작성 기록지</div>
          <div className="value" style={{ color: unwrittenCount > 0 ? "var(--danger)" : "var(--text)" }}>
            {unwrittenCount}<span style={{ fontSize: 13, color: "var(--text-mute)", fontWeight: 500, marginLeft: 4 }}>건</span>
          </div>
          <div className={"delta" + (unwrittenCount > 0 ? " down" : "")}>
            {unwrittenCount > 0 ? "작성 필요" : "모두 작성됨 ✓"}
          </div>
        </div>
        <div className="stat">
          <div className="label">활동 치료사</div>
          <div className="value">{therapists.length}<span style={{ fontSize: 13, color: "var(--text-mute)", fontWeight: 500, marginLeft: 4 }}>명</span></div>
          <div className="delta">
            {pendingUsers > 0 ? (
              <Link href="/therapists" style={{ color: "var(--accent)", fontWeight: 600 }}>
                승인 대기 {pendingUsers}건 →
              </Link>
            ) : "전체 등록 인원"}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
        <WeekScheduleCard weekDates={weekDates} weekSessions={weekSessions} />
        <AlertsCard pendingUsers={pendingUsers} unwrittenCount={unwrittenCount} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <ServiceDistributionCard dist={dist} totalChildren={children.length} />
        <TherapistProgressCard therStats={therStats} />
      </div>
    </>
  );
}

// ─── 치료사용 대시보드 — 본인 업무 중심 ────────────────────────────────
async function TherapistDashboard({ user, centerId, year: y, month: m, todayDay, todayDow, weekDates }: CommonProps) {
  const therapistId = user.therapistId ?? -1;

  const [myChildren, mySchedules] = await Promise.all([
    prisma.child.findMany({
      where: { centerId, active: true, therapistId },
      orderBy: { name: "asc" },
    }),
    prisma.schedule.findMany({
      where: { year: y, month: m, child: { centerId, therapistId } },
      include: { sessions: true, child: true },
    }),
  ]);

  // 미작성 기록지 (내 담당 아동 중)
  const childIdsWithSchedule = [...new Set(mySchedules.map((s) => s.childId))];
  const savedRecords = await prisma.record.findMany({
    where: { year: y, month: m, childId: { in: childIdsWithSchedule } },
    select: { childId: true },
  });
  const recordedChildIds = new Set(savedRecords.map((r) => r.childId));
  const unwrittenChildren = childIdsWithSchedule.filter((id) => !recordedChildIds.has(id));
  const unwrittenCount = unwrittenChildren.length;

  // 오늘 회기 수
  let todaySessions = 0;
  const todaySessionList: { time: string; name: string }[] = [];
  for (const sch of mySchedules) {
    const sess = sch.sessions.find((s) => s.day === todayDay);
    if (sess) {
      todaySessions++;
      todaySessionList.push({ time: sess.time, name: sch.child.name });
    }
  }
  todaySessionList.sort((a, b) => a.time.localeCompare(b.time));

  const totalSessionsThisMonth = mySchedules.reduce((s, sch) => s + sch.sessions.length, 0);
  const targetTotal = myChildren.reduce((s, c) => s + c.defaultTarget, 0);
  const progressPct = targetTotal > 0 ? Math.round((totalSessionsThisMonth / targetTotal) * 100) : 0;

  // 이번 주 내 회기
  const weekSessions = weekDates.map(({ d, weekday, isToday }) => {
    const items: { time: string; name: string; svc: string }[] = [];
    if (d.getMonth() + 1 === m && d.getFullYear() === y) {
      const dayN = d.getDate();
      for (const sch of mySchedules) {
        const sess = sch.sessions.find((s) => s.day === dayN);
        if (sess) items.push({
          time: sess.time.split("~")[0],
          name: sch.child.name,
          svc: sch.serviceType,
        });
      }
      items.sort((a, b) => a.time.localeCompare(b.time));
    }
    return { day: weekday, date: `${d.getMonth() + 1}.${d.getDate()}`, isToday, items };
  });

  // 미작성 아동 이름 추출
  const unwrittenChildNames = myChildren
    .filter((c) => unwrittenChildren.includes(c.id))
    .map((c) => c.name);

  return (
    <>
      <div className="section-head">
        <div>
          <h2>안녕하세요, {user.name} 선생님 👋</h2>
          <p>
            {y}년 {m}월 {todayDay}일 ({WEEK[todayDow]}) ·{" "}
            {todaySessions > 0 ? `오늘 회기 ${todaySessions}건 예정` : "오늘 회기 없음"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="btn btn-ghost" href="/record">기록지 작성</Link>
          <Link className="btn btn-primary" href="/schedule">일정표 만들기</Link>
        </div>
      </div>

      {myChildren.length === 0 && (
        <div className="tip">
          💡 아직 담당 아동이 없어요. 원장님께 아동 배정을 요청해주세요.
        </div>
      )}

      <div className="stats">
        <div className="stat">
          <div className="label">오늘 회기</div>
          <div className="value" style={{ color: todaySessions > 0 ? "var(--primary)" : "var(--text-mute)" }}>
            {todaySessions}<span style={{ fontSize: 13, color: "var(--text-mute)", fontWeight: 500, marginLeft: 4 }}>건</span>
          </div>
          <div className="delta">{todaySessionList.length > 0 ? `첫 회기 ${todaySessionList[0].time.split("~")[0]}` : "예정 없음"}</div>
        </div>
        <div className="stat">
          <div className="label">이번 달 내 회기</div>
          <div className="value">{totalSessionsThisMonth}<span style={{ fontSize: 13, color: "var(--text-mute)", fontWeight: 500, marginLeft: 4 }}>회</span></div>
          <div className="delta">목표 {targetTotal}회 중 {progressPct}%</div>
        </div>
        <div className="stat">
          <div className="label">담당 아동</div>
          <div className="value">{myChildren.length}<span style={{ fontSize: 13, color: "var(--text-mute)", fontWeight: 500, marginLeft: 4 }}>명</span></div>
          <div className="delta">활동 중</div>
        </div>
        <div className="stat">
          <div className="label">미작성 기록지</div>
          <div className="value" style={{ color: unwrittenCount > 0 ? "var(--danger)" : "var(--text)" }}>
            {unwrittenCount}<span style={{ fontSize: 13, color: "var(--text-mute)", fontWeight: 500, marginLeft: 4 }}>건</span>
          </div>
          <div className={"delta" + (unwrittenCount > 0 ? " down" : "")}>
            {unwrittenCount > 0 ? "작성 필요" : "모두 작성됨 ✓"}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
        <WeekScheduleCard
          weekDates={weekDates}
          weekSessions={weekSessions}
          subtitle="내 회기"
        />

        {/* 오늘 회기 상세 */}
        <div className="card">
          <div className="card-header">
            <h2>오늘 회기</h2>
            {todaySessions > 0 && <span className="hint">{todaySessions}건</span>}
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
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* 내 진행률 */}
        <div className="card">
          <div className="card-header">
            <h2>이번 달 진행률</h2>
            <span className="hint">완료 {totalSessionsThisMonth} / 목표 {targetTotal}회</span>
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

        {/* 미작성 아동 */}
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
      </div>
    </>
  );
}

// ─── 공용 카드 컴포넌트 ─────────────────────────────────────────────────

function WeekScheduleCard({
  weekDates, weekSessions, subtitle,
}: {
  weekDates: { d: Date; weekday: string; isToday: boolean }[];
  weekSessions: { day: string; date: string; isToday: boolean; items: { time: string; name: string; svc: string }[] }[];
  subtitle?: string;
}) {
  return (
    <div className="card">
      <div className="card-header">
        <h2>이번 주 회기{subtitle ? ` · ${subtitle}` : ""}</h2>
        <span className="hint">
          {weekDates[0].d.getMonth() + 1}.{weekDates[0].d.getDate()} ({weekDates[0].weekday}) — {weekDates[5].d.getMonth() + 1}.{weekDates[5].d.getDate()} ({weekDates[5].weekday})
        </span>
        <span style={{ flex: 1 }} />
        <Link className="btn btn-ghost btn-sm" href="/schedule">전체 일정 →</Link>
      </div>
      <div style={{ padding: "14px 18px 18px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
          {weekSessions.map((col, i) => (
            <div key={i} style={{
              background: col.isToday ? "var(--primary-soft)" : "var(--surface-2)",
              borderRadius: "var(--r-md)",
              padding: "10px 8px 12px",
              minHeight: 280,
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
  if (unwrittenCount > 0) alerts.push({ kind: "warn", text: `미작성 기록지 ${unwrittenCount}건`, href: "/record" });

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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
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
