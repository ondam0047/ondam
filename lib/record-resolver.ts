// 기록지 양식 자동매핑 리졸버 — 결정론(라벨 + 표 기하).
// .hwpx section0.xml 의 표 격자를 읽어 필드→셀좌표(CoordSpec)를 추론한다.
// 근거/설계: Downloads/기록지양식.md. PoC: scripts/resolver-poc.mjs (실제 6종 100%).

import type { Coord } from "@/lib/record-fill";

// 일정표 라벨 칸의 데이터 출처 — 실제 채움(출력 연동) 단계에서 사용.
// 사용자 규칙: 서비스 제공자명 = 치료사 이름, 서비스 종류 = 치료사 종류(therapistType) 기반.
export const SCHEDULE_FIELD_SOURCE: Record<string, string> = {
  관리번호: "child.mgmtNumber",
  대상자명: "child.name",
  제공자: "center.name",
  제공자명: "center.name", // 서비스 제공자명 = 기관명
  작성일자: "today",
  전화: "center.phone",
  담당: "therapist.name",
  서비스종류: "THERAPIST_TO_SERVICE[therapistType]", // 치료사 종류 기반 (lib/constants)
  주기: "schedule.weekly",
  제공일: "schedule.days",
  단가: "childService.defaultUnit",
  횟수: "schedule.count",
  총금액: "computed(단가×횟수)",
  본인부담금: "childService.monthlyCopay",
};

export type Cell = {
  r: number; c: number; cs: number; rs: number; p: number;
  text: string; norm: string; role?: string;
};
export type Grid = Cell[][]; // [tableIndex][cell]

// 월 달력 격자 기하 — 요일 헤더 아래 (숫자행, 내용행) 쌍이 주(週)마다 반복.
export type ScheduleCalendar = {
  table: number;
  headerRow: number;
  leftmostDow: number; // 맨 왼쪽 요일의 요일번호(일0~토6)
  cols: Array<{ dow: number; startCol: number; span: number }>; // 열 순서대로
  weeks: Array<{ numberRow: number; contentRow: number }>;       // 위→아래
};

const WD: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };

// 달력 표 탐지 — 한 행에 단일 요일글자 셀이 4개 이상이면 그 표를 달력으로 본다.
export function detectScheduleCalendar(tbls: Grid, candidates: number[]): ScheduleCalendar | null {
  for (const ti of candidates) {
    const t = tbls[ti];
    if (!t) continue;
    const rows = [...new Set(t.map((c) => c.r))].sort((a, b) => a - b);
    for (const hr of rows) {
      const wd = t.filter((c) => c.r === hr && c.norm.length === 1 && WD[c.norm] !== undefined).sort((a, b) => a.c - b.c);
      if (wd.length < 4) continue;
      const cols = wd.map((c) => ({ dow: WD[c.norm], startCol: c.c, span: c.cs }));
      const leftmostDow = cols[0].dow;
      const bodyRows = rows.filter((r) => r > hr);
      const weeks: Array<{ numberRow: number; contentRow: number }> = [];
      const span0 = cols[0].span;
      const c0 = cols[0].startCol;
      for (let i = 0; i + 1 < bodyRows.length; i += 2) {
        const ra = bodyRows[i], rb = bodyRows[i + 1];
        const aCell = t.find((c) => c.r === ra && c.c === c0);
        const aIsContent = span0 > 1 && aCell != null && aCell.cs === span0; // 병합된 쪽이 내용행
        weeks.push(aIsContent ? { numberRow: rb, contentRow: ra } : { numberRow: ra, contentRow: rb });
      }
      if (weeks.length === 0) continue;
      return { table: ti, headerRow: hr, leftmostDow, cols, weeks };
    }
  }
  return null;
}

