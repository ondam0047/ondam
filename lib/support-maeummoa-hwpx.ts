// 교육청 치료지원 「월별 치료지원 일지(서식 4)」 HWPX 생성기.
// 템플릿은 4개월(4페이지) 구조 — 이를 "회기 3개씩 페이지"로 활용:
// 회기를 3개씩 페이지에 채우고, 필요한 페이지 수만큼만 남기고 나머지 페이지는 잘라냄.
// 모든 페이지 헤더(학생·치료사·월·목표 등)는 동일. 최대 4페이지(12회기).

import { readFile } from "node:fs/promises";
import path from "node:path";
import { readSection0, patchSection0, xmlEscape } from "@/lib/hwpx";

export type MaeummoaSession = { date: string; time: string; content: string };
export type MaeummoaPayload = {
  year: number; month: number; domain: string; therapist: string;
  student: string; school: string; place: string; weekly: string;
  goal: string; sessions: MaeummoaSession[];
};

export const MAEUMMOA_TEMPLATE_PATH = path.join(process.cwd(), "samples", "교육청_치료지원일지_template.hwpx");
export const PER_PAGE = 3;
export const MAX_PAGES = 4;

// 템플릿 <hp:t> 런 인덱스 (4페이지 × 헤더 + 3회기)
type Slot = { date: number; time: number; note: number | null; lines: [number, number, number] };
type Page = { title: number; dom: number; ther: number; stu: number; sch: number; wk: number; place: number; goal: number; sessions: Slot[] };
const PAGES: Page[] = [
  { title: 1, dom: 3, ther: 5, stu: 7, sch: 9, wk: 11, place: 13, goal: 15,
    sessions: [ { date: 18, time: 19, note: 20, lines: [21, 22, 23] }, { date: 24, time: 25, note: null, lines: [26, 27, 28] }, { date: 29, time: 30, note: null, lines: [31, 32, 33] } ] },
  { title: 35, dom: 37, ther: 39, stu: 41, sch: 43, wk: 45, place: 47, goal: 49,
    sessions: [ { date: 52, time: 53, note: null, lines: [54, 55, 56] }, { date: 57, time: 58, note: null, lines: [59, 60, 61] }, { date: 62, time: 63, note: null, lines: [64, 65, 66] } ] },
  { title: 68, dom: 70, ther: 72, stu: 74, sch: 76, wk: 78, place: 80, goal: 82,
    sessions: [ { date: 85, time: 86, note: 87, lines: [88, 89, 90] }, { date: 91, time: 92, note: 93, lines: [94, 95, 96] }, { date: 97, time: 98, note: null, lines: [99, 100, 101] } ] },
  { title: 103, dom: 105, ther: 107, stu: 109, sch: 111, wk: 113, place: 115, goal: 117,
    sessions: [ { date: 120, time: 121, note: null, lines: [122, 123, 124] }, { date: 125, time: 126, note: null, lines: [127, 128, 129] }, { date: 130, time: 131, note: null, lines: [132, 133, 134] } ] },
];

function substitute(xml: string, p: MaeummoaPayload): string {
  const sessions = (p.sessions.length ? p.sessions : [{ date: "", time: "", content: "" }]).slice(0, PER_PAGE * MAX_PAGES);
  const pages = Math.min(MAX_PAGES, Math.max(1, Math.ceil(sessions.length / PER_PAGE)));
  const titleText = `${p.year}학년도 (  ${p.month} )월 치료지원 일지`;

  const map = new Map<number, string>();
  for (let b = 0; b < pages; b++) {
    const P = PAGES[b];
    map.set(P.title, titleText);
    map.set(P.dom, p.domain); map.set(P.ther, p.therapist); map.set(P.stu, p.student);
    map.set(P.sch, p.school); map.set(P.wk, p.weekly); map.set(P.place, p.place); map.set(P.goal, p.goal);
    for (let k = 0; k < P.sessions.length; k++) {
      const slot = P.sessions[k];
      const s = sessions[b * PER_PAGE + k];
      if (s) {
        map.set(slot.date, s.date);
        map.set(slot.time, s.time ? `(${s.time})` : "");
        const lines = s.content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 3);
        if (slot.note !== null) map.set(slot.note, "");
        for (let j = 0; j < 3; j++) map.set(slot.lines[j], lines[j] ?? "");
      } else {
        map.set(slot.date, ""); map.set(slot.time, "");
        if (slot.note !== null) map.set(slot.note, "");
        for (const li of slot.lines) map.set(li, "");
      }
    }
  }

  // 인덱스 기준 런 치환
  let i = -1;
  let out = xml.replace(/<hp:t>([\s\S]*?)<\/hp:t>/g, (full) => {
    i++;
    return map.has(i) ? `<hp:t>${xmlEscape(map.get(i)!)}</hp:t>` : full;
  });

  // 필요 페이지 수만큼만 남기고 뒤 페이지 블록 잘라냄 (페이지 b 의 "<서식 4> 월별..." 제목 문단부터 끝까지 제거)
  if (pages < MAX_PAGES) {
    const MARK = "월별 치료지원 일지"; // 각 페이지의 서식명 (치환 안 함)
    const pos: number[] = [];
    for (let idx = out.indexOf(MARK); idx >= 0; idx = out.indexOf(MARK, idx + 1)) pos.push(idx);
    if (pos.length > pages) {
      const cutAt = out.lastIndexOf("<hp:p", pos[pages]);
      const tail = out.slice(out.lastIndexOf("</hp:p>") + "</hp:p>".length);
      out = out.slice(0, cutAt) + tail;
    }
  }

  // 캐시된 줄 레이아웃 제거 → 한글이 열 때 재계산
  out = out.replace(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/g, "");
  return out;
}

export async function readMaeummoaTemplate(): Promise<Buffer> {
  return readFile(MAEUMMOA_TEMPLATE_PATH);
}

export function generateMaeummoaSheet(templateBuf: Buffer, p: MaeummoaPayload): Buffer {
  return patchSection0(templateBuf, substitute(readSection0(templateBuf), p));
}

export function safeFileName(s: string): string {
  return s.replace(/[/\\?%*:|"<>]/g, "_") || "치료지원일지";
}
