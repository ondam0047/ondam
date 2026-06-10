// ── 라벨·기하 리졸버 PoC (v2) ──────────────────────────────────────────
// 빈 발달바우처 기록지 HWPX → 표준 라벨 + 기하 규칙으로 좌표(CoordSpec) 자동 추론,
// 손으로 만든 정답(COORD_SPECS)과 대조해 적중률 측정.
// 실행: node --experimental-strip-types --loader /tmp/alias-hook.mjs scripts/resolver-poc.ts

import { readFileSync } from "node:fs";
import path from "node:path";
import { readSection0 } from "@/lib/hwpx";
import { COORD_SPECS, type CoordSpec } from "@/lib/record-hwpx";
import type { Coord } from "@/lib/record-fill";

type Cell = { row: number; col: number; colSpan: number; text: string; norm: string };
type Table = { idx: number; cells: Cell[] };

const nz = (s: string) => s.replace(/\s+/g, "");
// 안내문/도움말 셀 (라벨로 오인 금지)
const isInstr = (norm: string) =>
  norm.length > 24 || /☞|표기합니다|바랍니다|기재합니다|받아야/.test(norm);

function parseTables(xml: string): Table[] {
  const tables: Table[] = [];
  let tpos = 0, idx = 0;
  while (true) {
    const a = xml.indexOf("<hp:tbl", tpos);
    if (a < 0) break;
    const b = xml.indexOf("</hp:tbl>", a);
    const tbl = xml.slice(a, b + 9);
    const cells: Cell[] = [];
    let cp = 0;
    while (true) {
      const ca = tbl.indexOf("<hp:tc", cp);
      if (ca < 0) break;
      const cb = tbl.indexOf("</hp:tc>", ca);
      const cell = tbl.slice(ca, cb + 8);
      const m = cell.match(/<hp:cellAddr colAddr="(\d+)" rowAddr="(\d+)"/);
      const sp = cell.match(/<hp:cellSpan colSpan="(\d+)" rowSpan="(\d+)"/);
      const text = [...cell.matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/g)].map((x) => x[1]).join("");
      if (m) cells.push({ col: +m[1], row: +m[2], colSpan: sp ? +sp[1] : 1, text, norm: nz(text) });
      cp = cb + 8;
    }
    tables.push({ idx, cells });
    idx++; tpos = b + 9;
  }
  return tables;
}

// 라벨 셀(안내문 제외) 중 키워드 매치
const labelCells = (t: Table) => t.cells.filter((c) => c.norm && !isInstr(c.norm));
const findLabel = (t: Table, kws: string[]) =>
  labelCells(t).find((c) => kws.some((k) => c.norm.includes(nz(k))));
const allLabels = (t: Table, kws: string[]) =>
  labelCells(t).filter((c) => kws.some((k) => c.norm.includes(nz(k))));

// 라벨 오른쪽 인접 셀 (빈칸 여부 무관 — 잔여데이터 있어도 값 위치는 같음)
function valueRightOf(t: Table, label: Cell): Coord | undefined {
  const c = t.cells.filter((x) => x.row === label.row && x.col > label.col)
    .sort((a, b) => a.col - b.col)[0];
  return c ? [t.idx, c.row, c.col] : undefined;
}
const cellsAtCols = (t: Table, row: number, cols: number[]): Coord[] =>
  cols.map((col) => [t.idx, row, col] as Coord);

const SKIP_COL = ["누계", "합계", "소계", "계"]; // 회기 열이 아닌 합산 열

type Derived = Partial<CoordSpec>;

