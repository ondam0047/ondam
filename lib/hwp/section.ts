// Section0 레코드 훑기/패치 — hwp-poc/hwpautofit.py 포팅.
// 표/셀 구조 스캔, 단락 자식 탐색, 줄 위치 캐시(PARA_LINE_SEG) 제거.

import { TAG, paraText, type Rec } from "./record";

export type HwpCell = {
  idx: number; // LIST_HEADER 레코드 인덱스
  lv: number;
  npara: number;
  col: number;
  row: number;
  cspan: number;
  rspan: number;
  w: number;
  h: number;
  margin: [number, number, number, number]; // L,R,T,B
  paras: number[]; // PARA_HEADER 레코드 인덱스들
};

export type HwpTable = {
  inMargin: [number, number, number, number];
  cells: HwpCell[];
};

const TBL_CTRL = Buffer.from([0x20, 0x6c, 0x62, 0x74]); // 'tbl '

// 문서순 표 리스트. (PoC 실증: hwpx findNthTable 순서와 완전 일치)
export function scanTables(recs: Rec[]): HwpTable[] {
  const tables: HwpTable[] = [];
  let i = 0;
  while (i < recs.length) {
    const r = recs[i];
    if (r.tag === TAG.CTRL_HEADER && r.pay.subarray(0, 4).equals(TBL_CTRL)) {
      const base = r.lv;
      let j = i + 1;
      const tbl: HwpTable = { inMargin: [141, 141, 141, 141], cells: [] };
      let cell: HwpCell | null = null;
      while (j < recs.length && recs[j].lv > base) {
        const q = recs[j];
        if (q.tag === TAG.TABLE) {
          tbl.inMargin = [
            q.pay.readUInt16LE(10),
            q.pay.readUInt16LE(12),
            q.pay.readUInt16LE(14),
            q.pay.readUInt16LE(16),
          ];
        } else if (q.tag === TAG.LIST_HEADER && q.pay.length >= 32) {
          cell = {
            idx: j,
            lv: q.lv,
            npara: q.pay.readInt32LE(0),
            col: q.pay.readUInt16LE(8),
            row: q.pay.readUInt16LE(10),
            cspan: q.pay.readUInt16LE(12),
            rspan: q.pay.readUInt16LE(14),
            w: q.pay.readUInt32LE(16),
            h: q.pay.readUInt32LE(20),
            margin: [
              q.pay.readUInt16LE(24),
              q.pay.readUInt16LE(26),
              q.pay.readUInt16LE(28),
              q.pay.readUInt16LE(30),
            ],
            paras: [],
          };
          tbl.cells.push(cell);
        } else if (
          q.tag === TAG.PARA_HEADER &&
          cell !== null &&
          q.lv === cell.lv &&
          cell.paras.length < cell.npara
        ) {
          // 셀 단락은 LIST_HEADER 와 같은 레벨에 이어 붙는다(자식 레벨이 아님).
          // 개수는 LIST_HEADER 의 '문단 수' 로 확정.
          cell.paras.push(j);
        }
        j++;
      }
      tables.push(tbl);
      i = j;
      continue;
    }
    i++;
  }
  return tables;
}

// PARA_HEADER 의 직속 자식 레코드 인덱스.
export function paraChildren(recs: Rec[], phIdx: number): number[] {
  const lv = recs[phIdx].lv;
  const out: number[] = [];
  let j = phIdx + 1;
  while (j < recs.length && recs[j].lv > lv) {
    out.push(j);
    j++;
  }
  return out;
}

export function cellText(recs: Rec[], cell: HwpCell): string {
  const seg: string[] = [];
  for (const pi of cell.paras) {
    const t = paraChildren(recs, pi)
      .filter((k) => recs[k].tag === TAG.PARA_TEXT)
      .map((k) => paraText(recs[k].pay))
      .join("");
    if (t.trim()) seg.push(t);
  }
  return seg.join("\n");
}

// 지정 단락의 줄 위치 캐시 제거(hwpx linesegarray 삭제와 동일 의도):
// PARA_LINE_SEG 레코드를 없애고 PARA_HEADER 의 '줄 정보 수'(offset 16)를 0 으로.
export function dropLineSegs(sec: Rec[], paraIdxs: Iterable<number>): Rec[] {
  const drop = new Set<number>();
  for (const pi of paraIdxs) {
    sec[pi].pay.writeUInt16LE(0, 16);
    for (const k of paraChildren(sec, pi)) {
      if (sec[k].tag === TAG.PARA_LINESEG) drop.add(k);
    }
  }
  return sec.filter((_, i) => !drop.has(i));
}

// 0바이트 PARA_LINE_SEG 잔재 제거 — Fill(java)이 lineSeg 를 비운 단락에 hwplib 이
// 빈 레코드를 남긴다. 해당 단락 헤더의 줄 정보 수도 0 으로 맞춘다.
export function dropEmptyLineSegs(sec: Rec[]): Rec[] {
  const drop = new Set<number>();
  let curPara = -1;
  sec.forEach((r, i) => {
    if (r.tag === TAG.PARA_HEADER) curPara = i;
    else if (r.tag === TAG.PARA_LINESEG && r.pay.length === 0) {
      drop.add(i);
      if (curPara >= 0) sec[curPara].pay.writeUInt16LE(0, 16);
    }
  });
  return sec.filter((_, i) => !drop.has(i));
}
