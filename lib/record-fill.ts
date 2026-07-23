// 빈 양식(.hwpx) 을 셀 좌표로 채우는 엔진.
//
// 표준형 기록지는 "템플릿에 든 샘플 값을 찾아 바꾸는" 방식(record-hwpx.ts)이지만,
// 지역 양식들은 거의 빈 원본이라 바꿀 값이 없다. 그래서 표(table) · 행(rowAddr) ·
// 열(colAddr) · 단락(paragraph) 좌표로 해당 셀을 찾아 글자를 직접 써넣는다.
//
// 좌표는 section0.xml 의 <hp:cellAddr colAddr rowAddr> 기준이며, 표 순서는
// 문서에 나타나는 <hp:tbl> 순서(0,1,2,...)다. (지역 양식들은 표 중첩이 없어
// 단순 순차 스캔으로 충분하다.)

import { xmlEscape } from "@/lib/hwpx";

// [표 index, rowAddr, colAddr, 단락 index(기본 0)]
export type Coord = [table: number, row: number, col: number, p?: number];

// charPr: 지정 시 해당 단락 run 의 charPrIDRef 를 교체(빨간날 색·시간 글자크기용).
export type CellEdit = { table: number; row: number; col: number; p?: number; value: string; charPr?: number };

const TBL_OPEN = "<hp:tbl";
const TBL_CLOSE = "</hp:tbl>";
const TC_OPEN = "<hp:tc";
const TC_CLOSE = "</hp:tc>";

function findNthTable(xml: string, n: number): [number, number] | null {
  let idx = 0;
  for (let i = 0; i <= n; i++) {
    const a = xml.indexOf(TBL_OPEN, idx);
    if (a < 0) return null;
    const b = xml.indexOf(TBL_CLOSE, a);
    if (b < 0) return null;
    const end = b + TBL_CLOSE.length;
    if (i === n) return [a, end];
    idx = end;
  }
  return null;
}

function findCell(tblXml: string, row: number, col: number): [number, number] | null {
  let pos = 0;
  while (true) {
    const a = tblXml.indexOf(TC_OPEN, pos);
    if (a < 0) return null;
    const b = tblXml.indexOf(TC_CLOSE, a);
    if (b < 0) return null;
    const end = b + TC_CLOSE.length;
    const cell = tblXml.slice(a, end);
    const m = cell.match(/<hp:cellAddr colAddr="(\d+)" rowAddr="(\d+)"/);
    if (m && Number(m[1]) === col && Number(m[2]) === row) return [a, end];
    pos = end;
  }
}

function findParagraph(cellXml: string, pIndex: number): [number, number] | null {
  const re = /<hp:p\b[\s\S]*?<\/hp:p>/g; // 단락은 중첩되지 않음
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(cellXml))) {
    if (i === pIndex) return [m.index, m.index + m[0].length];
    i++;
  }
  return null;
}

// 한 단락(<hp:p>)의 글자를 value 로 교체. 기존 <hp:t> 는 모두 지우고
// 첫 <hp:run> 에 새 글자를 넣는다. value 가 빈 문자열이면 셀을 비운다.
// linesegarray(줄 위치 캐시)는 제거해서 한글이 새로 계산하도록 한다.
function setParagraphText(pXml: string, value: string, charPr?: number): string {
  let p = pXml.replace(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/g, "");
  p = p.replace(/<hp:t>[\s\S]*?<\/hp:t>/g, "");
  if (charPr !== undefined) p = p.replace(/(<hp:run\s+charPrIDRef=")\d+(")/, `$1${charPr}$2`);
  if (value === "") return p;
  const esc = xmlEscape(value);
  const runIdx = p.indexOf("<hp:run");
  if (runIdx < 0) {
    // run 이 없는 빈 단락 — run 을 만들어 글자를 넣는다(매핑됐지만 입력 안 되던 칸 대응).
    const pEnd = p.lastIndexOf("</hp:p>");
    if (pEnd < 0) return p;
    const run = `<hp:run charPrIDRef="${charPr ?? 0}"><hp:t>${esc}</hp:t></hp:run>`;
    return p.slice(0, pEnd) + run + p.slice(pEnd);
  }
  const gt = p.indexOf(">", runIdx);
  if (gt < 0) return p;
  const isSelfClosing = p[gt - 1] === "/";
  if (isSelfClosing) {
    const open = p.slice(runIdx, gt + 1).replace(/\/>$/, ">");
    return p.slice(0, runIdx) + open + `<hp:t>${esc}</hp:t></hp:run>` + p.slice(gt + 1);
  }
  return p.slice(0, gt + 1) + `<hp:t>${esc}</hp:t>` + p.slice(gt + 1);
}

// 복제 단락의 <hp:p id="…"> 를 유일값으로 바꿔 원본 단락과 id 충돌을 피한다.
let clonedParaSeq = 0;
function reassignParaId(pXml: string): string {
  clonedParaSeq += 1;
  const uid = 900000000 + clonedParaSeq;
  return pXml.replace(/(<hp:p\b[^>]*\bid=")\d+(")/, `$1${uid}$2`);
}

