// 저장된 양식(RecordForm)의 ResolvedSpec + 실제 기록지 데이터 → 채워진 .hwpx 생성.
// 자동매핑/보정 결과(spec)를 따라 실데이터를 셀에 써넣는다. 5칸/5행 물리 정리 적용.

import { readSection0, readHeader, patchSection0, patchFiles } from "@/lib/hwpx";
import { fillCells, type CellEdit, type Coord } from "@/lib/record-fill";
import { removeTableColumns, removeTableRows } from "@/lib/record-trim";
import { detectCalendarFromXml, detectOpinionFromXml, type ResolvedSpec } from "@/lib/record-resolver";
import { buildCalendarEdits, type CalSession } from "@/lib/schedule-calendar";
import { getCellRunCharPr, addClonedCharPr } from "@/lib/hwpx-charpr";
import { autoFitRecordFont } from "@/lib/record-autofit";
import { holiday } from "@/lib/constants";
import { monthDayOnly, type RecordPayload, type RecordSessionDetail } from "@/lib/record-hwpx";

const num = (s?: string) => Number(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;
const won = (n: number) => n.toLocaleString("ko-KR");

type FillData = {
  org: string;
  childName: string;
  childBirth: string;
  serviceType: string;
  therapistName: string;
  // 스칼라 역할(연도·월·종합의견) 채움용 — AI 자동매핑이 잡은 manual 역할에 쓰임.
  month?: number;
  year?: number;
  opinion?: string;
  sessions: RecordSessionDetail[];
  // 통합 양식: 일정표 라벨 보강(역할→값). 단가·본인부담·관리번호·제공일·횟수 등.
  schedExtra?: Record<string, string>;
  // 값 칸 글자 통일용 정규화 charPr(검정·동일 크기·굵게/기울임/밑줄 없음).
  normCharPr?: number;
};

// 서비스종류 등 '헤더 칸'은 보통 본문 값 칸보다 작은 글자로 설계돼 있어, 값 칸 글자통일
// (normCharPr=날짜 칸 글자크기)을 강제하면 칸을 넘쳐 두 줄이 된다. 이 역할들은 칸 고유 글자크기를 유지.
const SERVICE_ROLES = new Set(["서비스종류", "제공영역"]);

function buildRecordEdits(spec: ResolvedSpec, d: FillData): CellEdit[] {
  const edits: CellEdit[] = [];
  // 글자통일(normCharPr)에서 제외할 칸 — 칸 고유 글자크기 유지(헤더 칸 넘침 방지).
  const keepNative = new Set<CellEdit>();
  const put = (coord: Coord | undefined, value: string, native = false) => {
    if (!coord || value === undefined || value === null) return;
    const e: CellEdit = { table: coord[0], row: coord[1], col: coord[2], p: coord[3], value: String(value) };
    edits.push(e);
    if (native) keepNative.add(e);
  };
  const putArr = (arr: Coord[] | undefined, val: (i: number) => string) => {
    (arr ?? []).forEach((co, i) => put(co, val(i)));
  };
  // 결과 서술은 한 칸에 '한 번만' 쓴다 — 저장 spec 이 같은 결과칸을 자동(spec.result p0)+
  // 수동(manual '결과' p1) 으로 이중 매핑하면 첫 문단이 복제됐다(p0 채운 뒤 p1 이 둘째 문단을
  // 덮으며 [P1,P1,P2]). 물리 칸(table,row,col) 기준으로 이미 결과를 쓴 칸은 건너뛴다.
  const narrSeen = new Set<string>();
  const putNarr = (coord: Coord | undefined, value: string) => {
    if (!coord) return;
    const key = `${coord[0]},${coord[1]},${coord[2]}`;
    if (narrSeen.has(key)) return;
    narrSeen.add(key);
    put(coord, value);
  };
  // 결과 칸 본문 — 결과 다음 줄부터 사유를 '별표(*)'로 한 줄씩(엔터로 칸 바꿈) 기재.
  // (\n 은 record-fill.ts 가 셀 안 별도 단락으로 렌더)
  const composeResult = (s: RecordSessionDetail): string => {
    const base = (s.result ?? "").trim();
    const extras: string[] = [];
    const mismatch = (s.resultExtra ?? "").trim();
    if (mismatch) extras.push(mismatch.startsWith("*") ? mismatch : `* ${mismatch}`);
    if (s.retroReason) extras.push(`* 소급 사유: ${s.retroReason}`);
    return [base, ...extras].filter(Boolean).join("\n");
  };

  // 헤더
  put(spec.org, d.org);
  put(spec.name, d.childName);
  put(spec.birth, d.childBirth);
  put(spec.serviceArea, d.serviceType, true);
  put(spec.serviceName, d.serviceType, true);
  (spec.therapist ?? []).forEach((co) => put(co, d.therapistName));
  // 종합의견(부모상담 종합 의견란 등) — resolver 가 잡은 의견 칸에 채움.
  if (spec.opinion) put(spec.opinion, d.opinion ?? "");

  const S = d.sessions;
  // 회기 — 날짜축
  putArr(spec.date, (i) => S[i]?.date ?? "");
  // 다서비스(대구·파주): 라벨 매칭 정보가 spec 에 없어 첫 블록(주 서비스)에 채움.
  if (spec.serviceBlocks && spec.serviceBlocks.length > 0) {
    // 모든 블록의 시작/종료를 비워두고, serviceType 에 맞는(또는 첫) 블록만 채움.
    // 라벨 매칭 정보가 spec 에 없으므로 첫 블록에 채움(대부분 첫 줄이 주 서비스).
    const b = spec.serviceBlocks[0];
    putArr(b.start, (i) => S[i]?.startTime ?? "");
    putArr(b.end, (i) => S[i]?.endTime ?? "");
  } else {
    putArr(spec.start, (i) => S[i]?.startTime ?? "");
    putArr(spec.end, (i) => S[i]?.endTime ?? "");
  }
  putArr(spec.voucher, (i) => S[i]?.voucher ?? "");
  putArr(spec.extra, (i) => S[i]?.extra ?? "");

  // 금액 — 바우처/자부담 분리형(원주)이면 분(分) 비율로 분배, 아니면 총액.
  if (spec.voucherAmount?.length && spec.copayAmount?.length) {
    putArr(spec.amount, (i) => S[i]?.amount ?? "");
    putArr(spec.voucherAmount, (i) => {
      const tot = num(S[i]?.amount); const v = num(S[i]?.voucher); const e = num(S[i]?.extra);
      const ratio = v + e > 0 ? v / (v + e) : 1;
      return S[i] ? won(Math.round(tot * ratio)) : "";
    });
    putArr(spec.copayAmount, (i) => {
      const tot = num(S[i]?.amount); const v = num(S[i]?.voucher); const e = num(S[i]?.extra);
      const ratio = v + e > 0 ? v / (v + e) : 1;
      return S[i] ? won(tot - Math.round(tot * ratio)) : "";
    });
  } else {
    putArr(spec.amount, (i) => S[i]?.amount ?? "");
  }

  // 결과표
  // 제공일자 = 서비스이용일자(승인내역 원본, s.date), 승인일자 = 결제일(payDay).
  // (예전엔 s.useDay = 일정표 매칭 날짜를 썼는데, 회기가 옮겨지면(예: 15일→26일)
  //  승인내역엔 없는 옛 일정 날짜가 찍혀 표준형과도 어긋났음 — 표준형과 동일하게 원본 날짜 사용.)
  spec.result.forEach((row, i) => {
    const s = S[i];
    if (!s) return;
    put(row.date, s.date || "");
    put(row.apprDate, monthDayOnly(s.payDay || s.date || ""));
    put(row.apprNum, s.apprNumber || "");
    put(row.time, s.startTime || "");
    put(row.status, s.status || "");
    putNarr(row.result, composeResult(s));
  });
  // 별지(상세 결과)
  spec.detail?.forEach((row, i) => {
    const s = S[i];
    if (!s) return;
    put(row.date, s.date || "");
    put(row.apprDate, monthDayOnly(s.payDay || s.date || ""));
    put(row.apprNum, s.apprNumber || "");
    putNarr(row.result, composeResult(s));
  });

  // 일정표 라벨 칸(통합 양식)
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const schedVal: Record<string, string> = {
    대상자명: d.childName, 제공자: d.org, 제공자명: d.org, 담당: d.therapistName,
    서비스종류: d.serviceType, 작성일자: todayStr,
    ...(d.schedExtra ?? {}), // 단가·본인부담·관리번호·제공일·횟수·전화 등(통합 양식 보강)
  };
  spec.schedule?.forEach((s) => { if (schedVal[s.role] !== undefined) put(s.coord, schedVal[s.role]); });

  // 셀프 보정/AI 자동매핑 칸 — 역할별 실데이터.
  // 날짜축(가로 회기표) 역할은 dCols 에 걸쳐 채우고, 결과/비고/회차 등 칸별 역할은
  // 문서순(표·행·열)으로 i번째 회기 값을 채운다(세로 결과표·흩어진 레이아웃 지원).
  const dCols = spec.date.map((c) => c[2]);
  const DATE_AXIS = new Set(["날짜", "시작", "종료", "바우처(분)", "추가구매", "금액"]);
  const ROW = new Set([...DATE_AXIS, "결과", "비고", "회차"]);
  const scalarVal: Record<string, string> = {
    기관명: d.org, 대상자이름: d.childName, 치료사이름: d.therapistName, 생년월일: d.childBirth,
    제공영역: d.serviceType, 서비스종류: d.serviceType,
    연도: d.year ? String(d.year) : "", 월: d.month ? String(d.month) : "", 종합의견: d.opinion ?? "",
  };
  const rowVal = (role: string, i: number): string => {
    const s = S[i];
    if (!s) return "";
    switch (role) {
      case "날짜": return s.date ?? "";
      case "시작": return s.startTime ?? "";
      case "종료": return s.endTime ?? "";
      case "바우처(분)": return s.voucher ?? "";
      case "추가구매": return s.extra ?? "";
      case "금액": return s.amount ?? "";
      case "결과": return composeResult(s);
      case "회차": return String(i + 1);
      case "비고": return ""; // 발달바우처엔 회기별 비고 데이터 없음(소급/불일치는 결과 칸에)
      default: return "";
    }
  };
  // 역할별로 묶기: 같은 역할이 여러 칸이면(AI 매핑) 문서순 i번째 회기,
  // 한 칸뿐이고 날짜축 역할이면(레거시 수동 1칸) 날짜 칸들에 브로드캐스트.
  const manualRows: Record<string, Coord[]> = {};
  for (const m of spec.manual ?? []) {
    if (ROW.has(m.role)) {
      (manualRows[m.role] ??= []).push([m.table, m.row, m.col, m.p ?? 0] as Coord);
    } else if (scalarVal[m.role] !== undefined) {
      put([m.table, m.row, m.col, m.p ?? 0] as Coord, scalarVal[m.role], SERVICE_ROLES.has(m.role));
    }
  }
  for (const role of Object.keys(manualRows)) {
    const cells = manualRows[role].sort((a, b) =>
      a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || (a[3] ?? 0) - (b[3] ?? 0));
    if (cells.length === 1 && DATE_AXIS.has(role) && dCols.length) {
      const [t, r] = cells[0];
      dCols.forEach((col, i) => put([t, r, col] as Coord, rowVal(role, i)));
    } else if (role === "결과") {
      // 결과 서술은 이미 채운 칸이면 건너뜀(자동 spec.result 와 이중 매핑 시 문단 복제 방지).
      cells.forEach((co, i) => putNarr(co, rowVal(role, i)));
    } else {
      cells.forEach((co, i) => put(co, rowVal(role, i)));
    }
  }

  // 값 칸에 정규화 글자속성 적용(검정·동일 크기·굵게/기울임/밑줄 없음).
  // 단, 헤더 칸(서비스종류 등 keepNative)은 칸 고유 글자크기를 유지해 넘침을 막는다.
  return d.normCharPr != null
    ? edits.map((e) => (keepNative.has(e) ? e : { ...e, charPr: d.normCharPr }))
    : edits;
}

// 저장 양식으로 기록지 .hwpx 생성. 회기 5개 초과면 5개씩 나눠 여러 장.
export function generateRecordFromForm(
  template: Buffer,
  specJson: string,
  payload: RecordPayload,
  therapistName: string,
  schedExtra?: Record<string, string>,
  year?: number,
): Buffer[] {
  const spec = JSON.parse(specJson) as ResolvedSpec;
  const baseXml = readSection0(template);
  // 구버전 저장 spec 은 opinion 이 없어 종합의견이 비어 나왔다 — 템플릿에서 즉석 탐지해 보강.
  if (!spec.opinion) { const op = detectOpinionFromXml(baseXml); if (op) spec.opinion = op; }
  const all = payload.sessions ?? [];
  const chunks: RecordSessionDetail[][] = [];
  for (let i = 0; i < Math.max(1, all.length); i += 5) chunks.push(all.slice(i, i + 5));

  const yr = year ?? new Date().getFullYear();
  const calSessions: CalSession[] = all.map((s) => {
    const m = /(\d+)\s*[/.\-]\s*(\d+)/.exec(s.date ?? "");
    const day = m ? Number(m[2]) : 0;
    const time = [s.startTime, s.endTime].filter(Boolean).join("~");
    return { day, time };
  }).filter((s) => s.day > 0);
  // 저장 spec 에 달력이 없으면(구버전) 템플릿에서 재탐지. 단, 기록지 슬롯으로 좁힌 통합 양식
  // (noSchedule)은 재탐지하지 않음 — 일정표 영역(달력)을 기록지 출력이 건드리지 않게 한다.
  const cal = spec.noSchedule ? null : (spec.scheduleCalendar ?? detectCalendarFromXml(baseXml));

  // ── 글자속성(charPr) 주입: 값 칸 통일(정규화) + (통합양식) 달력. header 1회 패치. ──
  let header: string | null = null;
  const inject = (baseId: number | null, opts: { height?: number; textColor?: string; normalize?: boolean }): number | undefined => {
    if (baseId == null) return undefined;
    const r = addClonedCharPr(header ?? readHeader(template), baseId, opts);
    if (!r) return undefined;
    header = r.xml;
    return r.id;
  };

  // 값 칸 글자 통일 — 대표 값 칸의 글자속성을 복제해 검정·동일 크기·굵게/기울임/밑줄 제거.
  const normBase = spec.date?.[0] ?? spec.name ?? spec.start?.[0] ?? spec.org;
  const normCharPr = normBase
    ? inject(getCellRunCharPr(baseXml, normBase[0], normBase[1], normBase[2]), { normalize: true, textColor: "#000000" })
    : undefined;

  // 통합 양식 달력: 시간 6pt(한 줄) + 빨간날 색 + 공휴일 이름(빨강·6pt).
  let timeCharPr: number | undefined;
  let redCharPr: number | undefined;
  let holidayCharPr: number | undefined;
  const monthHolidays: { day: number; name: string }[] = [];
  if (cal && payload.month) {
    const dim = new Date(yr, payload.month, 0).getDate();
    for (let d = 1; d <= dim; d++) { const hn = holiday(yr, payload.month, d); if (hn) monthHolidays.push({ day: d, name: hn }); }
    const conBase = getCellRunCharPr(baseXml, cal.table, cal.weeks[0].contentRow, cal.cols[0].startCol);
    timeCharPr = inject(conBase, { height: 600 });
    holidayCharPr = inject(conBase, { textColor: "#FF0000", height: 600 });
    const wkCol = cal.cols.find((c) => c.dow !== 0) ?? cal.cols[0];
    redCharPr = inject(getCellRunCharPr(baseXml, cal.table, cal.weeks[0].numberRow, wkCol.startCol), { textColor: "#FF0000" });
  }

  const data = {
    org: payload.org ?? "",
    childName: payload.childName ?? "",
    childBirth: payload.childBirth ?? "",
    serviceType: payload.serviceType ?? "",
    therapistName: therapistName ?? "",
    month: payload.month,
    year: yr,
    opinion: payload.opinion ?? "",
    schedExtra,
    normCharPr,
  };

  // 결과 narrative 칸을 표별로 모아둔다 — 출력 시 긴 결과가 칸을 넘쳐 다음 표와 겹치는 걸
  // 막기 위해 글자 자동축소(autoFitRecordFont)를 적용한다(내장 standard 양식과 동일 처리).
  const narrByTable = new Map<number, Set<number>>();
  const addNarr = (co?: Coord) => { if (co) (narrByTable.get(co[0]) ?? narrByTable.set(co[0], new Set()).get(co[0])!).add(co[2]); };
  spec.result?.forEach((row) => addNarr(row.result));
  spec.detail?.forEach((row) => addNarr(row.result));
  for (const m of spec.manual ?? []) if (m.role === "결과") addNarr([m.table, m.row, m.col, m.p ?? 0] as Coord);

  return chunks.map((sessionChunk) => {
    let xml = baseXml;
    if (spec.dateTable != null && spec.extraSessionCols?.length) {
      // 남은 회기열(spec.date)에 지운 폭을 재분배 → 표 너비 유지로 우측이 다른 표와 정렬됨.
      xml = removeTableColumns(xml, spec.dateTable, spec.extraSessionCols, { redistributeTo: spec.date.map((d) => d[2]) });
    }
    if (spec.resultTable != null && spec.extraResultRows?.length) {
      xml = removeTableRows(xml, spec.resultTable, spec.extraResultRows);
    }
    const edits = buildRecordEdits(spec, { ...data, sessions: sessionChunk });
    if (cal && payload.month) {
      edits.push(...buildCalendarEdits(cal, yr, payload.month, calSessions, { timeCharPr, redCharPr, holidayCharPr, holidays: monthHolidays }));
    }
    xml = fillCells(xml, edits);
    // 제목의 "( N월 )" 채우기 (빈 양식은 "(  월)" 처럼 비어 있음)
    if (payload.month) xml = xml.replace(/(기록지\s*\(\s*)\d*(\s*월)/, `$1${payload.month}$2`);
    // 결과 칸 글자 자동축소 — 긴 결과가 칸을 넘쳐 아래 표와 겹치는 것 방지.
    let outHeader = header;
    if (narrByTable.size) {
      let h = outHeader ?? readHeader(template);
      for (const [tbl, cols] of narrByTable) {
        const fit = autoFitRecordFont(xml, h, { resultTable: tbl, narrativeCols: [...cols] });
        xml = fit.section; h = fit.header;
      }
      outHeader = h;
    }
    return outHeader
      ? patchFiles(template, { "Contents/section0.xml": xml, "Contents/header.xml": outHeader })
      : patchSection0(template, xml);
  });
}
