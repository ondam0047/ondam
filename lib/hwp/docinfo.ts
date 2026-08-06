// DocInfo 수술 — hwp-poc/hwpautofit.py 포팅.
// 원칙: hwplib 이 쓴 DocInfo 는 버리고, 원본 DocInfo 레코드에 우리가 만든
// CHAR_SHAPE/PARA_SHAPE 복제본만 '해당 태그 그룹의 맨 끝'에 append 한다.
// (id = 그룹 내 0-based 순번이므로 그룹 끝이 아닌 곳에 넣으면 id 체계가 무너진다.)

import { TAG, type Rec } from "./record";

const IDMAP_CHARSHAPE_IDX = 9;
const IDMAP_PARASHAPE_IDX = 13;

// 그룹 끝에 레코드 삽입 + ID_MAPPINGS 해당 슬롯 증가. 새 id 반환.
function appendShape(dinfo: Rec[], tag: number, payload: Buffer): number {
  const idxs = dinfo.reduce<number[]>((a, r, i) => (r.tag === tag ? (a.push(i), a) : a), []);
  if (idxs.length === 0) throw new Error(`DocInfo 그룹 없음: tag=${tag}`);
  const newId = idxs.length;
  dinfo.splice(idxs[idxs.length - 1] + 1, 0, { tag, lv: dinfo[idxs[0]].lv, pay: payload });
  const idmap = dinfo.find((r) => r.tag === TAG.IDMAP);
  if (!idmap) throw new Error("ID_MAPPINGS 없음");
  const slot = tag === TAG.CHARSHAPE ? IDMAP_CHARSHAPE_IDX : IDMAP_PARASHAPE_IDX;
  idmap.pay.writeUInt32LE(idmap.pay.readUInt32LE(slot * 4) + 1, slot * 4);
  return newId;
}

export function cloneCharShape(dinfo: Rec[], baseId: number, newHeight: number): number {
  const src = dinfo.filter((r) => r.tag === TAG.CHARSHAPE)[baseId];
  const pay = Buffer.from(src.pay);
  pay.writeInt32LE(newHeight, 42); // 기준 크기(1/100pt)
  return appendShape(dinfo, TAG.CHARSHAPE, pay);
}

export function cloneParaShape(dinfo: Rec[], baseId: number, newPct: number): number {
  const src = dinfo.filter((r) => r.tag === TAG.PARASHAPE)[baseId];
  const pay = Buffer.from(src.pay);
  pay.writeInt32LE(newPct, 24); // 줄간격 (5.0.2.5 미만 필드)
  pay.writeUInt32LE(newPct, 50); // 줄간격 (5.0.2.5 이상 필드) ← hwplib 이 빠뜨리는 쪽
  return appendShape(dinfo, TAG.PARASHAPE, pay);
}

export function charShapeHeight(dinfo: Rec[], cid: number): number | null {
  const g = dinfo.filter((r) => r.tag === TAG.CHARSHAPE);
  return cid < g.length ? g[cid].pay.readInt32LE(42) : null;
}

// (종류, 값). 종류 0 = PERCENT.
export function paraShapeSpacing(dinfo: Rec[], pid: number): { kind: number; value: number } | null {
  const g = dinfo.filter((r) => r.tag === TAG.PARASHAPE);
  if (pid >= g.length) return null;
  const p = g[pid].pay;
  return { kind: p.readUInt32LE(46) & 0x1f, value: p.readUInt32LE(50) };
}
