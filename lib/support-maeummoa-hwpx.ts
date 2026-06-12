// 교육청 치료지원 「월별 치료지원 일지(서식 4)」 HWPX 생성기.
// 템플릿: 4페이지 × 회기 4행(통일). 각 회기 행 — 일시칸[날짜·시간·#메모] / 내용칸[활동 3줄].
// 회기 4개 초과 시 다음 페이지, 필요한 페이지 수만큼만 남기고 컷. 최대 4장(16회기).

import { readFile } from "node:fs/promises";
import path from "node:path";
import { readSection0, patchSection0, xmlEscape } from "@/lib/hwpx";

export type MaeummoaSession = {
  date: string;     // "25-03-04"
  time: string;     // "16:00-16:50" (괄호 없이; 출력 시 (..))
  content: string;  // 활동내용 (최대 3줄) → 내용칸
  memo?: string;    // 특이사항 → 일시칸 시간 아래 #
};
export type MaeummoaPayload = {
  year: number; month: number; domain: string; therapist: string;
  student: string; school: string; place: string; weekly: string;
  goal: string; sessions: MaeummoaSession[];
};

export const MAEUMMOA_TEMPLATE_PATH = path.join(process.cwd(), "samples", "교육청_치료지원일지_template.hwpx");
export const PER_PAGE = 4;
export const MAX_PAGES = 4;

type Slot = { date: number; time: number; memo: number; lines: [number, number, number] };
type Page = { title: number; dom: number; ther: number; stu: number; sch: number; wk: number; place: number; goal: number; sessions: Slot[] };
const PAGES: Page[] = [
  { title: 1, dom: 3, ther: 5, stu: 7, sch: 9, wk: 11, place: 13, goal: 15, sessions: [ { date: 18, time: 19, memo: 20, lines: [21, 22, 23] }, { date: 24, time: 25, memo: 26, lines: [27, 28, 29] }, { date: 30, time: 31, memo: 32, lines: [33, 34, 35] }, { date: 36, time: 37, memo: 38, lines: [39, 40, 41] } ] },
  { title: 43, dom: 45, ther: 47, stu: 49, sch: 51, wk: 53, place: 55, goal: 57, sessions: [ { date: 60, time: 61, memo: 62, lines: [63, 64, 65] }, { date: 66, time: 67, memo: 68, lines: [69, 70, 71] }, { date: 72, time: 73, memo: 74, lines: [75, 76, 77] }, { date: 78, time: 79, memo: 80, lines: [81, 82, 83] } ] },
  { title: 85, dom: 87, ther: 89, stu: 91, sch: 93, wk: 95, place: 97, goal: 99, sessions: [ { date: 102, time: 103, memo: 104, lines: [105, 106, 107] }, { date: 108, time: 109, memo: 110, lines: [111, 112, 113] }, { date: 114, time: 115, memo: 116, lines: [117, 118, 119] }, { date: 120, time: 121, memo: 122, lines: [123, 124, 125] } ] },
  { title: 127, dom: 129, ther: 131, stu: 133, sch: 135, wk: 137, place: 139, goal: 141, sessions: [ { date: 144, time: 145, memo: 146, lines: [147, 148, 149] }, { date: 150, time: 151, memo: 152, lines: [153, 154, 155] }, { date: 156, time: 157, memo: 158, lines: [159, 160, 161] }, { date: 162, time: 163, memo: 164, lines: [165, 166, 167] } ] },
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
        const memo = (s.memo ?? "").trim();
        map.set(slot.memo, memo ? (memo.startsWith("#") ? memo : `# ${memo}`) : "");
        const lines = s.content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 3);
        for (let j = 0; j < 3; j++) map.set(slot.lines[j], lines[j] ?? "");
      } else {
        map.set(slot.date, ""); map.set(slot.time, ""); map.set(slot.memo, "");
        for (const li of slot.lines) map.set(li, "");
      }
    }
  }

  let i = -1;
  let out = xml.replace(/<hp:t>([\s\S]*?)<\/hp:t>/g, (full) => {
    i++;
    return map.has(i) ? `<hp:t>${xmlEscape(map.get(i)!)}</hp:t>` : full;
  });

  if (pages < MAX_PAGES) {
    const MARK = "월별 치료지원 일지";
    const pos: number[] = [];
    for (let idx = out.indexOf(MARK); idx >= 0; idx = out.indexOf(MARK, idx + 1)) pos.push(idx);
    if (pos.length > pages) {
      const cutAt = out.lastIndexOf("<hp:p", pos[pages]);
      const tail = out.slice(out.lastIndexOf("</hp:p>") + "</hp:p>".length);
      out = out.slice(0, cutAt) + tail;
    }
  }

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
