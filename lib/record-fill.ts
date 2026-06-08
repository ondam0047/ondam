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

export type CellEdit = { table: number; row: number; col: number; p?: number; value: string };

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
function setParagraphText(pXml: string, value: string): string {
  let p = pXml.replace(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/g, "");
  p = p.replace(/<hp:t>[\s\S]*?<\/hp:t>/g, "");
  if (value === "") return p;
  const esc = xmlEscape(value);
  const runIdx = p.indexOf("<hp:run");
  if (runIdx < 0) return p;
  const gt = p.indexOf(">", runIdx);
  if (gt < 0) return p;
  const isSelfClosing = p[gt - 1] === "/";
  if (isSelfClosing) {
    const open = p.slice(runIdx, gt + 1).replace(/\/>$/, ">");
    return p.slice(0, runIdx) + open + `<hp:t>${esc}</hp:t></hp:run>` + p.slice(gt + 1);
  }
  return p.slice(0, gt + 1) + `<hp:t>${esc}</hp:t>` + p.slice(gt + 1);
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
  const newPara = setParagraphText(cell.slice(pr[0], pr[1]), e.value);
  cell = cell.slice(0, pr[0]) + newPara + cell.slice(pr[1]);
  tbl = tbl.slice(0, c[0]) + cell + tbl.slice(c[1]);
  return xml.slice(0, t[0]) + tbl + xml.slice(t[1]);
}

export function fillCells(xml: string, edits: CellEdit[]): string {
  let out = xml;
  for (const e of edits) out = applyEdit(out, e);
  return out;
}
