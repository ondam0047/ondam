// 저장된 일정표 양식(RecordForm kind=schedule)의 spec + 실데이터 → 채워진 .hwpx.
// 1단계: 라벨 칸(관리번호·대상자명·제공자·치료사·서비스종류·단가·본인부담·주기·제공일 등).
// (요일×슬롯 주간 격자 본문은 다음 단계)

import { readSection0, patchSection0 } from "@/lib/hwpx";
import { fillCells, type CellEdit, type Coord } from "@/lib/record-fill";
import type { ResolvedSpec } from "@/lib/record-resolver";
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
  // 일정표 라벨 역할 → 실데이터
  const roleVal: Record<string, string> = {
    관리번호: p.mgmtNumber ?? "",
    대상자명: p.childName ?? "",
    제공자: p.pvOrg ?? "",
    제공자명: p.therapist ?? "",
    담당: p.pvCharge || p.therapist || "",
    작성일자: p.writeDate ?? "",
    서비스종류: p.serviceType || p.pvType || "",
    전화: p.pvTel ?? "",
    단가: p.costUnit ?? "",
    횟수: p.target ? String(p.target) : "",
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

  const edits: CellEdit[] = [];
  const put = (coord: Coord, value: string) => {
    if (value === undefined || value === null) return;
    edits.push({ table: coord[0], row: coord[1], col: coord[2], p: coord[3], value });
  };

  spec.schedule?.forEach((s) => {
    if (roleVal[s.role] !== undefined) put(s.coord, roleVal[s.role]);
  });
  spec.manual?.forEach((m) => {
    if (scalarVal[m.role] !== undefined) put([m.table, m.row, m.col] as Coord, scalarVal[m.role]);
  });

  xml = fillCells(xml, edits);
  // 제목 "( N월 )"
  if (p.month) xml = xml.replace(/(일정표\s*\(\s*)\d*(\s*월)/, `$1${p.month}$2`);
  return patchSection0(template, xml);
}
