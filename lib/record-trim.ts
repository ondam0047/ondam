// 기록지 양식의 회기 칸을 5칸으로 물리적 정리 — 표에서 초과 열 삭제.
// 한글 표 구조(noAdjust=1, 셀별 cellSz)를 직접 수정하므로 사용 전 미리보기 검증 필수.
//
// 동작: 지정 표에서 removeCols(열 인덱스)에 해당하는 셀 삭제 + 오른쪽 셀 colAddr 감소
//       + 그 열을 가로지르는 병합셀 colSpan·너비 축소 + 표 colCnt·전체 너비 보정.

const TBL_OPEN = "<hp:tbl";
const TBL_CLOSE = "</hp:tbl>";

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

export function removeTableColumns(xml: string, tableIndex: number, removeCols: number[]): string {
  if (!removeCols || removeCols.length === 0) return xml;
  const R = new Set(removeCols);
  const t = findNthTable(xml, tableIndex);
  if (!t) return xml;
  const tbl = xml.slice(t[0], t[1]);

  // 1) 열 너비(colSpan=1 셀 기준)
  const colW: Record<number, number> = {};
  for (const cm of tbl.matchAll(/<hp:tc\b[\s\S]*?<\/hp:tc>/g)) {
    const cell = cm[0];
    const ad = cell.match(/<hp:cellAddr colAddr="(\d+)"/);
    const sp = cell.match(/<hp:cellSpan colSpan="(\d+)"/);
    const w = cell.match(/<hp:cellSz width="(\d+)"/);
    if (ad && w) {
      const col = +ad[1];
      const cspan = sp ? +sp[1] : 1;
      if (cspan === 1 && colW[col] === undefined) colW[col] = +w[1];
    }
  }
  const removedWidth = removeCols.reduce((s, c) => s + (colW[c] ?? 0), 0);

  // 2) 셀 변환/삭제
  const newTbl = tbl.replace(/<hp:tc\b[\s\S]*?<\/hp:tc>/g, (cell) => {
    const ad = cell.match(/<hp:cellAddr colAddr="(\d+)"/);
    if (!ad) return cell;
    const colAddr = +ad[1];
    const sp = cell.match(/<hp:cellSpan colSpan="(\d+)"/);
    const colSpan = sp ? +sp[1] : 1;
    const cEnd = colAddr + colSpan - 1;
    const within = removeCols.filter((r) => r >= colAddr && r <= cEnd);

    if (colSpan === 1 && R.has(colAddr)) return ""; // 셀 삭제

    let out = cell;
    const shift = removeCols.filter((r) => r < colAddr).length;
    if (shift > 0) out = out.replace(/(<hp:cellAddr colAddr=")\d+(")/, `$1${colAddr - shift}$2`);
    if (within.length > 0 && sp) {
      out = out.replace(/(<hp:cellSpan colSpan=")\d+(")/, `$1${colSpan - within.length}$2`);
      const subW = within.reduce((s, c) => s + (colW[c] ?? 0), 0);
      out = out.replace(/(<hp:cellSz width=")(\d+)(")/, (_m, p1, p2, p3) => `${p1}${+p2 - subW}${p3}`);
    }
    return out;
  });

  // 3) colCnt
  let outTbl = newTbl.replace(/(<hp:tbl\b[^>]*\bcolCnt=")(\d+)(")/, (_m, p1, p2, p3) => `${p1}${+p2 - R.size}${p3}`);
  // 4) 표 전체 너비(table-level <hp:sz>, 첫 등장 — <hp:cellSz>와 구분됨)
  outTbl = outTbl.replace(/(<hp:sz width=")(\d+)(")/, (_m, p1, p2, p3) => `${p1}${+p2 - removedWidth}${p3}`);

  return xml.slice(0, t[0]) + outTbl + xml.slice(t[1]);
}
