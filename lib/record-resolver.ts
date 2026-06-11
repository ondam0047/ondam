// 기록지 양식 자동매핑 리졸버 — 결정론(라벨 + 표 기하).
// .hwpx section0.xml 의 표 격자를 읽어 필드→셀좌표(CoordSpec)를 추론한다.
// 근거/설계: Downloads/기록지양식.md. PoC: scripts/resolver-poc.mjs (실제 6종 100%).

import type { Coord } from "@/lib/record-fill";

export type Cell = {
  r: number; c: number; cs: number; rs: number; p: number;
  text: string; norm: string; role?: string;
};
export type Grid = Cell[][]; // [tableIndex][cell]

export type ResolvedSpec = {
  org?: Coord; name?: Coord; birth?: Coord; serviceArea?: Coord;
  date: Coord[]; start: Coord[]; end: Coord[];
  voucher: Coord[]; extra: Coord[]; amount: Coord[];
  voucherAmount?: Coord[]; copayAmount?: Coord[];
  serviceBlocks?: Array<{ start: Coord[]; end: Coord[] }>;
  result: Array<{ date?: Coord; time?: Coord; apprDate?: Coord; apprNum?: Coord; status?: Coord; result?: Coord }>;
  // 별지(2페이지) 상세 결과표 — 회기별 세로 블록(서비스제공일자·승인일자·승인번호·결과 narrative).
  detail?: Array<{ date?: Coord; apprDate?: Coord; apprNum?: Coord; result?: Coord }>;
};

export type ResolveOutput = {
  spec: ResolvedSpec;
  coverage: Record<string, boolean>;
  grid: Grid;
};

// ── 표 격자 파서 ──
export function parseTables(xml: string): Grid {
  const tbls: Grid = [];
  let p = 0;
  while (true) {
    const a = xml.indexOf("<hp:tbl", p); if (a < 0) break;
    const b = xml.indexOf("</hp:tbl>", a); if (b < 0) break;
    const t = xml.slice(a, b + 9); p = b + 9;
    const cells: Cell[] = []; let q = 0;
    while (true) {
      const ca = t.indexOf("<hp:tc", q); if (ca < 0) break;
      const cb = t.indexOf("</hp:tc>", ca); if (cb < 0) break;
      const c = t.slice(ca, cb + 8); q = cb + 8;
      const ad = c.match(/<hp:cellAddr colAddr="(\d+)" rowAddr="(\d+)"/);
      const sp = c.match(/<hp:cellSpan colSpan="(\d+)" rowSpan="(\d+)"/);
      const ts = [...c.matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/g)].map((m) => m[1]);
      const text = ts.join("").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
      const pc = (c.match(/<hp:p\b/g) || []).length;
      if (ad) cells.push({ r: +ad[2], c: +ad[1], cs: sp ? +sp[1] : 1, rs: sp ? +sp[2] : 1, p: pc, text, norm: text.replace(/\s/g, "") });
    }
    tbls.push(cells);
  }
  return tbls;
}

const isNote = (s: string) => /☞/.test(s) || /(표기합니다|기재하|바랍니다|받아야|확인하고)/.test(s) || s.length > 24;
const rowCells = (t: Cell[], r: number) => t.filter((c) => c.r === r).sort((a, b) => a.c - b.c);
const DATEX = new Set(["누계", "합계", "소계", "계"]);