function resolve(tables: Table[]): { spec: Derived; notes: string[] } {
  const notes: string[] = [];
  const spec: Derived = {} as Derived;

  // ── 헤더 ──
  for (const t of tables) {
    for (const [field, kws] of [
      ["org", ["제공기관명", "기관명"]],
      ["name", ["성명"]],
      ["birth", ["생년월일"]],
      ["serviceArea", ["제공영역"]],
    ] as const) {
      if ((spec as any)[field]) continue;
      const lb = findLabel(t, [...kws]);
      if (lb) { const v = valueRightOf(t, lb); if (v) (spec as any)[field] = v; }
    }
  }

  // ── 회기 축: '월일' AND '내용' 둘 다 든 헤더 행 ──
  let axis: { t: Table; row: number; cols: number[] } | null = null;
  for (const t of tables) {
    const dh = labelCells(t).find((c) => c.norm.includes("월일") && c.norm.includes("내용"));
    if (!dh) continue;
    const cols = t.cells.filter((c) => c.row === dh.row && c.col >= dh.col + dh.colSpan)
      .filter((c) => !SKIP_COL.some((k) => c.norm === k))
      .sort((a, b) => a.col - b.col).map((c) => c.col).slice(0, 5);
    if (cols.length) { axis = { t, row: dh.row, cols }; break; }
  }
  if (!axis) { notes.push("회기 축 미검출"); return { spec, notes }; }
  const { t: mt, cols } = axis;
  spec.date = cellsAtCols(mt, axis.row, cols);

  // 시작/종료 (다서비스면 블록)
  const starts = allLabels(mt, ["시작시간"]);
  const ends = allLabels(mt, ["종료시간"]);
  if (starts.length > 1) {
    const blocks = starts.map((s, i) => {
      const e = ends[i] ?? ends[ends.length - 1];
      const nameCell = mt.cells.filter((c) => c.col === 0 && c.norm && !isInstr(c.norm) && c.row <= s.row)
        .sort((a, b) => b.row - a.row)[0];
      const kw = nameCell ? nameCell.norm.replace(/재활.*$/, "").slice(0, 2) : `blk${i}`;
      return { keyword: kw, start: cellsAtCols(mt, s.row, cols), end: cellsAtCols(mt, e.row, cols) };
    });
    spec.start = blocks[0].start; spec.end = blocks[0].end;
    spec.serviceBlocks = blocks.slice(0, 3);
    if (blocks[3]) spec.serviceBlockDefault = { start: blocks[3].start, end: blocks[3].end };
    notes.push(`다서비스 ${blocks.length}블록: ${blocks.map((b) => b.keyword).join("/")}`);
  } else {
    if (starts[0]) spec.start = cellsAtCols(mt, starts[0].row, cols);
    if (ends[0]) spec.end = cellsAtCols(mt, ends[0].row, cols);
  }

  // 바우처(분)/추가구매(분)
  const extraLb = findLabel(mt, ["추가구매"]);
  if (extraLb) {
    spec.extra = cellsAtCols(mt, extraLb.row, cols);
    const vMin = allLabels(mt, ["바우처"]).filter((c) => c.row < extraLb.row).sort((a, b) => b.row - a.row)[0];
    if (vMin) spec.voucher = cellsAtCols(mt, vMin.row, cols);
  }

  // 총 이용금액 (+ 바우처/자부담/총금액 분해)
  const amtSection = findLabel(mt, ["총이용금액", "총 이용금액"]);
  if (amtSection) {
    const totalLb = mt.cells.filter((c) => c.norm.includes("총금액") && c.row >= amtSection.row).sort((a, b) => a.row - b.row)[0];
    const copayLb = mt.cells.filter((c) => c.norm.includes("자부담") && c.row >= amtSection.row).sort((a, b) => a.row - b.row)[0];
    if (totalLb && copayLb) {
      const vAmtLb = mt.cells.filter((c) => c.norm.includes("바우처") && c.row >= amtSection.row && c.row < copayLb.row).sort((a, b) => a.row - b.row)[0];
      spec.amount = cellsAtCols(mt, totalLb.row, cols);
      if (vAmtLb) spec.voucherAmount = cellsAtCols(mt, vAmtLb.row, cols);
      spec.copayAmount = cellsAtCols(mt, copayLb.row, cols);
      notes.push("금액 3행 분해형");
    } else {
      spec.amount = cellsAtCols(mt, amtSection.row, cols);
    }
  }

  // ── 결과표: 결과 헤더 라벨 ≥2 인 (메인 외) 테이블 ──
  const classify = (norm: string): string | null => {
    if (norm.includes("기타사항")) return "result";
    if (norm.includes("서비스결과")) return "result";
    if (norm.includes("이용자의상태")) return norm.includes("결과") ? "result" : "status";
    if (norm.includes("승인일자")) return "apprDate";
    if (norm.includes("승인번호")) return "apprNum";
    if (/제공일자|서비스일자|서비스제공일자/.test(norm)) return "date";
    if (norm === "시간") return "time";
    return null;
  };
  for (const t of tables) {
    if (t.idx === mt.idx) continue;
    const byRow = new Map<number, { field: string; col: number }[]>();
    for (const c of labelCells(t)) {
      const f = classify(c.norm);
      if (!f) continue;
      if (!byRow.has(c.row)) byRow.set(c.row, []);
      byRow.get(c.row)!.push({ field: f, col: c.col });
    }
    let best: { row: number; cols: { field: string; col: number }[] } | null = null;
    for (const [row, fs] of byRow) if (!best || fs.length > best.cols.length) best = { row, cols: fs };
    if (!best || best.cols.length < 2) continue;
    const colOf: Record<string, number> = {};
    for (const { field, col } of best.cols) if (!(field in colOf)) colOf[field] = col;
    const dataRows = [...new Set(t.cells.filter((c) => c.row > best!.row).map((c) => c.row))]
      .sort((a, b) => a - b).slice(0, 5);
    spec.result = dataRows.map((r) => {
      const o: any = {};
      for (const f of Object.keys(colOf)) o[f] = [t.idx, r, colOf[f]] as Coord;
      return o;
    });
    notes.push(`결과표=T${t.idx}, 열:${Object.keys(colOf).join("/")}, ${dataRows.length}행`);
    break;
  }

  // 비고/특이사항
  for (const t of tables) {
    const nb = findLabel(t, ["비고", "특이사항"]);
    if (nb) { const v = valueRightOf(t, nb); if (v) { spec.note = v; break; } }
  }
  return { spec, notes };
}

