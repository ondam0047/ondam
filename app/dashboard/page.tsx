import Link from "next/link";
import { prisma } from "@/lib/db";
import { WEEK } from "@/lib/constants";

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
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const todayDay = now.getDate();
  const todayDow = now.getDay(); // 0=일

  // 이번 주 월요일·토요일 계산 (월~토 6일)
  const monOffset = todayDow === 0 ? -6 : 1 - todayDow; // 0=일이면 -6, 1=월이면 0, 2=화면 -1...
  const monDate = new Date(y, now.getMonth(), todayDay + monOffset);
  const weekDates: { d: Date; weekday: string; isToday: boolean }[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(monDate.getFullYear(), monDate.getMonth(), monDate.getDate() + i);
    const isToday = d.toDateString() === now.toDateString();
    weekDates.push({ d, weekday: WEEK[d.getDay()], isToday });
  }

  const [children, therapists, currentSchedules] = await Promise.all([
    prisma.child.findMany({
      where: { active: true },
      include: { therapist: true },
    }),
    prisma.therapist.findMany({
      where: { active: true },
    }),
    prisma.schedule.findMany({
      where: { year: y, month: m },
      include: { sessions: true, child: true },
    }),
  ]);

  const totalSessionsThisMonth = currentSchedules.reduce(
    (s, sch) => s + sch.sessions.length,
    0
  );

  // 이번 주 회기 (월~토 각각)
  const weekSessions: Array<{
    day: string;
    date: string;
    isToday: boolean;
    items: { time: string; name: string; svc: string; tag: "on" | "today" | "todo" }[];
  }> = weekDates.map(({ d, weekday, isToday }) => {
    const items: { time: string; name: string; svc: string; tag: "on" | "today" | "todo" }[] = [];
    if (d.getMonth() + 1 === m && d.getFullYear() === y) {
      const dayN = d.getDate();
      for (const sch of currentSchedules) {
        const sess = sch.sessions.find((s) => s.day === dayN);
        if (sess) {
          items.push({
            time: sess.time.split("~")[0],
            name: sch.child.name,
            svc: sch.serviceType,
            tag: isToday ? "today" : "on",
          });
        }
      }
      items.sort((a, b) => a.time.localeCompare(b.time));
    }
    return {
      day: weekday,
      date: `${d.getMonth() + 1}.${d.getDate()}`,
      isToday,
      items,
    };
  });

  // 서비스 종류별 분포 (아동 기준)
  const distMap = new Map<string, number>();
  for (const c of children) distMap.set(c.serviceType, (distMap.get(c.serviceType) ?? 0) + 1);
  const dist = [...distMap.entries()]
    .map(([name, count]) => ({ name, count, color: SVC_COLORS[name] ?? "var(--primary)" }))
    .sort((a, b) => b.count - a.count);
  const totalChildren = children.length;

  // 치료사별 진행률 (이번 달 회기 수 / 담당아동들의 defaultTarget 합)
  const therStats = therapists.map((t) => {
    const tChildren = children.filter((c) => c.therapistId === t.id);
    const target = tChildren.reduce((s, c) => s + c.defaultTarget, 0);
    const done = currentSchedules
      .filter((sch) => tChildren.some((c) => c.id === sch.childId))
      .reduce((s, sch) => s + sch.sessions.length, 0);
    return { name: t.name, done, total: Math.max(target, done), color: "var(--primary)" };
  }).filter((t) => t.total > 0);

  const isEmpty = children.length === 0 && therapists.length === 0;

  return (
    <>
      <div className="section-head">
        <div>
          <h2>안녕하세요 👋</h2>
          <p>오늘은 {y}년 {m}월 {todayDay}일 ({WEEK[todayDow]}) · {y}년 {m}월 등록된 회기 {totalSessionsThisMonth}건</p>
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
          <div className="value">
            {totalSessionsThisMonth}
            <span style={{ fontSize: 13, color: "var(--text-mute)", fontWeight: 500, marginLeft: 4 }}>회</span>
          </div>
          <div className="delta">저장된 일정표 {currentSchedules.length}건 기준</div>
        </div>
        <div className="stat">
          <div className="label">진행 중인 아동</div>
          <div className="value">
            {children.length}
            <span style={{ fontSize: 13, color: "var(--text-mute)", fontWeight: 500, marginLeft: 4 }}>명</span>
          </div>
          <div className="delta">활동 중</div>
        </div>
        <div className="stat">
          <div className="label">미작성 기록지</div>
          <div className="value" style={{ color: "var(--text-mute)" }}>
            —
          </div>
          <div className="delta">기록지 DB 저장 다음 단계</div>
        </div>
        <div className="stat">
          <div className="label">활동 치료사</div>
          <div className="value">
            {therapists.length}
            <span style={{ fontSize: 13, color: "var(--text-mute)", fontWeight: 500, marginLeft: 4 }}>명</span>
          </div>
          <div className="delta">전체 등록 인원</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
        {/* 이번 주 회기 */}
        <div className="card">
          <div className="card-header">
            <h2>이번 주 회기</h2>
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

        {/* 알림 — 지금은 자리만 */}
        <div className="card">
          <div className="card-header">
            <h2>알림 · 할 일</h2>
          </div>
          <div style={{ padding: "16px 18px", color: "var(--text-mute)", fontSize: 12.5 }}>
            로그인·기록지 DB 저장이 들어가면 자동으로 채워집니다.
            <ul style={{ paddingLeft: 18, marginTop: 8, lineHeight: 1.8 }}>
              <li>미작성 기록지 알림</li>
              <li>회기 시간 변경 요청</li>
              <li>엑셀 업로드 대기</li>
            </ul>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* 서비스 종류별 분포 */}
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

        {/* 치료사별 진행률 */}
        <div className="card">
          <div className="card-header">
            <h2>치료사별 이번 달 진행률</h2>
            <span className="hint">저장된 회기 / 목표 회기 합</span>
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
                    <div className="progress"><i style={{ width: `${pct}%`, background: t.color }} /></div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}