export function resolveForm(xml: string): ResolveOutput {
  const tbls = parseTables(xml);
  const spec: ResolvedSpec = { date: [], start: [], end: [], voucher: [], extra: [], amount: [], result: [] };

  // HEADER
  const headerLabels: Record<string, RegExp> = { org: /제공기관명/, serviceArea: /제공영역/, name: /성명/, birth: /생년월일/ };
  for (let ti = 0; ti < tbls.length; ti++) {
    for (const cell of tbls[ti]) {
      if (isNote(cell.text)) continue;
      for (const key of Object.keys(headerLabels)) {
        if ((spec as Record<string, unknown>)[key]) continue;
        if (headerLabels[key].test(cell.norm) && cell.norm.length <= 8) {
          const val = tbls[ti].find((x) => x.r === cell.r && x.c === cell.c + cell.cs);
          if (val) (spec as Record<string, unknown>)[key] = [ti, val.r, val.c] as Coord;
        }
      }
    }
  }

  // DATE AXIS
  let dt = -1, drow = -1; let dcols: number[] = [];
  for (let ti = 0; ti < tbls.length && dt < 0; ti++) {
    for (const cell of tbls[ti]) {
      if (cell.norm.includes("월일") && cell.norm.includes("내용")) {
        dt = ti; drow = cell.r;
        dcols = rowCells(tbls[ti], cell.r).filter((x) => x.c >= cell.c + cell.cs && !DATEX.has(x.norm)).slice(0, 5).map((x) => x.c);
        break;
      }
    }
  }
  spec.date = dcols.map((c) => [dt, drow, c] as Coord);

  const dtab = dt >= 0 ? tbls[dt] : [];
  const labelRows = (re: RegExp) => [...new Set(dtab.filter((c) => re.test(c.norm)).map((c) => c.r))].sort((a, b) => a - b);
  const valsAt = (row: number): Coord[] => dcols.map((c) => [dt, row, c] as Coord);
  const startRows = labelRows(/시작시간/), endRows = labelRows(/종료시간/);
  if (startRows.length > 1) {
    spec.serviceBlocks = startRows.map((r, i) => ({ start: valsAt(r), end: valsAt(endRows[i] ?? r + 1) }));
    spec.start = valsAt(startRows[0]); spec.end = valsAt(endRows[0]);
  } else if (startRows.length === 1) {
    spec.start = valsAt(startRows[0]); if (endRows[0] != null) spec.end = valsAt(endRows[0]);
  }
  const extraRow = labelRows(/추가구매/)[0];
  if (extraRow != null) {
    spec.extra = valsAt(extraRow);
    const vRow = dtab.filter((c) => /바우처/.test(c.norm) && c.r < extraRow).map((c) => c.r).sort((a, b) => b - a)[0];
    if (vRow != null) spec.voucher = valsAt(vRow);
  }

  // 금액
  const amtLabel = dtab.find((c) => /총.?이용금액/.test(c.norm));
  if (amtLabel) {
    const copay = dtab.find((c) => /자부담/.test(c.norm) && c.r >= amtLabel.r);
    const tot = dtab.find((c) => /총\s*금액/.test(c.norm) && c.r >= amtLabel.r);
    const vAmt = dtab.find((c) => /바우처/.test(c.norm) && c.r >= amtLabel.r);
    if (copay && tot && vAmt) {
      spec.voucherAmount = valsAt(vAmt.r); spec.copayAmount = valsAt(copay.r); spec.amount = valsAt(tot.r);
    } else {
      spec.amount = valsAt(amtLabel.r);
    }
  }

  // RESULT 표
  let resultTi = -1;
  const RES = [/제공일자|서비스일자|서비스제공일자/, /승인일자/, /승인번호/, /이용자.?상태|상태/, /서비스결과|결과/, /기타사항/, /^시간$/];
  for (let ti = 0; ti < tbls.length && spec.result.length === 0; ti++) {
    if (ti === dt) continue;
    const rows = [...new Set(tbls[ti].map((c) => c.r))].sort((a, b) => a - b);
    for (const r of rows) {
      const rc = rowCells(tbls[ti], r);
      const hits = rc.filter((c) => RES.some((re) => re.test(c.norm)) && !isNote(c.text));
      if (hits.length >= 2) {
        const colOf = (re: RegExp) => { const h = rc.find((c) => re.test(c.norm)); return h ? h.c : null; };
        const map: Record<string, number | null> = {
          date: colOf(/제공일자|서비스일자|서비스제공일자/), apprDate: colOf(/승인일자/),
          apprNum: colOf(/승인번호/), time: colOf(/^시간$/),
          status: colOf(/이용자.?상태/), result: colOf(/서비스결과|기타사항|상태및서비스결과|상태\s*및/),
        };
        const dataRows = rows.filter((rr) => rr > r).slice(0, 5);
        spec.result = dataRows.map((rr) => {
          const o: Record<string, Coord> = {};
          for (const k of Object.keys(map)) { const cc = map[k]; if (cc != null) o[k] = [ti, rr, cc] as Coord; }
          return o;
        });
        resultTi = ti;
        break;
      }
    }
  }

  // 별지(detail) 표 — '서비스제공일자' 라벨이 반복되는 세로 블록 표(예: 남양주 표4)
  for (let ti = 0; ti < tbls.length && !spec.detail; ti++) {
    if (ti === dt || ti === resultTi) continue;
    const t = tbls[ti];
    const dateLabel = /서비스.?제공.?일자|^제공일자$/;
    const starts = [...new Set(t.filter((c) => dateLabel.test(c.norm) && c.norm.length <= 10).map((c) => c.r))].sort((a, b) => a - b);
    if (starts.length < 2) continue;
    const blockStarts = starts.slice(0, 5);
    const valRight = (cell: Cell | undefined) => (cell ? ([ti, cell.r, cell.c + cell.cs] as Coord) : undefined);
    spec.detail = blockStarts.map((br, i) => {
      const next = blockStarts[i + 1] ?? Infinity;
      const block = t.filter((c) => c.r >= br && c.r < next);
      const dateLbl = block.find((c) => dateLabel.test(c.norm));
      const valCol = dateLbl ? dateLbl.c + dateLbl.cs : 1;
      const wide = t.filter((c) => c.r === br && c.c > valCol).sort((a, b) => b.c - a.c)[0]; // 결과 narrative
      const o: { date?: Coord; apprDate?: Coord; apprNum?: Coord; result?: Coord } = {
        date: [ti, br, valCol] as Coord,
      };
      if (wide) o.result = [ti, wide.r, wide.c] as Coord;
      const ad = block.find((c) => /승인일자/.test(c.norm));
      const an = block.find((c) => /승인번호/.test(c.norm));
      if (ad) o.apprDate = valRight(ad);
      if (an) o.apprNum = valRight(an);
      return o;
    });
  }

  // 커버리지
  const coverage: Record<string, boolean> = {};
  for (const k of ["org", "name", "birth", "date", "start", "end", "voucher", "extra", "amount", "result"]) {
    const v = (spec as Record<string, unknown>)[k];
    coverage[k] = Array.isArray(v) ? v.length > 0 : !!v;
  }

  // 격자에 역할(role) 주석 — 미리보기 뱃지용
  const ROLE: Record<string, string> = {
    org: "기관명", name: "이름", birth: "생년월일", serviceArea: "제공영역",
    date: "날짜", start: "시작", end: "종료", voucher: "바우처(분)", extra: "추가구매",
    amount: "금액", voucherAmount: "바우처액", copayAmount: "자부담",
    rdate: "결과일자", apprDate: "승인일자", apprNum: "승인번호", time: "시간", status: "상태", result: "결과",
  };
  const mark = (coord: Coord | undefined, role: string) => {
    if (!coord) return;
    const [t, r, c] = coord;
    const cell = tbls[t]?.find((x) => x.r === r && x.c === c);
    if (cell && !cell.role) cell.role = role;
  };
  (["org", "name", "birth", "serviceArea"] as const).forEach((k) => mark(spec[k], ROLE[k]));
  (["date", "start", "end", "voucher", "extra", "amount", "voucherAmount", "copayAmount"] as const).forEach((k) => {
    const arr = spec[k]; if (Array.isArray(arr)) arr.forEach((co) => mark(co, ROLE[k]));
  });
  spec.result.forEach((row) => {
    mark(row.date, ROLE.rdate); mark(row.apprDate, ROLE.apprDate); mark(row.apprNum, ROLE.apprNum);
    mark(row.time, ROLE.time); mark(row.status, ROLE.status); mark(row.result, ROLE.result);
  });
  spec.detail?.forEach((row) => {
    mark(row.date, "별지일자"); mark(row.apprDate, "별지승인일"); mark(row.apprNum, "별지승인번호"); mark(row.result, "별지결과");
  });

  return { spec, coverage, grid: tbls };
}

