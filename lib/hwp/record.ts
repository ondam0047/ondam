// HWP 5.x 레코드 파서/직렬화 — hwp-poc/hwpautofit.py parse/serialize 포팅.

export const TAG = {
  IDMAP: 17,
  CHARSHAPE: 21,
  PARASHAPE: 25,
  PARA_HEADER: 66,
  PARA_TEXT: 67,
  PARA_CHARSHAPE: 68,
  PARA_LINESEG: 69,
  CTRL_HEADER: 71,
  LIST_HEADER: 72,
  TABLE: 77,
} as const;

export type Rec = { tag: number; lv: number; pay: Buffer };

export function parseRecords(buf: Buffer): Rec[] {
  const out: Rec[] = [];
  let i = 0;
  while (i + 4 <= buf.length) {
    const v = buf.readUInt32LE(i);
    const tag = v & 0x3ff;
    const lv = (v >>> 10) & 0x3ff;
    let sz = (v >>> 20) & 0xfff;
    i += 4;
    if (sz === 0xfff) {
      // 확장 헤더: size 필드 0xFFF, 뒤 UINT32 가 실제 크기
      sz = buf.readUInt32LE(i);
      i += 4;
    }
    out.push({ tag, lv, pay: Buffer.from(buf.subarray(i, i + sz)) });
    i += sz;
  }
  return out;
}

export function serializeRecords(recs: Rec[]): Buffer {
  const parts: Buffer[] = [];
  for (const r of recs) {
    const n = r.pay.length;
    if (n >= 0xfff) {
      // n >= 0xFFF 이면 확장형(4095는 이스케이프값이라 일반형으로 인코딩 불가)
      const h = Buffer.alloc(8);
      h.writeUInt32LE((r.tag & 0x3ff) | ((r.lv & 0x3ff) << 10) | (0xfff << 20), 0);
      h.writeUInt32LE(n, 4);
      parts.push(h, r.pay);
    } else {
      const h = Buffer.alloc(4);
      h.writeUInt32LE((r.tag & 0x3ff) | ((r.lv & 0x3ff) << 10) | (n << 20), 0);
      parts.push(h, r.pay);
    }
  }
  return Buffer.concat(parts);
}

// ── HWP 텍스트 디코드(제어문자 규칙: 인라인 8워드/단일 1워드) ─────────────
const CTRL_1 = new Set([0, 10, 13, 24, 25, 26, 27, 28, 29, 30, 31]);

export function paraText(pay: Buffer): string {
  const n = Math.floor(pay.length / 2);
  const out: string[] = [];
  let i = 0;
  while (i < n) {
    const c = pay.readUInt16LE(i * 2);
    if (c >= 1 && c <= 23 && !CTRL_1.has(c)) {
      i += 8; // 인라인/확장 컨트롤 8워드
    } else if (CTRL_1.has(c)) {
      if (c === 10) out.push("\n");
      i += 1;
    } else {
      out.push(String.fromCharCode(c));
      i += 1;
    }
  }
  return out.join("");
}
