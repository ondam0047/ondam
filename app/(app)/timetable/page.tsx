import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { WEEK } from "@/lib/constants";

export const dynamic = "force-dynamic";

// 시간 슬롯 (30분 단위, 9시~20시)
const HOURS = Array.from({ length: 22 }, (_, i) => {
  const m = 9 * 60 + i * 30;
  return { h: Math.floor(m / 60), m: m % 60 };
});
const timeStr = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
const slotKey = (h: number, m: number) => h * 60 + m;

// "HH:MM~HH:MM" 회기가 어느 슬롯들을 차지하는지
function slotsFor(time: string): number[] {
  const m = time.match(/^(\d\d):(\d\d)~(\d\d):(\d\d)$/);
  if (!m) return [];
  const start = +m[1] * 60 + +m[2];
  const end = +m[3] * 60 + +m[4];
  const out: number[] = [];
  for (let t = Math.floor(start / 30) * 30; t < end; t += 30) {
    if (t >= 9 * 60 && t < 21 * 60) out.push(t);
  }
  return out;
}

export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ therapistId?: string; year?: string; month?: string }>;
}) {
  const user = await requireRole(["OWNER", "ADMIN"]);
  const sp = await searchParams;
  const centerId = user.centerId ?? -1;

  const now = new Date();
  const year = sp.year ? Number(sp.year) : now.getFullYear();
  const month = sp.month ? Number(sp.month) : now.getMonth() + 1;

  // 1인 모드: 본인 Therapist 만. user.therapistId 우선, 없으면 같은 센터 본인 이름.
  const myTherapist = user.therapistId
    ? await prisma.therapist.findUnique({
        where: { id: user.therapistId },
        include: { services: { where: { active: true }, select: { id: true } } },
      })
    : await prisma.therapist.findFirst({
        where: { centerId, active: true, name: user.name },
        include: { services: { where: { active: true }, select: { id: true } } },
      });
  const therapists = myTherapist ? [myTherapist] : [];
  const selectedTherapistId = myTherapist?.id;
  const selected = myTherapist;

  // 해당 치료사의 이번 달 일정 + 회기, 시간 차단
  const [schedules, blocks] = selected
    ? await Promise.all([
        prisma.schedule.findMany({
          where: {
            year,
            month,
            childService: {
              therapistId: selected.id,
              active: true,
              child: { centerId, active: true },
            },
          },
          include: {
            sessions: true,
            childService: { include: { child: true } },
          },
        }),
        prisma.therapistBlock.findMany({
          where: { therapistId: selected.id },
        }),
      ])
    : [[], []];

  // 요일별 시간대 회기 모음 (요일 0~6 × 시간 슬롯)
  // 한 달 중 그 요일에 있는 모든 회기를 묶음
  type CellSession = { time: string; childName: string; days: number[] };
  const grid: Record<number, Record<number, CellSession[]>> = {};
  for (let d = 0; d < 7; d++) grid[d] = {};

  for (const sch of schedules) {
    for (const s of sch.sessions) {
      const date = new Date(year, month - 1, s.day);
      const dow = date.getDay();
      // 같은 요일·시간 회기를 묶기
      const slots = slotsFor(s.time);
      for (const slot of slots) {
        if (!grid[dow][slot]) grid[dow][slot] = [];
        let cell = grid[dow][slot].find(
          (c) => c.time === s.time && c.childName === sch.childService.child.name
        );
        if (!cell) {
          cell = { time: s.time, childName: sch.childService.child.name, days: [] };
          grid[dow][slot].push(cell);
        }
        if (!cell.days.includes(s.day)) cell.days.push(s.day);
      }
    }
  }

  // 차단 시간을 슬롯으로 변환
  const blockedSlots: Record<number, Set<number>> = {};
  for (let d = 0; d < 7; d++) blockedSlots[d] = new Set();
  for (const b of blocks) {
    const slots = slotsFor(`${b.startTime}~${b.endTime}`);
    for (const s of slots) blockedSlots[b.dayOfWeek].add(s);
  }

  const monthOptions: { y: number; m: number }[] = [];
  for (let offset = -1; offset <= 2; offset++) {
    const total = now.getFullYear() * 12 + (now.getMonth() + offset);
    monthOptions.push({ y: Math.floor(total / 12), m: (total % 12) + 1 });
  }

  return (
    <>
      <div className="section-head">
        <div>
          <h2>치료사별 시간표</h2>
          <p>한 달 회기를 요일별·시간별로 한눈에 봅니다.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <form method="get" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
            <div className="field" style={{ minWidth: 200 }}>
              <label>치료사</label>
              <select className="select" name="therapistId" defaultValue={selectedTherapistId?.toString() ?? ""}>
                {therapists.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (담당 {t.services.length}건)
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ minWidth: 160 }}>
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

      {selected && (
        <div className="card">
          <div className="card-header">
            <h2>{selected.name} · {year}년 {month}월</h2>
            <span className="hint">
              회기 {schedules.reduce((s, sch) => s + sch.sessions.length, 0)}건 · 차단 {blocks.length}건
            </span>
          </div>
          <div className="card-body">
            <div style={{ overflowX: "auto" }}>
              <table style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 11,
                tableLayout: "fixed",
                minWidth: 700,
              }}>
                <thead>
                  <tr>
                    <th style={{ width: 60, padding: "8px 4px", borderBottom: "1px solid var(--border)", background: "var(--surface-2)", fontSize: 11, fontWeight: 700 }}>시간</th>
                    {WEEK.map((w, i) => (
                      <th key={i} style={{
                        padding: "8px 4px",
                        borderBottom: "1px solid var(--border)",
                        background: "var(--surface-2)",
                        fontSize: 11,
                        fontWeight: 700,
                        color: i === 0 ? "var(--danger)" : i === 6 ? "#456C7F" : "var(--text)",
                      }}>{w}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {HOURS.map((slot) => {
                    const sk = slotKey(slot.h, slot.m);
                    const isHourMark = slot.m === 0;
                    return (
                      <tr key={sk}>
                        <td style={{
                          padding: "4px",
                          borderBottom: isHourMark ? "1px solid var(--border)" : "1px dashed var(--surface-3)",
                          background: "var(--surface-2)",
                          fontSize: 10.5,
                          color: "var(--text-mute)",
                          fontVariantNumeric: "tabular-nums",
                          textAlign: "center",
                        }}>
                          {isHourMark ? timeStr(slot.h, slot.m) : ""}
                        </td>
                        {WEEK.map((_, dow) => {
                          const cells = grid[dow][sk] || [];
                          const isBlocked = blockedSlots[dow].has(sk);
                          return (
                            <td key={dow} style={{
                              padding: "2px",
                              borderBottom: isHourMark ? "1px solid var(--border)" : "1px dashed var(--surface-3)",
                              verticalAlign: "top",
                              background: isBlocked ? "repeating-linear-gradient(45deg, #FBEAE7, #FBEAE7 4px, #F6D8D4 4px, #F6D8D4 8px)" : undefined,
                            }}>
                              {cells.map((c, i) => (
                                <div key={i} style={{
                                  background: "var(--primary-soft)",
                                  borderLeft: "3px solid var(--primary)",
                                  borderRadius: "var(--r-xs)",
                                  padding: "3px 5px",
                                  marginBottom: 2,
                                  fontSize: 10.5,
                                  lineHeight: 1.25,
                                }}>
                                  <div style={{ fontWeight: 700 }}>{c.childName}</div>
                                  <div style={{ color: "var(--text-mute)", fontSize: 9.5 }}>
                                    {c.time} · {c.days.length}회
                                  </div>
                                </div>
                              ))}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