// 샘플(더미) 채움 — 미리보기 안전망. spec 의 각 좌표에 보기용 값을 넣는다.
import type { CellEdit } from "@/lib/record-fill";
export function buildSampleEdits(spec: ResolvedSpec): CellEdit[] {
  const edits: CellEdit[] = [];
  const put = (coord: Coord | undefined, value: string) => {
    if (!coord) return;
    edits.push({ table: coord[0], row: coord[1], col: coord[2], p: coord[3], value });
  };
  put(spec.org, "○○발달센터");
  put(spec.name, "홍길동");
  put(spec.birth, "2018-03-15");
  put(spec.serviceArea, "언어재활");
  const days = ["3", "7", "12", "18", "24"];
  spec.date.forEach((co, i) => put(co, `6/${days[i] ?? i + 1}`));
  spec.start.forEach((co) => put(co, "10:00"));
  spec.end.forEach((co) => put(co, "10:50"));
  spec.serviceBlocks?.forEach((blk) => { blk.start.forEach((co) => put(co, "10:00")); blk.end.forEach((co) => put(co, "10:50")); });
  spec.voucher.forEach((co) => put(co, "50"));
  spec.extra.forEach((co) => put(co, "0"));
  (spec.voucherAmount ?? []).forEach((co) => put(co, "27,500"));
  (spec.copayAmount ?? []).forEach((co) => put(co, "27,500"));
  spec.amount.forEach((co) => put(co, "55,000"));
  spec.result.forEach((row, i) => {
    put(row.date, `6/${days[i] ?? i + 1}`);
    put(row.apprDate, `6/${days[i] ?? i + 1}`);
    put(row.time, "10:00");
    put(row.apprNum, "5008000000");
    put(row.status, "양호");
    put(row.result, "회기 목표 수행, 적극 참여함");
  });
  spec.detail?.forEach((row, i) => {
    put(row.date, `6/${days[i] ?? i + 1}`);
    put(row.apprDate, `6/${days[i] ?? i + 1}`);
    put(row.apprNum, "5008000000");
    put(row.result, "회기 목표 수행, 적극 참여함");
  });
  return edits;
}