// ── 정답 대조 ──
const C = (c?: Coord) => (c ? `${c[0]},${c[1]},${c[2]}${c[3] != null ? "," + c[3] : ""}` : "—");
function flatten(spec: Derived | CoordSpec): Map<string, string> {
  const m = new Map<string, string>();
  const put = (k: string, c?: Coord) => { if (c) m.set(k, C(c)); };
  const putArr = (k: string, a?: Coord[]) => a?.forEach((c, i) => put(`${k}[${i}]`, c));
  put("org", (spec as any).org); put("name", (spec as any).name);
  put("birth", (spec as any).birth); put("serviceArea", (spec as any).serviceArea);
  putArr("date", spec.date); putArr("start", spec.start); putArr("end", spec.end);
  putArr("voucher", spec.voucher); putArr("extra", spec.extra); putArr("amount", spec.amount);
  putArr("voucherAmount", spec.voucherAmount); putArr("copayAmount", spec.copayAmount);
  spec.result?.forEach((r: any, i: number) => {
    for (const f of ["date", "time", "apprDate", "apprNum", "status", "result"]) put(`result[${i}].${f}`, r[f]);
  });
  put("note", (spec as any).note);
  (spec as any).serviceBlocks?.forEach((b: any, i: number) => { putArr(`block[${i}].start`, b.start); putArr(`block[${i}].end`, b.end); });
  (spec as any).serviceBlockDefault && (putArr("blockDef.start", (spec as any).serviceBlockDefault.start), putArr("blockDef.end", (spec as any).serviceBlockDefault.end));
  return m;
}

const FILES: Record<string, string> = {
  play: "기록지_template_play.hwpx", dongtan: "기록지_template_dongtan.hwpx",
  namyangju: "기록지_template_namyangju.hwpx", suncheon: "기록지_template_suncheon.hwpx",
  wonju: "기록지_template_wonju.hwpx", daegu: "기록지_template_daegu.hwpx",
};

let totHit = 0, totAll = 0;
for (const [key, file] of Object.entries(FILES)) {
  const tables = parseTables(readSection0(readFileSync(path.join(process.cwd(), "samples", file))));
  const { spec, notes } = resolve(tables);
  const truth = flatten(COORD_SPECS[key as keyof typeof COORD_SPECS]);
  const got = flatten(spec);
  let hit = 0; const miss: string[] = [];
  for (const [k, v] of truth) { if (got.get(k) === v) hit++; else miss.push(`${k}: 정답 ${v} / 추론 ${got.get(k) ?? "—"}`); }
  totHit += hit; totAll += truth.size;
  console.log(`\n===== ${key} : ${hit}/${truth.size} (${Math.round(hit / truth.size * 100)}%) =====`);
  if (notes.length) console.log("  탐지:", notes.join(" | "));
  if (miss.length) console.log("  불일치:\n   " + miss.slice(0, 10).join("\n   "));
}
console.log(`\n######## 전체 적중률: ${totHit}/${totAll} = ${Math.round(totHit / totAll * 100)}% ########`);
