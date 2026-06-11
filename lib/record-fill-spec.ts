// 저장된 양식(RecordForm)의 ResolvedSpec + 실제 기록지 데이터 → 채워진 .hwpx 생성.
// 자동매핑/보정 결과(spec)를 따라 실데이터를 셀에 써넣는다. 5칸/5행 물리 정리 적용.

import { readSection0, readHeader, patchSection0, patchFiles } from "@/lib/hwpx";
import { fillCells, type CellEdit, type Coord } from "@/lib/record-fill";
import { removeTableColumns, removeTableRows } from "@/lib/record-trim";
import { detectCalendarFromXml, type ResolvedSpec } from "@/lib/record-resolver";
import { buildCalendarEdits, type CalSession } from "@/lib/schedule-calendar";
import { getCellRunCharPr, addClonedCharPr } from "@/lib/hwpx-charpr";
import { holiday } from "@/lib/constants";
import type { RecordPayload, RecordSessionDetail } from "@/lib/record-hwpx";

const num = (s?: string) => Number(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;
const won = (n: number) => n.toLocaleString("ko-KR");

type FillData = {
  org: string;
  childName: string;
  childBirth: string;
  serviceType: string;
  therapistName: string;
  sessions: RecordSessionDetail[];
  // 통합 양식: 일정표 라벨 보강(역할→값). 단가·본인부담·관리번호·제공일·횟수 등.
  schedExtra?: Record<string, string>;
};

function buildRecordEdits(spec: ResolvedSpec, d: FillData): CellEdit[] {
  const edits: CellEdit[] = [];
  const put = (coord: Coord | undefined, value: string) => {
    if (!coord || value === undefined || value === null) return;
    edits.push({ table: coord[0], row: coord[1], col: coord[2], p: coord[3], value: String(value) });
  };
  const putArr = (arr: Coord[] | undefined, val: (i: number) => string) => {
    (arr ?? []).forEach((co, i) => put(co, val(i)));
  };

  // 헤더
  put(spec.org, d.org);
  put(spec.name, d.childName);
  put(spec.birth, d.childBirth);
  put(spec.serviceArea, d.serviceType);
  put(spec.serviceName, d.serviceType);
  (spec.therapist ?? []).forEach((co) => put(co, d.therapistName));

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
  spec.result.forEach((row, i) => {
    const s = S[i];
    if (!s) return;
    put(row.date, s.useDay || s.date || "");
    put(row.apprDate, s.useDay || "");
    put(row.apprNum, s.apprNumber || "");
    put(row.time, s.startTime || "");
    put(row.status, s.status || "");
    put(row.result, [s.result, s.resultExtra].filter(Boolean).join(" / "));
  });
  // 별지(상세 결과)
  spec.detail?.forEach((row, i) => {
    const s = S[i];
    if (!s) return;
    put(row.date, s.useDay || s.date || "");
    put(row.apprDate, s.useDay || "");
    put(row.apprNum, s.apprNumber || "");
    put(row.result, [s.result, s.resultExtra].filter(Boolean).join(" / "));
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

  // 셀프 보정 칸 — 역할별 실데이터. 회기 행 역할은 날짜 열에 걸쳐.
  const dCols = spec.date.map((c) => c[2]);
  const ROW = new Set(["날짜", "시작", "종료", "바우처(분)", "추가구매", "금액"]);
  const scalarVal: Record<string, string> = {
    기관명: d.org, 대상자이름: d.childName, 치료사이름: d.therapistName, 생년월일: d.childBirth,
    제공영역: d.serviceType, 서비스종류: d.serviceType,
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
      default: return "";
    }
  };
  for (const m of spec.manual ?? []) {
    if (ROW.has(m.role) && dCols.length) {
      dCols.forEach((col, i) => put([m.table, m.row, col] as Coord, rowVal(m.role, i)));
    } else if (scalarVal[m.role] !== undefined) {
      put([m.table, m.row, m.col] as Coord, scalarVal[m.role]);
    }
  }

  return edits;
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
  const all = payload.sessions ?? [];
  const chunks: RecordSessionDetail[][] = [];
  for (let i = 0; i < Math.max(1, all.length); i += 5) chunks.push(all.slice(i, i + 5));

  const data = {
    org: payload.org ?? "",
    childName: payload.childName ?? "",
    childBirth: payload.childBirth ?? "",
    serviceType: payload.serviceType ?? "",
    therapistName: therapistName ?? "",
    schedExtra,
  };

  // 통합 양식 달력 — 회기 날짜("M/D")→해당 월 일자, 시간=시작~종료. 전체 회기 기준(분할 무관).
  const yr = year ?? new Date().getFullYear();
  const calSessions: CalSession[] = all.map((s) => {
    const m = /(\d+)\s*[/.\-]\s*(\d+)/.exec(s.date ?? "");
    const day = m ? Number(m[2]) : 0;
    const time = [s.startTime, s.endTime].filter(Boolean).join("~");
    return { day, time };
  }).filter((s) => s.day > 0);
  // 저장 spec 에 달력이 없으면(구버전) 템플릿에서 재탐지
  const cal = spec.scheduleCalendar ?? detectCalendarFromXml(baseXml);

  // 통합 양식 달력: 시간 한 줄(6pt) + 빨간날 색 + 공휴일 이름(빨강·6pt) charPr 주입(1회).
  let header: string | null = null;
  let timeCharPr: number | undefined;
  let redCharPr: number | undefined;
  let holidayCharPr: number | undefined;
  const monthHolidays: { day: number; name: string }[] = [];
  if (cal && payload.month) {
    const dim = new Date(yr, payload.month, 0).getDate();
    for (let d = 1; d <= dim; d++) { const hn = holiday(yr, payload.month, d); if (hn) monthHolidays.push({ day: d, name: hn }); }
    header = readHeader(template);
    const conBase = getCellRunCharPr(baseXml, cal.table, cal.weeks[0].contentRow, cal.cols[0].startCol);
    if (conBase != null) {
      const r = addClonedCharPr(header, conBase, { height: 600 }); // 6pt → 시간 한 줄
      if (r) { header = r.xml; timeCharPr = r.id; }
      const rh = addClonedCharPr(header, conBase, { textColor: "#FF0000", height: 600 }); // 공휴일 이름
      if (rh) { header = rh.xml; holidayCharPr = rh.id; }
    }
    const wkCol = cal.cols.find((c) => c.dow !== 0) ?? cal.cols[0];
    const numBase = getCellRunCharPr(baseXml, cal.table, cal.weeks[0].numberRow, wkCol.startCol);
    if (numBase != null) {
      const r = addClonedCharPr(header, numBase, { textColor: "#FF0000" });
      if (r) { header = r.xml; redCharPr = r.id; }
    }
  }

  return chunks.map((sessionChunk) => {
    let xml = baseXml;
    if (spec.dateTable != null && spec.extraSessionCols?.length) {
      xml = removeTableColumns(xml, spec.dateTable, spec.extraSessionCols);
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
    return header
      ? patchFiles(template, { "Contents/section0.xml": xml, "Contents/header.xml": header })
      : patchSection0(template, xml);
  });
}
