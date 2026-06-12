import Link from "next/link";
import { prisma } from "@/lib/db";
import { WEEK } from "@/lib/constants";
import { requireUser, getEffectiveTherapistId } from "@/lib/auth";
import DashboardSearch from "./DashboardSearch";

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
  user: { id: number; name: string; therapistId: number | null };
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
  // 저장한 '우리 센터 양식'(기록지) 보유 여부 — 시작 가이드 선택 단계용.
  const hasForm = (await prisma.recordForm.count({ where: { ownerUserId: user.id, kind: "record" } })) > 0;

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
            href="/month"
            style={{
              background: "linear-gradient(135deg, #9FD6C0, #1F7A52)",
              color: "#fff", border: "1px solid #1F7A52",
              fontWeight: 700, padding: "12px 18px", fontSize: 14,
              boxShadow: "0 2px 6px rgba(31,122,82,0.25)",
            }}
          >
            이번 달 마감
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

      <DashboardSearch />

      <StartChecklist hasChild={data.hasChild} hasSchedule={data.hasSchedule} hasRecord={data.hasRecord} hasForm={hasForm} />
      {data.hasChild && data.hasSchedule && data.hasRecord && (
        <MonthFocusBanner month={m} unwrittenCount={data.unwrittenCount} totalSessions={data.totalSessionsThisMonth} />
      )}

      <MyStats data={data} />

      <div className="dash-row-2">
        <WeekScheduleCard weekDates={weekDates} weekSessions={data.weekSessions} />
        <TodaySessionsCard todaySessionList={data.todaySessionList} ym={`${y}-${m}`} />
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
          ym={`${y}-${m}`}
        />
      </div>
    </>
  );
}

