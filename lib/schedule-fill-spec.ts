// 저장된 일정표 양식(RecordForm kind=schedule)의 spec + 실데이터 → 채워진 .hwpx.
// 1단계: 라벨 칸(관리번호·대상자명·제공자·서비스종류·단가·본인부담·주기·제공일 등).
// (요일×슬롯 주간 격자 본문은 다음 단계)

import { readSection0, readHeader, patchSection0, patchFiles } from "@/lib/hwpx";
import { fillCells, fillTitleParenMonth, type CellEdit, type Coord } from "@/lib/record-fill";
import { detectCalendarFromXml, type ResolvedSpec } from "@/lib/record-resolver";
import { buildCalendarEdits } from "@/lib/schedule-calendar";
import { getCellRunCharPr, addClonedCharPr } from "@/lib/hwpx-charpr";
import type { SchedulePayload } from "@/lib/schedule-hwpx";

const won = (n: number) => (Number(n) || 0).toLocaleString("ko-KR");

export function generateScheduleFromForm(
  template: Buffer,
  specJson: string,
  p: SchedulePayload,
): Buffer {
  const spec = JSON.parse(specJson) as ResolvedSpec;
  let xml = readSection0(template);

  const weekdays = [...new Set((p.sessions ?? []).map((s) => s.weekday).filter(Boolean))].join("·");
  // 일정표 라벨 역할 → 실데이터. (서비스 제공자명 = 기관명, 담당 = 치료사)
  const roleVal: Record<string, string> = {
    관리번호: p.mgmtNumber ?? "",
    대상자명: p.childName ?? "",
    제공자: p.pvOrg ?? "",
    제공자명: p.pvOrg ?? "", // 서비스 제공자명 = 기관명
    담당: p.pvCharge || p.therapist || "",
    작성일자: p.writeDate ?? "",
    서비스종류: p.serviceType || p.pvType || "",
    전화: p.pvTel ?? "",
    단가: p.costUnit ?? "",
    횟수: p.sessions?.length ? String(p.sessions.length) : "",
    총금액: p.costTotal ? won(p.costTotal) : "",
    본인부담금: p.costSelf ?? "",
    주기: p.cycle ?? "",
    제공일: weekdays,
  };
  // 셀프 보정(스칼라) 역할 → 실데이터
  const scalarVal: Record<string, string> = {
    기관명: p.pvOrg ?? "", 대상자이름: p.childName ?? "", 치료사이름: p.therapist ?? "",
    생년월일: p.childBirth ?? "", 제공영역: p.serviceType || p.pvType || "", 서비스종류: p.serviceType || p.pvType || "",
  };

  // ── 글자속성(charPr) 주입: 값 글자 통일 + 달력. header 1회 패치. ──
  let header = readHeader(template);
  let usedHeader = false;
  const mk = (baseId: number | null, opts: { height?: number; textColor?: string; normalize?: boolean }): number | undefined => {
    if (baseId == null) return undefined;
    const r = addClonedCharPr(header, baseId, opts);
    if (!r) return undefined;
    header = r.xml; usedHeader = true;
    return r.id;
  };
  // 월 달력 격자(저장 spec 에 없으면 템플릿에서 재탐지)
  const cal = spec.scheduleCalendar ?? detectCalendarFromXml(xml);
  // 통합 양식(일정표+기록지 한 표, 예: 성심)이면 시간 칸이 좁아 6pt 로 한 줄 맞춤.
  const isCombined = /제공기관명/.test(xml);

  // 라벨/스칼라 값 글자 통일 — 첫 라벨 값칸(없으면 달력 내용칸) 기준으로 검정·동일크기·굵게/기울임/밑줄 제거.
  const labelBase: Coord | undefined =
    spec.schedule?.[0]?.coord
    ?? (spec.manual?.[0] ? [spec.manual[0].table, spec.manual[0].row, spec.manual[0].col, spec.manual[0].p ?? 0] as Coord : undefined)
    ?? (cal ? [cal.table, cal.weeks[0].contentRow, cal.cols[0].startCol] as Coord : undefined);
  const labelNormCharPr = labelBase
    ? mk(getCellRunCharPr(xml, labelBase[0], labelBase[1], labelBase[2]), { normalize: true, textColor: "#000000" })
    : undefined;

  const edits: CellEdit[] = [];
  const put = (coord: Coord, value: string) => {
    if (value === undefined || value === null) return;
    edits.push({ table: coord[0], row: coord[1], col: coord[2], p: coord[3], value, charPr: labelNormCharPr });
  };

  spec.schedule?.forEach((s) => {
    if (roleVal[s.role] !== undefined) put(s.coord, roleVal[s.role]);
  });
  // 셀프 보정/AI 자동매핑 칸 — 일정표 라벨 역할(관리번호·단가·횟수 등)·스칼라 역할 모두 채움.
  spec.manual?.forEach((m) => {
    const coord = [m.table, m.row, m.col, m.p ?? 0] as Coord;
    if (roleVal[m.role] !== undefined) put(coord, roleVal[m.role]);
    else if (scalarVal[m.role] !== undefined) put(coord, scalarVal[m.role]);
  });

  // 월 달력 격자 — 날짜 숫자·시간·공휴일 이름을 모두 통일(검정·동일크기·굵게/기울임/밑줄 제거).
  if (cal && p.year && p.month) {
    const wkCol = cal.cols.find((c) => c.dow !== 0) ?? cal.cols[0];
    const baseNum = getCellRunCharPr(xml, cal.table, cal.weeks[0].numberRow, wkCol.startCol);
    const numCharPr = mk(baseNum, { normalize: true, textColor: "#000000" });        // 평일 날짜(검정 통일)
    const redCharPr = mk(baseNum, { normalize: true, textColor: "#FF0000" });        // 일요일·공휴일(빨강 통일)
    const conBase = getCellRunCharPr(xml, cal.table, cal.weeks[0].contentRow, cal.cols[0].startCol);
    const conH = isCombined ? { height: 600 } : {};                                  // 통합양식이면 시간 6pt 한 줄
    const timeCharPr = mk(conBase, { normalize: true, textColor: "#000000", ...conH }); // 회기 시간(통일)
    const holidayCharPr = mk(conBase, { normalize: true, textColor: "#FF0000", ...conH }); // 공휴일 이름(빨강 통일)
    edits.push(...buildCalendarEdits(
      cal, p.year, p.month,
      (p.sessions ?? []).map((s) => ({ day: s.day, time: s.time })),
      { numCharPr, redCharPr, timeCharPr, holidayCharPr, holidays: p.holidays ?? [] },
    ));
  }

  xml = fillCells(xml, edits);
  // 제목 "( N월 )" (제목 런 쪼개짐 허용)
  if (p.month) xml = fillTitleParenMonth(xml, "일정표", p.month);
  return usedHeader
    ? patchFiles(template, { "Contents/section0.xml": xml, "Contents/header.xml": header })
    : patchSection0(template, xml);
}
