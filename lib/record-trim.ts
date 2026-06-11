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

// 표에서 행(<hp:tr>) 삭제 — 결과표를 5행으로 정리.
// 삭제 행의 <hp:tr> 제거 + 아래 행 rowAddr 감소 + 행 가로지르는 병합셀 rowSpan 축소
// + 표 rowCnt·전체 높이 보정. (결과 데이터 행은 병합 없는 단순 셀 가정)
export function removeTableRows(xml: string, tableIndex: number, removeRows: number[]): string {
  if (!removeRows || removeRows.length === 0) return xml;
  const R = new Set(removeRows);
  const t = findNthTable(xml, tableIndex);
  if (!t) return xml;
  const tbl = xml.slice(t[0], t[1]);

  // 행 높이(rowSpan=1 셀 기준)
  const rowH: Record<number, number> = {};
  for (const cm of tbl.matchAll(/<hp:tc\b[\s\S]*?<\/hp:tc>/g)) {
    const cell = cm[0];
    const ad = cell.match(/<hp:cellAddr colAddr="\d+" rowAddr="(\d+)"/);
    const sp = cell.match(/<hp:cellSpan colSpan="\d+" rowSpan="(\d+)"/);
    const h = cell.match(/<hp:cellSz width="\d+" height="(\d+)"/);
    if (ad && h) {
      const row = +ad[1];
      const rspan = sp ? +sp[1] : 1;
      if (rspan === 1 && rowH[row] === undefined) rowH[row] = +h[1];
    }
  }
  const removedHeight = removeRows.reduce((s, r) => s + (rowH[r] ?? 0), 0);

  // <hp:tr> 단위 처리 — 각 행의 rowAddr 는 그 행 셀들의 rowAddr
  const newTbl = tbl.replace(/<hp:tr\b[\s\S]*?<\/hp:tr>/g, (tr) => {
    const ad = tr.match(/<hp:cellAddr colAddr="\d+" rowAddr="(\d+)"/);
    if (!ad) return tr; // 셀 없는 행은 그대로
    const rowAddr = +ad[1];
    if (R.has(rowAddr)) return ""; // 행 삭제
    const shift = removeRows.filter((r) => r < rowAddr).length;
    let out = tr;
    if (shift > 0) {
      // 이 행 모든 셀의 rowAddr 감소
      out = out.replace(/(<hp:cellAddr colAddr="\d+" rowAddr=")(\d+)(")/g, (_m, p1, p2, p3) => `${p1}${+p2 - shift}${p3}`);
    }
    // 이 행에서 시작해 삭제 행을 가로지르는 rowSpan 축소
    out = out.replace(/<hp:tc\b[\s\S]*?<\/hp:tc>/g, (cell) => {
      const a2 = cell.match(/<hp:cellAddr colAddr="\d+" rowAddr="(\d+)"/);
      const sp = cell.match(/<hp:cellSpan colSpan="\d+" rowSpan="(\d+)"/);
      if (!a2 || !sp) return cell;
      const rspan = +sp[1];
      if (rspan <= 1) return cell;
      const rStart = rowAddr; // (shift 전 기준으로 within 계산)
      const within = removeRows.filter((r) => r >= rStart && r < rStart + rspan).length;
      if (within === 0) return cell;
      const subH = removeRows.filter((r) => r >= rStart && r < rStart + rspan).reduce((s, r) => s + (rowH[r] ?? 0), 0);
      return cell
        .replace(/(<hp:cellSpan colSpan="\d+" rowSpan=")\d+(")/, `$1${rspan - within}$2`)
        .replace(/(<hp:cellSz width="\d+" height=")(\d+)(")/, (_m, p1, p2, p3) => `${p1}${+p2 - subH}${p3}`);
    });
    return out;
  });

  let outTbl = newTbl.replace(/(<hp:tbl\b[^>]*\browCnt=")(\d+)(")/, (_m, p1, p2, p3) => `${p1}${+p2 - R.size}${p3}`);
  outTbl = outTbl.replace(/(<hp:sz width="\d+" height=")(\d+)(")/, (_m, p1, p2, p3) => `${p1}${+p2 - removedHeight}${p3}`);
  return xml.slice(0, t[0]) + outTbl + xml.slice(t[1]);
}
