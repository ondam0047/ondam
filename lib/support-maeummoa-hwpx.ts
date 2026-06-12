// 교육청 치료지원 「월별 치료지원 일지(서식 4)」 HWPX 생성기.
// 템플릿(samples/교육청_치료지원일지_template.hwpx)의 텍스트 런을 "인덱스 기준"으로 치환.
// 템플릿은 4개월(분기) 레이아웃 — 최소본(v1)은 첫 달만 채우고 나머지 3개월은 비움.
// (v2: 다중 월·동적 회기수·일정 불러오기·placeholder 토큰화)

import { readFile } from "node:fs/promises";
import path from "node:path";
import { readSection0, patchSection0, xmlEscape } from "@/lib/hwpx";

export type MaeummoaSession = {
  date: string;     // 예) "25-03-04"
  time: string;     // 예) "16:00-16:50" (괄호 없이; 출력 시 (..)로 감쌈)
  content: string;  // 여러 줄(최대 3줄) — 활동내용/특이사항(# 직접 입력 가능)
};

export type MaeummoaPayload = {
  year: number;      // 학년도 (예: 2025)
  month: number;     // 월 (예: 3)
  domain: string;    // 영역 (예: 언어치료)
  therapist: string; // 치료사
  student: string;   // 학생명
  school: string;    // 학교 / 학년
  place: string;     // 장소
  weekly: string;    // 요일 / 시간 (예: "화 16:00~16:50")
  goal: string;      // 월 치료지원 목표
  sessions: MaeummoaSession[]; // 최대 3회기 (v1)
};

export const MAEUMMOA_TEMPLATE_PATH = path.join(process.cwd(), "samples", "교육청_치료지원일지_template.hwpx");
export const MAX_SESSIONS = 3;

// 템플릿 신율 샘플의 <hp:t> 런 인덱스 맵 (4개월 × 헤더 + 3회기).
type Slot = { date: number; time: number; note: number | null; lines: [number, number, number] };
type MonthIdx = { title: number; dom: number; ther: number; stu: number; sch: number; wk: number; place: number; goal: number; sessions: Slot[] };
// 단일 월(한 장) 템플릿 — 월1 슬롯만 사용.
const MONTHS: MonthIdx[] = [
  { title: 1, dom: 3, ther: 5, stu: 7, sch: 9, wk: 11, place: 13, goal: 15,
    sessions: [ { date: 18, time: 19, note: 20, lines: [21, 22, 23] }, { date: 24, time: 25, note: null, lines: [26, 27, 28] }, { date: 29, time: 30, note: null, lines: [31, 32, 33] } ] },
];

function buildIndexMap(p: MaeummoaPayload): Map<number, string> {
  const m = new Map<number, string>();
  // 첫 달(월1)만 채움
  const M = MONTHS[0];
  m.set(M.title, `${p.year}학년도 (  ${p.month} )월 치료지원 일지`);
  m.set(M.dom, p.domain);
  m.set(M.ther, p.therapist);
  m.set(M.stu, p.student);
  m.set(M.sch, p.school);
  m.set(M.wk, p.weekly);
  m.set(M.place, p.place);
  m.set(M.goal, p.goal);
  for (let k = 0; k < M.sessions.length; k++) {
    const slot = M.sessions[k];
    const s = p.sessions[k];
    if (s) {
      m.set(slot.date, s.date);
      m.set(slot.time, `(${s.time})`);
      const lines = s.content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 3);
      if (slot.note !== null) m.set(slot.note, ""); // 특이사항 전용 런은 비우고, 내용은 아래 3줄에
      for (let j = 0; j < 3; j++) m.set(slot.lines[j], lines[j] ?? "");
    } else {
      m.set(slot.date, ""); m.set(slot.time, "");
      if (slot.note !== null) m.set(slot.note, "");
      for (const li of slot.lines) m.set(li, "");
    }
  }
  return m;
}

function substitute(xml: string, p: MaeummoaPayload): string {
  const map = buildIndexMap(p);
  let i = -1;
  let out = xml.replace(/<hp:t>([\s\S]*?)<\/hp:t>/g, (full) => {
    i++;
    return map.has(i) ? `<hp:t>${xmlEscape(map.get(i)!)}</hp:t>` : full;
  });
  // 텍스트 길이가 바뀌므로 캐시된 줄 레이아웃 제거 → 한글이 열 때 재계산
  out = out.replace(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/g, "");
  return out;
}

export async function readMaeummoaTemplate(): Promise<Buffer> {
  return readFile(MAEUMMOA_TEMPLATE_PATH);
}

export function generateMaeummoaSheet(templateBuf: Buffer, p: MaeummoaPayload): Buffer {
  const xml = readSection0(templateBuf);
  return patchSection0(templateBuf, substitute(xml, p));
}

export function safeFileName(s: string): string {
  return s.replace(/[/\\?%*:|"<>]/g, "_") || "치료지원일지";
}