export type ResolvedSpec = {
  org?: Coord; name?: Coord; birth?: Coord; serviceArea?: Coord;
  date: Coord[]; start: Coord[]; end: Coord[];
  voucher: Coord[]; extra: Coord[]; amount: Coord[];
  voucherAmount?: Coord[]; copayAmount?: Coord[];
  therapist?: Coord[]; // 담당재활사 행 × 날짜 열 — 치료사 이름 자동 채움
  serviceName?: Coord; // 본표 서비스 종류 칸("( )재활") — 치료사 종류 기반 채움
  dateTable?: number;          // 회기(날짜축) 표 인덱스
  extraSessionCols?: number[]; // 5칸 초과 회기 열(날짜축에서 6번째 이후, 누계 제외) — 5칸 정리용
  resultTable?: number;        // 결과표(상태 및 결과 기록) 표 인덱스
  extraResultRows?: number[];  // 5행 초과 결과 데이터 행(빈 행 6번째 이후, footer 제외) — 5행 정리용
  serviceBlocks?: Array<{ start: Coord[]; end: Coord[] }>;
  result: Array<{ date?: Coord; time?: Coord; apprDate?: Coord; apprNum?: Coord; status?: Coord; result?: Coord }>;
  // 별지(2페이지) 상세 결과표 — 회기별 세로 블록(서비스제공일자·승인일자·승인번호·결과 narrative).
  detail?: Array<{ date?: Coord; apprDate?: Coord; apprNum?: Coord; result?: Coord }>;
  // 일정표(서식9) 라벨 칸 — 통합양식의 일정표 영역. 1단계는 라벨 필드만(격자 본문 제외).
  schedule?: Array<{ role: string; coord: Coord }>;
  // 일정표 월 달력 격자(2단계) — 날짜 숫자 + 회기 시간 본문 채움용 기하 정보.
  scheduleCalendar?: ScheduleCalendar;
  // 셀프 보정으로 사용자가 직접 지정한 칸(역할 중복 허용 — 같은 값을 여러 칸에 채움).
  manual?: Array<{ role: string; table: number; row: number; col: number }>;
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

  // 일정표(서식9) + 기록지(서식11)가 한 파일에 합쳐진 양식 대응:
  // '제공기관명'(서식11 고유)이 처음 나오는 표부터를 기록지 영역으로 보고, 그 이전(일정표)은 별도 처리.
  let recordStartIdx = -1;
  for (let ti = 0; ti < tbls.length; ti++) {
    if (tbls[ti].some((c) => /제공기관명/.test(c.norm))) { recordStartIdx = ti; break; }
  }
  const recordStart = recordStartIdx >= 0 ? recordStartIdx : 0;
  // 일정표 영역: 통합양식이면 기록지 앞쪽 표들, 기록지가 없으면(일정표 단독) 전체.
  const schedTables: number[] =
    recordStartIdx > 0 ? Array.from({ length: recordStartIdx }, (_, i) => i)
    : recordStartIdx === -1 ? tbls.map((_, i) => i)
    : [];

  // 일정표 라벨 칸(1단계) — 라벨→오른쪽(헤더형) / 라벨→아래(열헤더형)
  const sched: Array<{ role: string; coord: Coord }> = [];
  const seenS = new Set<string>(); // 좌표 기준 중복제거 — 같은 역할이 여러 표(제공현황·비용)에 있어도 모두 잡음
  const pushS = (role: string, coord: Coord | undefined) => {
    if (!coord) return;
    const key = `${coord[0]},${coord[1]},${coord[2]}`;
    if (seenS.has(key)) return;
    seenS.add(key);
    sched.push({ role, coord });
  };
  const S_RIGHT: Array<[string, RegExp]> = [["관리번호", /관리번호/], ["작성일자", /작성일자/], ["대상자명", /^성명$/], ["제공자", /서비스제공자$/]];
  const S_BELOW: Array<[string, RegExp]> = [["제공자명", /서비스제공자명|^제공자명$/], ["전화", /^전화$/], ["담당", /^담당$/], ["서비스종류", /서비스종류/], ["주기", /^주기$/], ["제공일", /^제공일$/], ["단가", /단가/], ["횟수", /^횟수$/], ["총금액", /총서비스가격|^총금액$/], ["본인부담금", /본인부담금/]];
  for (const ti of schedTables) {
    const t = tbls[ti];
    for (const cell of t) {
      if (isNote(cell.text) || cell.norm.length > 14) continue;
      for (const [role, re] of S_RIGHT) if (re.test(cell.norm)) {
        const v = t.find((x) => x.r === cell.r && x.c === cell.c + cell.cs);
        pushS(role, v ? ([ti, v.r, v.c] as Coord) : undefined);
      }
      for (const [role, re] of S_BELOW) if (re.test(cell.norm)) {
        const v = t.find((x) => x.r === cell.r + 1 && x.c === cell.c);
        pushS(role, v ? ([ti, v.r, v.c] as Coord) : undefined);
      }
    }
  }
  if (sched.length) spec.schedule = sched;

  // 일정표 월 달력 격자(2단계) — 일정표 영역(통합양식) 또는 전체(단독)에서 탐지.
  const calCandidates = schedTables.length ? schedTables : tbls.map((_, i) => i);
  const cal = detectScheduleCalendar(tbls, calCandidates);
  if (cal) spec.scheduleCalendar = cal;

  // HEADER
  const headerLabels: Record<string, RegExp> = { org: /제공기관명/, serviceArea: /제공영역/, name: /성명/, birth: /생년월일/ };
  for (let ti = recordStart; ti < tbls.length; ti++) {
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
  let dt = -1, drow = -1; let dcols: number[] = []; let allDateCols: number[] = [];
  for (let ti = recordStart; ti < tbls.length && dt < 0; ti++) {
    for (const cell of tbls[ti]) {
      if (cell.norm.includes("월일") && cell.norm.includes("내용")) {
        dt = ti; drow = cell.r;
        allDateCols = rowCells(tbls[ti], cell.r).filter((x) => x.c >= cell.c + cell.cs && !DATEX.has(x.norm)).map((x) => x.c);
        dcols = allDateCols.slice(0, 5);
        break;
      }
    }
  }
  spec.date = dcols.map((c) => [dt, drow, c] as Coord);
  if (dt >= 0) spec.dateTable = dt;
  if (allDateCols.length > 5) spec.extraSessionCols = allDateCols.slice(5);

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
  // 담당재활사 행 × 날짜 열 → 치료사 이름 자동 채움(다서비스 양식은 블록마다 행이 여러 개)
  const therapistRows = labelRows(/담당재활사/);
  if (therapistRows.length > 0 && dcols.length > 0) {
    spec.therapist = therapistRows.flatMap((r) => valsAt(r));
  }
  // 본표 서비스 종류 칸 — 시작시간 줄 맨 왼쪽 칸("( )재활"). 단일 서비스 양식만.
  if (startRows.length === 1) {
    const sr = startRows[0];
    const svc = dtab.filter((c) => c.c === 0 && c.r <= sr && c.r + c.rs > sr)[0];
    if (svc) spec.serviceName = [dt, svc.r, 0] as Coord;
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
  for (let ti = recordStart; ti < tbls.length && spec.result.length === 0; ti++) {
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
        spec.resultTable = ti;
        // 5행 정리용: 헤더 뒤 '빈' 데이터 행(셀이 모두 비었거나 / : · 만) 중 6번째 이후. footer(라벨 행)는 제외.
        const emptyRows = rows.filter((rr) => rr > r && rowCells(tbls[ti], rr).every((cc) => !cc.norm || /^[/:·]+$/.test(cc.norm)));
        if (emptyRows.length > 5) spec.extraResultRows = emptyRows.slice(5);
        break;
      }
    }
  }

  // 별지(detail) 표 — '서비스제공일자' 라벨이 반복되는 세로 블록 표(예: 남양주 표4)
  for (let ti = recordStart; ti < tbls.length && !spec.detail; ti++) {
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
    org: "기관명", name: "대상자이름", birth: "생년월일", serviceArea: "제공영역",
    date: "날짜", start: "시작", end: "종료", voucher: "바우처(분)", extra: "추가구매",
    amount: "금액", voucherAmount: "바우처액", copayAmount: "자부담", therapist: "치료사이름",
    rdate: "결과일자", apprDate: "승인일자", apprNum: "승인번호", time: "시간", status: "상태", result: "결과",
  };
  const mark = (coord: Coord | undefined, role: string) => {
    if (!coord) return;
    const [t, r, c] = coord;
    const cell = tbls[t]?.find((x) => x.r === r && x.c === c);
    if (cell && !cell.role) cell.role = role;
  };
  (["org", "name", "birth", "serviceArea"] as const).forEach((k) => mark(spec[k], ROLE[k]));
  mark(spec.serviceName, "서비스종류");
  (["date", "start", "end", "voucher", "extra", "amount", "voucherAmount", "copayAmount", "therapist"] as const).forEach((k) => {
    const arr = spec[k]; if (Array.isArray(arr)) arr.forEach((co) => mark(co, ROLE[k]));
  });
  spec.result.forEach((row) => {
    mark(row.date, ROLE.rdate); mark(row.apprDate, ROLE.apprDate); mark(row.apprNum, ROLE.apprNum);
    mark(row.time, ROLE.time); mark(row.status, ROLE.status); mark(row.result, ROLE.result);
  });
  spec.detail?.forEach((row) => {
    mark(row.date, "별지일자"); mark(row.apprDate, "별지승인일"); mark(row.apprNum, "별지승인번호"); mark(row.result, "별지결과");
  });
  spec.schedule?.forEach((s) => mark(s.coord, `일정·${s.role}`));
  if (spec.scheduleCalendar) {
    const cal = spec.scheduleCalendar;
    for (const w of cal.weeks) for (const col of cal.cols) {
      mark([cal.table, w.numberRow, col.startCol] as Coord, "달력·날짜");
      mark([cal.table, w.contentRow, col.startCol] as Coord, "달력·일정");
    }
  }

  return { spec, coverage, grid: tbls };
}