// ─── 시작 가이드 체크리스트 ──────────────────────────────────────────────
// 신규 사용자가 "첫 기록지"까지 가는 골든 패스. 3단계 모두 끝나면 자동으로 사라짐.
function StartChecklist({ hasChild, hasSchedule, hasRecord, hasForm }: { hasChild: boolean; hasSchedule: boolean; hasRecord: boolean; hasForm: boolean }) {
  const steps = [
    { done: hasChild, title: "첫 아동 등록", desc: "담당 아동을 추가해요.", href: "/children/new", cta: "아동 등록" },
    { done: hasSchedule, title: "이번 달 일정 만들기", desc: "회기 일정을 짜두면 기록지가 자동으로 채워져요.", href: "/schedule", cta: "일정표 가기" },
    { done: hasRecord, title: "첫 기록지 받기", desc: "일정에서 기록지를 자동 생성해 내려받아요.", href: "/record", cta: "기록지 가기" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount >= steps.length) return null;
  const nextIdx = steps.findIndex((s) => !s.done);

  return (
    <div className="card" style={{ borderColor: "var(--primary)" }}>
      <div className="card-body">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>🚀 시작 가이드</div>
          <div className="sub-mute" style={{ fontSize: 12 }}>{doneCount}/{steps.length} 완료</div>
        </div>
        <div className="sub-mute" style={{ fontSize: 12, marginBottom: 12 }}>
          처음이세요? 먼저{" "}
          <Link href="/center" style={{ color: "var(--primary)", fontWeight: 700 }}>내 설정</Link>
          에서 센터·회기 시간대를 확인하고, 아래 순서대로 따라오시면 첫 기록지까지 끝나요.{" "}
          <a href="/api/record/sample" style={{ color: "var(--primary)", fontWeight: 700 }}>📄 샘플 기록지 먼저 보기</a>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {!hasForm && (
            <div style={{
              display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
              borderRadius: "var(--r-md)", background: "var(--surface-2)", border: "1px dashed var(--border)",
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: "50%", flex: "0 0 auto",
                display: "grid", placeItems: "center", fontSize: 14,
                background: "var(--surface)", border: "1px solid var(--border)",
              }}>📄</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  우리 센터 양식 올리기 <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-mute)" }}>(선택)</span>
                </div>
                <div className="sub-mute" style={{ fontSize: 12 }}>
                  센터 양식이 따로 있으면 <b>먼저</b> 올려두세요 — 첫 기록지부터 그 양식으로 나와요. 없으면 건너뛰어도 돼요(표준 서식).
                </div>
              </div>
              <Link className="btn" href="/forms" style={{ padding: "8px 14px", fontWeight: 700, whiteSpace: "nowrap" }}>양식 올리기</Link>
            </div>
          )}
          {steps.map((s, i) => {
            const isNext = i === nextIdx;
            return (
              <div
                key={i}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
                  borderRadius: "var(--r-md)",
                  background: isNext ? "var(--primary-soft)" : "transparent",
                  opacity: s.done ? 0.55 : 1,
                }}
              >
                <div style={{
                  width: 26, height: 26, borderRadius: "50%", flex: "0 0 auto",
                  display: "grid", placeItems: "center", fontSize: 13, fontWeight: 800,
                  color: s.done || isNext ? "#fff" : "var(--text-mute)",
                  background: s.done ? "var(--success)" : isNext ? "var(--primary)" : "var(--border)",
                }}>
                  {s.done ? "✓" : i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, textDecoration: s.done ? "line-through" : "none" }}>{s.title}</div>
                  {!s.done && <div className="sub-mute" style={{ fontSize: 12 }}>{s.desc}</div>}
                </div>
                {isNext && (
                  <Link className="btn btn-primary" href={s.href} style={{ padding: "8px 14px", fontWeight: 700, whiteSpace: "nowrap" }}>
                    {s.cta}
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── 이번 달 행동 배너 (온보딩 끝난 사용자 홈) ────────────────────────────
// 지표판 대신 "지금 할 일"을 맨 위에. 이번 달 일정 없음 → 일정 만들기 /
// 미작성 있음 → 이어서 작성 / 다 됨 → 일괄 다운로드.
function MonthFocusBanner({ month, unwrittenCount, totalSessions }: { month: number; unwrittenCount: number; totalSessions: number }) {
  const wrap = (accent: string, title: React.ReactNode, desc: string, href: string, cta: string, primary = true) => (
    <div className="card" style={{ borderColor: accent }}>
      <div className="card-body" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{title}</div>
          <div className="sub-mute" style={{ fontSize: 13 }}>{desc}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", whiteSpace: "nowrap" }}>
          <Link className={primary ? "btn btn-primary" : "btn"} href={href} style={{ padding: "10px 18px", fontWeight: 700 }}>{cta}</Link>
          {href !== "/month" && <Link className="btn btn-ghost btn-sm" href="/month">이번 달 현황 →</Link>}
        </div>
      </div>
    </div>
  );
  if (totalSessions === 0) {
    return wrap("var(--primary)", `${month}월 일정을 만들어 시작하세요`, "회기 일정을 짜두면 기록지가 자동으로 채워져요.", "/schedule", "일정표 만들기");
  }
  if (unwrittenCount > 0) {
    return wrap("var(--danger)", <>이번 달 기록지 <span style={{ color: "var(--danger)" }}>{unwrittenCount}명</span> 작성 남음</>, `${month}월 회기 중 아직 기록지가 없는 아동이에요.`, "/record", "이어서 작성");
  }
  return wrap("var(--success)", "이번 달 기록지 모두 작성 완료 🎉", `${month}월 작업이 끝났어요. 여러 명을 한 번에 내려받을 수 있어요.`, "/month", "이번 달 마감", false);
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
    .map((s) => ({
      csId: s.id,
      label: (childIdCount.get(s.childId) ?? 1) > 1 ? `${s.child.name} · ${s.serviceType}` : s.child.name,
    }));

  let todaySessions = 0;
  const todaySessionList: { time: string; name: string; csId: number }[] = [];
  for (const sch of mySchedules) {
    const sess = sch.sessions.find((s) => s.day === todayDay);
    if (sess) {
      todaySessions++;
      todaySessionList.push({ time: sess.time, name: sch.childService.child.name, csId: sch.childServiceId });
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

  const [everScheduleCount, everRecordCount] = await Promise.all([
    prisma.schedule.count({ where: { childService: { therapistId: tid, child: { centerId } } } }),
    prisma.record.count({ where: { childService: { therapistId: tid, child: { centerId } } } }),
  ]);

  return {
    hasChild: myServices.length > 0,
    hasSchedule: everScheduleCount > 0,
    hasRecord: everRecordCount > 0,
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

function TodaySessionsCard({ todaySessionList, ym }: { todaySessionList: { time: string; name: string; csId: number }[]; ym: string }) {
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
              <Link key={i} href={`/record?cs=${s.csId}&ym=${ym}`} title="기록지 작성" style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                background: "var(--surface-2)",
                borderRadius: "var(--r-sm)",
                borderLeft: "3px solid var(--primary)",
                textDecoration: "none",
                color: "inherit",
              }}>
                <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "var(--primary)", minWidth: 100 }}>
                  {s.time}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</div>
              </Link>
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
  unwrittenCount, unwrittenChildNames, ym,
}: { unwrittenCount: number; unwrittenChildNames: { csId: number; label: string }[]; ym: string }) {
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
              {unwrittenChildNames.map((it) => (
                <Link key={it.csId} href={`/record?cs=${it.csId}&ym=${ym}`} title="이 아동 기록지 작성" style={{
                  display: "block",
                  padding: "8px 12px",
                  background: "#FBEAE7",
                  borderRadius: "var(--r-sm)",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--danger)",
                  textDecoration: "none",
                }}>
                  {it.label} →
                </Link>
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

