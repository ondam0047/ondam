// 일정표 월 달력 격자 채움 — 날짜 숫자 + 회기 시간 본문.
// 리졸버가 잡은 ScheduleCalendar 기하를 따라, 해당 연·월의 날짜를 칸에 배치하고
// 회기가 있는 날엔 시간을 내용칸에 쓴다. 양식에 미리 박힌 날짜는 모두 덮어쓴다.

import type { CellEdit, Coord } from "@/lib/record-fill";
import type { ScheduleCalendar } from "@/lib/record-resolver";

export type CalSession = { day: number; time: string };

// (연,월) 달력의 각 칸에 들어갈 날짜/시간 편집 목록을 만든다.
export function buildCalendarEdits(
  cal: ScheduleCalendar,
  year: number,
  month: number,
  sessions: CalSession[],
): CellEdit[] {
  const dim = new Date(year, month, 0).getDate();
  const firstDow = new Date(year, month - 1, 1).getDay();
  const colByDow = new Map(cal.cols.map((c) => [c.dow, c]));
  const timeByDay = new Map<number, string>();
  for (const s of sessions) if (s.day) timeByDay.set(s.day, s.time);

  // 각 날짜 → (주차, 요일). 주차는 맨 왼쪽 요일을 만날 때마다 증가(시각적 한 주).
  const dayPos = new Map<number, { week: number; dow: number }>();
  let week = 0;
  for (let d = 1; d <= dim; d++) {
    const dow = (firstDow + d - 1) % 7;
    if (d > 1 && dow === cal.leftmostDow) week++;
    dayPos.set(d, { week, dow });
  }
  // (주차,요일) → 날짜 역색인
  const dayAt = (w: number, dow: number): number | null => {
    for (const [d, pos] of dayPos) if (pos.week === w && pos.dow === dow) return d;
    return null;
  };

  const edits: CellEdit[] = [];
  for (let w = 0; w < cal.weeks.length; w++) {
    const { numberRow, contentRow } = cal.weeks[w];
    for (const col of cal.cols) {
      if (!colByDow.has(col.dow)) continue;
      const d = dayAt(w, col.dow);
      const numC: Coord = [cal.table, numberRow, col.startCol];
      const conC: Coord = [cal.table, contentRow, col.startCol];
      edits.push({ table: numC[0], row: numC[1], col: numC[2], value: d ? String(d) : "" });
      const time = d ? (timeByDay.get(d) ?? "") : "";
      edits.push({ table: conC[0], row: conC[1], col: conC[2], value: time });
    }
  }
  return edits;
}