// 셀프 보정 — 사용자가 칸 클릭으로 지정한 역할. 역할은 같은 값이 여러 칸에 들어갈 수
// 있으므로(예: 대상자이름이 일정표·기록지 두 군데) spec.manual 목록에 다중 보존한다.
// 자동 인식이 틀린 칸은 "" (해제)로 제거.
const OVERRIDE_FIELD: Record<string, "org" | "name" | "birth" | "serviceArea" | "serviceName"> = {
  기관명: "org", 대상자이름: "name", 생년월일: "birth", 제공영역: "serviceArea", 서비스종류: "serviceName",
};
const ARRAY_FIELDS: Array<"date" | "start" | "end" | "voucher" | "extra" | "amount"> = ["date", "start", "end", "voucher", "extra", "amount"];

export function applyOverrides(
  spec: ResolvedSpec,
  overrides: Array<{ table: number; row: number; col: number; role: string }>,
): ResolvedSpec {
  const same = (c: Coord | undefined, t: number, r: number, col: number) =>
    !!c && c[0] === t && c[1] === r && c[2] === col;
  const manual = [...(spec.manual ?? [])];
  const idxOf = (t: number, r: number, c: number) => manual.findIndex((m) => m.table === t && m.row === r && m.col === c);

  for (const ov of overrides) {
    if (!ov.role) {
      // 해제: 보정 목록에서 제거 + 자동 인식(스칼라/배열)에서도 제거
      const i = idxOf(ov.table, ov.row, ov.col);
      if (i >= 0) manual.splice(i, 1);
      for (const f of Object.values(OVERRIDE_FIELD)) {
        if (same(spec[f], ov.table, ov.row, ov.col)) spec[f] = undefined;
      }
      for (const af of ARRAY_FIELDS) {
        if (spec[af].some((c) => same(c, ov.table, ov.row, ov.col))) spec[af] = [];
      }
    } else {
      // 지정: 보정 목록에 추가(같은 칸은 교체, 같은 역할은 여러 칸 허용)
      const entry = { role: ov.role, table: ov.table, row: ov.row, col: ov.col };
      const i = idxOf(ov.table, ov.row, ov.col);
      if (i >= 0) manual[i] = entry; else manual.push(entry);
    }
  }
  spec.manual = manual;
  return spec;
}

