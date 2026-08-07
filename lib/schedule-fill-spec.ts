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
  // 제공일 = 실제 날짜 목록(요일 아님 — 성심 요청. 예: "6·13·20·27일")
  const provideDays = (p.sessions ?? []).map((s) => s.day).filter((d) => d > 0).sort((a, b) => a - b);
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
    제공일: provideDays.length ? `${provideDays.join("·")}일` : weekdays,
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
  const put = (coord: Coord, value: string, clearRest = false) => {
    if (value === undefined || value === null) return;
    edits.push({ table: coord[0], row: coord[1], col: coord[2], p: coord[3], value, charPr: labelNormCharPr, clearRest: clearRest || undefined });
  };

  // clearRest: 센터가 값칸에 미리 적어둔 옛 값(여러 문단)을 지우고 새 값만 남긴다.
  // (서비스종류는 라벨이 있는 표마다 한 칸씩 — 제공현황·비용표 첫 행.)
  const schedCoordKeys = new Set((spec.schedule ?? []).map((s) => `${s.coord[0]},${s.coord[1]},${s.coord[2]}`));
  spec.schedule?.forEach((s) => {
    if (roleVal[s.role] !== undefined) put(s.coord, roleVal[s.role], true);
  });
  // 셀프 보정/AI 자동매핑 칸 — 일정표 라벨 역할(관리번호·단가·횟수 등)·스칼라 역할 모두 채움.
  // 단 라벨 인식 좌표와 겹치는 칸은 manual 로 덮지 않고, 라벨 인식이 이미 채우는 (역할, 표·열)의
  // 다른 행은 여분 행으로 보고 버린다(AI 가 주기·제공일·단가·횟수를 아래 행까지 지정하던 사고).
  // 서비스종류는 추가로 (표·열)별 최상단 한 칸만.
  const schedRoleTC = new Set((spec.schedule ?? []).map((s) => `${s.role}:${s.coord[0]},${s.coord[2]}`));
  // 통합 양식(기록지 영역이 있는 양식)의 일정표 출력은 일정표 영역 표에만 쓴다 —
  // AI 매핑이 기록지 총이용금액 칸을 '총금액'으로 지정해 300,000 이 찍히던 사고 방어.
  const schedTableSet = new Set((spec.schedule ?? []).map((s) => s.coord[0]));
  if (spec.scheduleCalendar) schedTableSet.add(spec.scheduleCalendar.table);
  const svcManual: Coord[] = [];
  spec.manual?.forEach((m) => {
    // isCombined(기록지 영역이 있는 통합 양식)면 일정표 라벨·달력이 있는 표 밖은 기록지 영역.
    if (isCombined && !schedTableSet.has(m.table)) return;
    if (schedCoordKeys.has(`${m.table},${m.row},${m.col}`)) return;
    if (schedRoleTC.has(`${m.role}:${m.table},${m.col}`)) return;
    const coord = [m.table, m.row, m.col, m.p ?? 0] as Coord;
    if (m.role === "서비스종류") { svcManual.push(coord); return; }
    if (roleVal[m.role] !== undefined) put(coord, roleVal[m.role]);
    else if (scalarVal[m.role] !== undefined) put(coord, scalarVal[m.role]);
  });
  {
    // 일정표 라벨(schedule 서비스종류)이 이미 채우는 (표·열)은 manual 그룹째 버린다.
    const svcSchedTC = new Set(
      (spec.schedule ?? []).filter((s) => s.role === "서비스종류").map((s) => `${s.coord[0]},${s.coord[2]}`),
    );
    const topByTC = new Map<string, Coord>();
    for (const co of svcManual) {
      const k = `${co[0]},${co[2]}`;
      if (svcSchedTC.has(k)) continue;
      const cur = topByTC.get(k);
      if (!cur || co[1] < cur[1]) topByTC.set(k, co);
    }
    const svcVal = roleVal["서비스종류"] ?? scalarVal["서비스종류"] ?? "";
    for (const co of topByTC.values()) if (svcVal) put(co, svcVal, true);
  }

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
    // 서비스 종류 표기 옵션 — 시간 위 줄에 축약(언어/놀이/감통)을 얹는다.
    const withLabel = (t: string) => (p.calTypeLabel ? `${p.calTypeLabel}\n${t}` : t);
    edits.push(...buildCalendarEdits(
      cal, p.year, p.month,
      (p.sessions ?? []).map((s) => ({ day: s.day, time: withLabel(s.time) })),
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
