import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { WEEK, holiday } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const user = await requireRole(["OWNER", "ADMIN"]);
  const sp = await searchParams;
  const centerId = user.centerId ?? -1;

  const now = new Date();
  const year = sp.year ? Number(sp.year) : now.getFullYear();
  const month = sp.month ? Number(sp.month) : now.getMonth() + 1;

  // 1인 모드 — 본인 Therapist 만
  const myTherapist = user.therapistId
    ? await prisma.therapist.findUnique({ where: { id: user.therapistId } })
    : await prisma.therapist.findFirst({ where: { centerId, active: true, name: user.name } });

  const schedules = myTherapist
    ? await prisma.schedule.findMany({
        where: {
          year,
          month,
          childService: {
            therapistId: myTherapist.id,
            active: true,
            child: { centerId, active: true },
          },
        },
        include: {
          sessions: { orderBy: { day: "asc" } },
          childService: { include: { child: true } },
        },
      })
    : [];

  // 날짜별 회기 모음
  type DaySession = { time: string; childName: string };
  const byDay: Record<number, DaySession[]> = {};
  for (const sch of schedules) {
    for (const s of sch.sessions) {
      if (!byDay[s.day]) byDay[s.day] = [];
      byDay[s.day].push({ time: s.time, childName: sch.childService.child.name });
    }
  }
  for (const d in byDay) byDay[+d].sort((a, b) => a.time.localeCompare(b.time));

  // 캘린더 격자 (6주 × 7요일)
  const firstDow = new Date(year, month - 1, 1).getDay();
  const dim = new Date(year, month, 0).getDate();
  const totalCells = Math.ceil((firstDow + dim) / 7) * 7;
  const cells: ({ day: number; hn: string | null } | null)[] = [];
  for (let i = 0; i < totalCells; i++) {
    const day = i - firstDow + 1;
    if (day < 1 || day > dim) cells.push(null);
    else cells.push({ day, hn: holiday(year, month, day) });
  }

  const monthOptions: { y: number; m: number }[] = [];
  for (let offset = -2; offset <= 3; offset++) {
    const total = now.getFullYear() * 12 + (now.getMonth() + offset);
    monthOptions.push({ y: Math.floor(total / 12), m: (total % 12) + 1 });
  }

  const totalSessions = Object.values(byDay).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <>
      <div className="section-head">
        <div>
          <h2>내 시간표</h2>
          <p>{myTherapist?.name ?? "치료사"} · {year}년 {month}월 · 총 {totalSessions}회기</p>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <form method="get" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
            <div className="field" style={{ minWidth: 200 }}>
              <label>월</label>
              <select className="select" name="month" defaultValue={month.toString()}>
                {monthOptions.map((o) => (
                  <option key={`${o.y}-${o.m}`} value={o.m}>
                    {o.y}년 {o.m}월
                  </option>
                ))}
              </select>
              <input type="hidden" name="year" value={year} />
            </div>
            <button className="btn btn-primary" type="submit">보기</button>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {/* 요일 헤더 */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            background: "var(--surface-2)",
            borderBottom: "1px solid var(--border)",
          }}>
            {WEEK.map((w, i) => (
              <div key={i} style={{
                padding: "10px 8px",
                textAlign: "center",
                fontWeight: 700,
                fontSize: 12,
                color: i === 0 ? "var(--danger)" : i === 6 ? "#456C7F" : "var(--text)",
              }}>{w}</div>
            ))}
          </div>

          {/* 날짜 셀 */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
          }}>
            {cells.map((c, i) => {
              const dow = i % 7;
              const isToday = c
                && now.getFullYear() === year
                && now.getMonth() + 1 === month
                && now.getDate() === c.day;
              return (
                <div key={i} style={{
                  minHeight: 100,
                  borderRight: dow === 6 ? "none" : "1px solid var(--border)",
                  borderBottom: "1px solid var(--border)",
                  padding: 6,
                  background: !c
                    ? "var(--surface-2)"
                    : isToday
                      ? "var(--primary-soft)"
                      : "var(--surface)",
                }}>
                  {c && (
                    <>
                      <div style={{
                        fontSize: 12,
                        fontWeight: isToday ? 800 : 600,
                        color: c.hn
                          ? "var(--danger)"
                          : dow === 0
                            ? "var(--danger)"
                            : dow === 6
                              ? "#456C7F"
                              : "var(--text)",
                        marginBottom: 4,
                        display: "flex",
                        alignItems: "baseline",
                        gap: 4,
                      }}>
                        <span>{c.day}</span>
                        {c.hn && <span style={{ fontSize: 10, fontWeight: 500 }}>{c.hn}</span>}
                      </div>
                      {(byDay[c.day] ?? []).map((s, j) => (
                        <div key={j} style={{
                          background: "var(--primary-soft)",
                          borderLeft: "3px solid var(--primary)",
                          borderRadius: "var(--r-xs)",
                          padding: "3px 5px",
                          marginBottom: 2,
                          fontSize: 10.5,
                          lineHeight: 1.3,
                        }}>
                          <div style={{ color: "var(--text-mute)", fontSize: 9.5, fontVariantNumeric: "tabular-nums" }}>
                            {s.time}
                          </div>
                          <div style={{ fontWeight: 700 }}>{s.childName}</div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