// 샘플(더미) 채움 — 미리보기 안전망. spec 의 각 좌표에 보기용 값을 넣는다.
import type { CellEdit } from "@/lib/record-fill";
import { buildCalendarEdits } from "@/lib/schedule-calendar";
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
  put(spec.serviceName, "언어재활");
  const days = ["3", "7", "12", "18", "24"];
  spec.date.forEach((co, i) => put(co, `6/${days[i] ?? i + 1}`));
  spec.start.forEach((co) => put(co, "10:00"));
  spec.end.forEach((co) => put(co, "10:50"));
  (spec.therapist ?? []).forEach((co) => put(co, "김치료"));
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
  const schedDummy: Record<string, string> = {
    관리번호: "바-2026-001", 작성일자: "2026-06-01", 대상자명: "홍길동", 제공자: "○○발달센터",
    제공자명: "○○발달센터", 전화: "02-000-0000", 담당: "김치료", 서비스종류: "언어재활", 주기: "주 2회", 제공일: "화·목",
    단가: "60,000", 횟수: "월 8회", 총금액: "480,000", 본인부담금: "48,000",
  };
  spec.schedule?.forEach((s) => put(s.coord, schedDummy[s.role] ?? "샘플"));

  // 달력 샘플 — 2026년 6월에 더미 회기일(3·7·12·18·24)을 배치해 미리보기로 검증.
  if (spec.scheduleCalendar) {
    const sampleSessions = days.map((d) => ({ day: Number(d), time: "10:00~10:50" }));
    edits.push(...buildCalendarEdits(spec.scheduleCalendar, 2026, 6, sampleSessions));
  }

  // 셀프 보정 칸 — 역할별 더미값. 회기 행 역할은 날짜 열에 걸쳐 채움.
  const roleDummy: Record<string, string> = {
    기관명: "○○발달센터", 대상자이름: "홍길동", 생년월일: "2018-03-15", 제공영역: "언어재활",
    서비스종류: "언어재활", 치료사이름: "김치료",
    시작: "10:00", 종료: "10:50", "바우처(분)": "50", 추가구매: "0", 금액: "55,000",
  };
  const ROW_ROLES = new Set(["날짜", "시작", "종료", "바우처(분)", "추가구매", "금액"]);
  const dCols = spec.date.map((d) => d[2]);
  for (const m of spec.manual ?? []) {
    if (ROW_ROLES.has(m.role) && dCols.length > 0) {
      dCols.forEach((col, i) => put([m.table, m.row, col] as Coord, m.role === "날짜" ? `6/${days[i] ?? i + 1}` : roleDummy[m.role] ?? "샘플"));
    } else {
      put([m.table, m.row, m.col] as Coord, roleDummy[m.role] ?? "샘플");
    }
  }
  return edits;
}
