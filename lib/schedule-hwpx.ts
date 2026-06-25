// 일정표 HWPX 생성기 — 단일·일괄 라우트에서 공용 사용.
// 양식: samples/일정표_template.hwpx (2026.02 기준)

import { readFile } from "node:fs/promises";
import path from "node:path";
import { patchSection0, readSection0, xmlEscape } from "@/lib/hwpx";

export type SchedulePayload = {
  childName: string;
  childBirth?: string;
  therapist: string;
  serviceType: string;
  year: number;
  month: number;
  mgmtNumber?: string;
  writeDate: string;
  pvOrg: string;
  pvTel: string;
  pvCharge: string;
  pvType: string;
  costUnit: string;
  costSelf: string;
  costTotal: number;
  cycle: string;
  target: number;
  sessions: { day: number; weekday: string; time: string; makeup: boolean }[];
  holidays?: { day: number; name: string }[];
};

export const SCHEDULE_TEMPLATE_PATH = path.join(process.cwd(), "samples", "일정표_template.hwpx");

const TV = {
  title: "서비스 일정표 (2월)",
  name: "노하은",
  therapist: "주채린",
  writeDate: "26.01.28",
  org: "온담말언어발달센터",
  phone: "775-0047",
  cycle: "수 목",
  daysList: "4 5 11 12 26",
  costUnit: "65,000원",
  costTotal: "325,000원",
  typeFirstRun: "언어",
  typeSecondRun: "재활",
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function readScheduleTemplate(): Promise<Buffer> {
  return readFile(SCHEDULE_TEMPLATE_PATH);
}

export function buildScheduleHwpx(templateBuf: Buffer, p: SchedulePayload): Buffer {
  const oldXml = readSection0(templateBuf);
  const newXml = substituteSectionXml(oldXml, p);
  return patchSection0(templateBuf, newXml);
}

function substituteSectionXml(xml: string, p: SchedulePayload): string {
  let out = xml;

  out = out.replace(
    `<hp:t>${TV.title}</hp:t>`,
    `<hp:t>${xmlEscape(`서비스 일정표 (${p.month}월)`)}</hp:t>`
  );
  out = out.replace(`<hp:t>${TV.name}</hp:t>`, `<hp:t>${xmlEscape(p.childName)}</hp:t>`);
  out = out.split(`<hp:t>${TV.therapist}</hp:t>`).join(`<hp:t>${xmlEscape(p.therapist)}</hp:t>`);
  out = out.replace(`<hp:t>${TV.writeDate}</hp:t>`, `<hp:t>${xmlEscape(p.writeDate)}</hp:t>`);
  out = out.replace(`<hp:t>${TV.org}</hp:t>`, `<hp:t>${xmlEscape(p.pvOrg)}</hp:t>`);
  out = out.replace(`<hp:t>${TV.phone}</hp:t>`, `<hp:t>${xmlEscape(p.pvTel)}</hp:t>`);
  out = out.replace(`<hp:t>${TV.cycle}</hp:t>`, `<hp:t>${xmlEscape(p.cycle)}</hp:t>`);
  const daysList = p.sessions.map((s) => s.day).join(" ");
  out = out.replace(`<hp:t>${TV.daysList}</hp:t>`, `<hp:t>${xmlEscape(daysList)}</hp:t>`);
  out = out.split(`<hp:t>${TV.typeFirstRun}</hp:t>`).join(`<hp:t>${xmlEscape(p.serviceType)}</hp:t>`);
  out = out.split(`<hp:t>${TV.typeSecondRun}</hp:t>`).join(`<hp:t></hp:t>`);
  out = out.replace(`<hp:t>${TV.costUnit}</hp:t>`, `<hp:t>${xmlEscape(p.costUnit)}원</hp:t>`);
  out = out.replace(
    `<hp:t>${TV.costTotal}</hp:t>`,
    `<hp:t>${xmlEscape(p.costTotal.toLocaleString("ko-KR"))}원</hp:t>`
  );

  // 서비스 비용 표의 '횟수'는 이 달 실제 회기 수(=화면·총금액과 동일 기준). 목표회기수(p.target) 아님.
  const sessionCount = p.sessions.length;
  const newUnit = `<hp:t>${xmlEscape(p.costUnit)}원</hp:t>`;
  const targetRe = new RegExp(escapeRegex(newUnit) + `([\\s\\S]*?)<hp:t>5</hp:t>`);
  out = out.replace(targetRe, (whole) =>
    whole.replace(/<hp:t>5<\/hp:t>([^<]*)$/, `<hp:t>${sessionCount}</hp:t>$1`)
  );

  const newTotal = `<hp:t>${xmlEscape(p.costTotal.toLocaleString("ko-KR"))}원</hp:t>`;
  const selfRe = new RegExp(escapeRegex(newTotal) + `([\\s\\S]*?)<hp:t>0</hp:t>`);
  out = out.replace(selfRe, (whole) =>
    whole.replace(/<hp:t>0<\/hp:t>([^<]*)$/, `<hp:t>${xmlEscape(p.costSelf)}</hp:t>$1`)
  );

  const tblStarts: number[] = [];
  const tblRe = /<hp:tbl /g;
  let m: RegExpExecArray | null;
  while ((m = tblRe.exec(out)) !== null) tblStarts.push(m.index);
  if (tblStarts.length >= 2) {
    const calStart = tblStarts[1];
    const calEnd = out.indexOf("</hp:tbl>", calStart) + "</hp:tbl>".length;
    const cal = out.slice(calStart, calEnd);
    const newCal = rewriteCalendar(cal, p.year, p.month, p.sessions, p.holidays ?? []);
    out = out.slice(0, calStart) + newCal + out.slice(calEnd);
  }

  return out;
}

function rewriteCalendar(
  calXml: string,
  year: number,
  month: number,
  sessions: SchedulePayload["sessions"],
  holidays: { day: number; name: string }[]
): string {
  const dim = new Date(year, month, 0).getDate();
  const offset = new Date(year, month - 1, 1).getDay();
  const sessionMap = new Map<number, string>();
  for (const s of sessions) sessionMap.set(s.day, s.time);
  const holidayMap = new Map<number, string>();
  for (const h of holidays) holidayMap.set(h.day, h.name);

  return calXml.replace(/<hp:tc\s[^>]*>[\s\S]*?<\/hp:tc>/g, (cellXml) => {
    const addrTag = cellXml.match(/<hp:cellAddr[^/]*\/>/)?.[0];
    if (!addrTag) return cellXml;
    const col = Number(addrTag.match(/colAddr="(\d+)"/)?.[1] ?? -1);
    const row = Number(addrTag.match(/rowAddr="(\d+)"/)?.[1] ?? -1);
    if (col < 0 || row < 0) return cellXml;

    if (row >= 1 && row <= 9 && row % 2 === 1 && col >= 0 && col <= 12 && col % 2 === 0) {
      const week = (row - 1) / 2;
      const dow = col / 2;
      const pos = week * 7 + dow;
      const day = pos - offset + 1;
      const text = day >= 1 && day <= dim ? String(day) : "";
      let pid = 2;
      if (dow === 0) pid = 38;
      else if (dow === 6) pid = 40;
      if (day >= 1 && day <= dim && holidayMap.has(day)) pid = 38;
      return setCellText(cellXml, text, pid);
    }

    if (row >= 2 && row <= 10 && row % 2 === 0 && col >= 1 && col <= 13 && col % 2 === 1) {
      const week = (row - 2) / 2;
      const dow = (col - 1) / 2;
      const pos = week * 7 + dow;
      const day = pos - offset + 1;
      if (day >= 1 && day <= dim) {
        const hn = holidayMap.get(day);
        if (hn) return setCellText(cellXml, hn, 38);
      }
      let text = "           ";
      let hasSession = false;
      if (day >= 1 && day <= dim) {
        const t = sessionMap.get(day);
        if (t) { text = t.padEnd(11, " ").slice(0, 11); hasSession = true; }
      }
      let result = setCellText(cellXml, text, 2);
      if (hasSession) result = ensureTwoLineSeg(result);
      return result;
    }

    return cellXml;
  });
}

function ensureTwoLineSeg(cellXml: string): string {
  if (/textpos="6"/.test(cellXml)) return cellXml;
  return cellXml.replace(
    /<hp:linesegarray><hp:lineseg\s+textpos="0"[^/]*\/><\/hp:linesegarray>/,
    `<hp:linesegarray>` +
    `<hp:lineseg textpos="0" vertpos="0" vertsize="900" textheight="900" baseline="765" spacing="540" horzpos="0" horzsize="3156" flags="393216"/>` +
    `<hp:lineseg textpos="6" vertpos="1440" vertsize="900" textheight="900" baseline="765" spacing="540" horzpos="0" horzsize="3156" flags="393216"/>` +
    `</hp:linesegarray>`
  );
}

function setCellText(cellXml: string, text: string, forceCharPrIDRef?: number): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (forceCharPrIDRef !== undefined) {
    const pid = String(forceCharPrIDRef);
    if (/<hp:run\s+charPrIDRef="\d+"\s*>\s*<hp:t>[^<]*<\/hp:t>\s*<\/hp:run>/.test(cellXml)) {
      return cellXml.replace(
        /<hp:run\s+charPrIDRef="\d+"\s*>\s*<hp:t>[^<]*<\/hp:t>\s*<\/hp:run>/,
        `<hp:run charPrIDRef="${pid}"><hp:t>${escaped}</hp:t></hp:run>`
      );
    }
    if (/<hp:run\s+charPrIDRef="\d+"\s*\/>/.test(cellXml)) {
      return cellXml.replace(
        /<hp:run\s+charPrIDRef="\d+"\s*\/>/,
        `<hp:run charPrIDRef="${pid}"><hp:t>${escaped}</hp:t></hp:run>`
      );
    }
  }
  if (/<hp:t>[^<]*<\/hp:t>/.test(cellXml)) {
    return cellXml.replace(/<hp:t>[^<]*<\/hp:t>/, `<hp:t>${escaped}</hp:t>`);
  }
  if (/<hp:run\s+charPrIDRef="\d+"\s*\/>/.test(cellXml)) {
    return cellXml.replace(
      /<hp:run\s+charPrIDRef="(\d+)"\s*\/>/,
      `<hp:run charPrIDRef="$1"><hp:t>${escaped}</hp:t></hp:run>`
    );
  }
  return cellXml;
}

// 파일명에서 위험 문자 제거.
export function safeFileName(s: string): string {
  return s.replace(/[/\\?%*:|"<>]/g, "_") || "출력";
}
