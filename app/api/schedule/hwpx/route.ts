import { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { patchSection0, readSection0, xmlEscape } from "@/lib/hwpx";

type SessionInput = { day: number; weekday: string; time: string; makeup: boolean };

type Payload = {
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
  sessions: SessionInput[];
  holidays?: { day: number; name: string }[];
};

const TEMPLATE_PATH = path.join(process.cwd(), "samples", "일정표_template.hwpx");

const TEMPLATE_VALUES = {
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

// ─── XML 치환 로직 ─────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function substituteSectionXml(xml: string, p: Payload): string {
  let out = xml;

  out = out.replace(
    `<hp:t>${TEMPLATE_VALUES.title}</hp:t>`,
    `<hp:t>${xmlEscape(`서비스 일정표 (${p.month}월)`)}</hp:t>`
  );
  out = out.replace(
    `<hp:t>${TEMPLATE_VALUES.name}</hp:t>`,
    `<hp:t>${xmlEscape(p.childName)}</hp:t>`
  );
  out = out.split(`<hp:t>${TEMPLATE_VALUES.therapist}</hp:t>`).join(
    `<hp:t>${xmlEscape(p.therapist)}</hp:t>`
  );
  out = out.replace(
    `<hp:t>${TEMPLATE_VALUES.writeDate}</hp:t>`,
    `<hp:t>${xmlEscape(p.writeDate)}</hp:t>`
  );
  out = out.replace(
    `<hp:t>${TEMPLATE_VALUES.org}</hp:t>`,
    `<hp:t>${xmlEscape(p.pvOrg)}</hp:t>`
  );
  out = out.replace(
    `<hp:t>${TEMPLATE_VALUES.phone}</hp:t>`,
    `<hp:t>${xmlEscape(p.pvTel)}</hp:t>`
  );
  out = out.replace(
    `<hp:t>${TEMPLATE_VALUES.cycle}</hp:t>`,
    `<hp:t>${xmlEscape(p.cycle)}</hp:t>`
  );
  const daysList = p.sessions.map((s) => s.day).join(" ");
  out = out.replace(
    `<hp:t>${TEMPLATE_VALUES.daysList}</hp:t>`,
    `<hp:t>${xmlEscape(daysList)}</hp:t>`
  );
  // 서비스 종류: 양식이 '언어'+'재활' 두 런으로 쪼개진 자리 두 군데
  out = out.split(`<hp:t>${TEMPLATE_VALUES.typeFirstRun}</hp:t>`).join(
    `<hp:t>${xmlEscape(p.serviceType)}</hp:t>`
  );
  out = out.split(`<hp:t>${TEMPLATE_VALUES.typeSecondRun}</hp:t>`).join(`<hp:t></hp:t>`);

  // 단가/총가
  out = out.replace(
    `<hp:t>${TEMPLATE_VALUES.costUnit}</hp:t>`,
    `<hp:t>${xmlEscape(p.costUnit)}원</hp:t>`
  );
  out = out.replace(
    `<hp:t>${TEMPLATE_VALUES.costTotal}</hp:t>`,
    `<hp:t>${xmlEscape(p.costTotal.toLocaleString("ko-KR"))}원</hp:t>`
  );

  // 횟수: 새 단가 셀 뒤 첫 `<hp:t>5</hp:t>`
  const newUnit = `<hp:t>${xmlEscape(p.costUnit)}원</hp:t>`;
  const targetRe = new RegExp(
    escapeRegex(newUnit) + `([\\s\\S]*?)<hp:t>5</hp:t>`
  );
  out = out.replace(targetRe, (whole) =>
    whole.replace(/<hp:t>5<\/hp:t>([^<]*)$/, `<hp:t>${p.target}</hp:t>$1`)
  );

  // 본인부담금: 새 총가 셀 뒤 첫 `<hp:t>0</hp:t>`
  const newTotal = `<hp:t>${xmlEscape(p.costTotal.toLocaleString("ko-KR"))}원</hp:t>`;
  const selfRe = new RegExp(
    escapeRegex(newTotal) + `([\\s\\S]*?)<hp:t>0</hp:t>`
  );
  out = out.replace(selfRe, (whole) =>
    whole.replace(/<hp:t>0<\/hp:t>([^<]*)$/, `<hp:t>${xmlEscape(p.costSelf)}</hp:t>$1`)
  );

  // 캘린더: 2번째 hp:tbl 영역을 cellAddr 기반으로 재작성
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

// ─── 캘린더 재구성 ─────────────────────────────────────────────────────────
// 양식 캘린더 좌표계 (Feb 2026 템플릿 분석 결과):
//   요일 헤더: rowAddr=0,           colAddr=0,2,4,6,8,10,12 (colspan=2)
//   날짜 셀:  rowAddr=1,3,5,7,9    colAddr=0,2,4,6,8,10,12 (짝수)
//   시간 셀:  rowAddr=2,4,6,8,10   colAddr=1,3,5,7,9,11,13 (홀수)
//
// 새 달의 day d 가 visualPos = offset + (d-1) 자리 차지 → 그 자리의
// 날짜셀(2W+1, 2DOW) 에 day, 시간셀(2W+2, 2DOW+1) 에 시간 배치.
// 양식이 5주(28일 + 빈 1주) 까지 커버 → 30·31일 있는 달은 마지막 며칠 잘림.
function rewriteCalendar(
  calXml: string,
  year: number,
  month: number,
  sessions: SessionInput[],
  holidays: { day: number; name: string }[]
): string {
  const dim = new Date(year, month, 0).getDate();
  const offset = new Date(year, month - 1, 1).getDay(); // 0=일

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

    // 날짜 셀: row 1·3·5·7·9, col 0·2·4·6·8·10·12
    if (row >= 1 && row <= 9 && row % 2 === 1 && col >= 0 && col <= 12 && col % 2 === 0) {
      const week = (row - 1) / 2;
      const dow = col / 2;
      const pos = week * 7 + dow;
      const day = pos - offset + 1;
      const text = day >= 1 && day <= dim ? String(day) : "";
      // 날짜 색: 일=빨강(38), 토=파랑(40), 공휴일=빨강(38), 평일=검정(2)
      let pid = 2;
      if (dow === 0) pid = 38;
      else if (dow === 6) pid = 40;
      if (day >= 1 && day <= dim && holidayMap.has(day)) pid = 38;
      return setCellText(cellXml, text, pid);
    }

    // 시간 셀: row 2·4·6·8·10, col 1·3·5·7·9·11·13
    if (row >= 2 && row <= 10 && row % 2 === 0 && col >= 1 && col <= 13 && col % 2 === 1) {
      const week = (row - 2) / 2;
      const dow = (col - 1) / 2;
      const pos = week * 7 + dow;
      const day = pos - offset + 1;

      // 1순위: 공휴일 (회기보다 우선) — 양식 원본의 설/연/휴 자리와 동일하게
      // charPrIDRef=38 (빨강 큰 폰트) 강제, 1줄 lineseg 유지
      if (day >= 1 && day <= dim) {
        const hn = holidayMap.get(day);
        if (hn) return setCellText(cellXml, hn, 38);
      }

      // 2순위: 회기 시간
      let text = "           "; // 11칸 공백 기본
      let hasSession = false;
      if (day >= 1 && day <= dim) {
        const t = sessionMap.get(day);
        if (t) { text = t.padEnd(11, " ").slice(0, 11); hasSession = true; }
      }
      // 시간 텍스트는 항상 작은 시간폰트(charPrIDRef=2)로.
      let result = setCellText(cellXml, text, 2);
      // 실제 회기 시간이 들어가는 칸은 줄바꿈 2줄 라인세그로 교체
      if (hasSession) {
        result = ensureTwoLineSeg(result);
      }
      return result;
    }

    // 그 외(헤더 등) 셀은 그대로
    return cellXml;
  });
}