function applyEdit(xml: string, e: CellEdit): string {
  const t = findNthTable(xml, e.table);
  if (!t) return xml;
  let tbl = xml.slice(t[0], t[1]);
  const c = findCell(tbl, e.row, e.col);
  if (!c) return xml;
  let cell = tbl.slice(c[0], c[1]);
  const pr = findParagraph(cell, e.p ?? 0);
  if (!pr) return xml;
  // 값에 줄바꿈(\n)이 있으면 줄마다 별도 <hp:p> 단락으로 만든다(셀 안 엔터).
  // 한 줄이면 예전과 동일하게 단락 하나만 채운다.
  const paraTemplate = cell.slice(pr[0], pr[1]);
  const lines = String(e.value).split("\n");
  const newPara = lines
    .map((line, i) => {
      const p = setParagraphText(paraTemplate, line, e.charPr);
      return i === 0 ? p : reassignParaId(p);
    })
    .join("");
  cell = cell.slice(0, pr[0]) + newPara + cell.slice(pr[1]);
  tbl = tbl.slice(0, c[0]) + cell + tbl.slice(c[1]);
  return xml.slice(0, t[0]) + tbl + xml.slice(t[1]);
}

export function fillCells(xml: string, edits: CellEdit[]): string {
  let out = xml;
  for (const e of edits) out = applyEdit(out, e);
  return out;
}

// 제목/문구에 박힌 "YYYY년 M월"을 사용자가 고른 연·월로 바꾼다.
// 표 칸 좌표로는 못 닿는 제목 텍스트(예: "제공기록지(2022년 1월)") 대응.
// 생년월일처럼 뒤에 '일'이 오는 완전한 날짜(2018년 3월 15일)는 건드리지 않는다.
const TITLE_MONTH_RE = /(\d{4})\s*년\s*(\d{1,2})\s*월(?!\s*\d{1,2}\s*일)/g;

export function replaceTitleMonth(text: string, year: number, month: number): string {
  return text.replace(TITLE_MONTH_RE, `${year}년 ${month}월`);
}

export function fillTitleMonth(xml: string, year: number, month: number): string {
  if (!year || !month) return xml;
  return xml.replace(/<hp:t>([\s\S]*?)<\/hp:t>/g, (full, inner: string) => {
    const r = replaceTitleMonth(inner, year, month);
    return r === inner ? full : `<hp:t>${r}</hp:t>`;
  });
}

// 제목의 "라벨 ( N월 )" 표기를 고른 월로 바꾼다(기록지·일정표 공용).
// 한글 문서는 제목이 여러 <hp:t> 런으로 쪼개져 있을 수 있어(표준형 템플릿: "…기록지"|" (6"|"월)")
// 원시 XML 정규식 한 방으로는 런 사이 태그에 막혀 못 찾는다 — 템플릿에 박힌 옛 월이 그대로
// 나가는 원인(7월 기록지 제목이 6월로 출력). 문서순 <hp:t> 텍스트를 이어붙인 좌표에서 찾고,
// 걸친 런들만 고쳐 쓴다. 숫자가 빈 양식("(  월)")이면 '월' 앞에 삽입한다.
export function fillTitleParenMonth(xml: string, label: string, month: number): string {
  if (!month) return xml;
  const segs: { start: number; end: number; text: string }[] = [];
  const tRe = /<hp:t>([\s\S]*?)<\/hp:t>/g;
  let m: RegExpExecArray | null;
  while ((m = tRe.exec(xml))) {
    const start = m.index + "<hp:t>".length;
    segs.push({ start, end: start + m[1].length, text: m[1] });
  }
  const joined = segs.map((s) => s.text).join("");
  const tm = new RegExp(`${label}\\s*[(（]\\s*(\\d*)(?=\\s*월)`).exec(joined);
  if (!tm) return xml;
  const numEnd = tm.index + tm[0].length;
  const numStart = numEnd - tm[1].length;
  const monthStr = String(month);

  // joined 좌표 [numStart, numEnd) 를 각 런의 로컬 좌표로 환산 — 새 숫자는 첫 지점의 런에
  // 넣고, 다른 런에 걸친 옛 숫자 조각은 지운다.
  const patches: { seg: (typeof segs)[number]; text: string }[] = [];
  let acc = 0;
  for (const seg of segs) {
    const s = acc;
    const e = acc + seg.text.length;
    acc = e;
    if (numStart < numEnd) {
      if (e <= numStart || s >= numEnd) continue;
      const ovS = Math.max(s, numStart);
      const ovE = Math.min(e, numEnd);
      const ins = ovS === numStart ? monthStr : "";
      patches.push({ seg, text: seg.text.slice(0, ovS - s) + ins + seg.text.slice(ovE - s) });
    } else if (s <= numStart && numStart < e) {
      patches.push({ seg, text: seg.text.slice(0, numStart - s) + monthStr + seg.text.slice(numStart - s) });
      break;
    }
  }
  let out = xml;
  for (const p of patches.sort((a, b) => b.seg.start - a.seg.start)) {
    out = out.slice(0, p.seg.start) + p.text + out.slice(p.seg.end);
  }
  return out;
}