// 시간 셀의 linesegarray 를 양식 원본 시간 셀(2줄로 wrap) 형태로 강제.
// 단일 lineseg(textpos=0) 만 있는 경우 textpos=6(11자 중 후반) 두 번째 segment 추가.
function ensureTwoLineSeg(cellXml: string): string {
  // 이미 textpos="6" 라인세그가 있으면 그대로 둠
  if (/textpos="6"/.test(cellXml)) return cellXml;
  // 단일 라인세그를 2줄짜리로 교체
  return cellXml.replace(
    /<hp:linesegarray><hp:lineseg\s+textpos="0"[^/]*\/><\/hp:linesegarray>/,
    `<hp:linesegarray>` +
    `<hp:lineseg textpos="0" vertpos="0" vertsize="900" textheight="900" baseline="765" spacing="540" horzpos="0" horzsize="3156" flags="393216"/>` +
    `<hp:lineseg textpos="6" vertpos="1440" vertsize="900" textheight="900" baseline="765" spacing="540" horzpos="0" horzsize="3156" flags="393216"/>` +
    `</hp:linesegarray>`
  );
}

// 셀 안의 hp:t 내용 교체. 두 패턴 처리:
//   A) <hp:run X><hp:t>이전</hp:t></hp:run>  → 텍스트(필요시 X 도) 교체
//   B) <hp:run X/>                            → <hp:run X|forcedPid><hp:t>새</hp:t></hp:run>
// forceCharPrIDRef 가 주어지면 원래 charPrIDRef 와 무관하게 그 값으로 덮어씀.
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
  // 원래 charPrIDRef 유지 모드 (날짜셀에서 주말 빨/파 보존용)
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

// ─── 라우트 핸들러 ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const p = (await req.json()) as Payload;

  let templateBuf: Buffer;
  try {
    templateBuf = await readFile(TEMPLATE_PATH);
  } catch {
    return Response.json(
      { error: "템플릿(samples/일정표_template.hwpx)을 찾을 수 없어요." },
      { status: 500 }
    );
  }

  const oldXml = readSection0(templateBuf);
  const newXml = substituteSectionXml(oldXml, p);
  const out = patchSection0(templateBuf, newXml);

  const filename = encodeURIComponent(
    `${p.childName || "일정표"}_${p.year}년${String(p.month).padStart(2, "0")}월.hwpx`
  );
  return new Response(new Uint8Array(out), {
    headers: {
      "Content-Type": "application/hwp+zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
