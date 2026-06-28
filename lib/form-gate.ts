// '우리 센터 양식'(/forms)은 발달바우처 전용이다. 지역사회바우처·교육청 치료지원 등
// 다른 사업 양식은 업로드·매핑·저장을 막는다(그것들은 [기타지원사업]에서 개별 사용).
// 판별: 구조(바우처 정산/일정표 구조) + 키워드(타사업 차단·발달재활 확인) 둘 다 본다.

import type { ResolvedSpec } from "@/lib/record-resolver";

type GridCell = { text?: string; norm?: string };
export type FormGate = { verdict: "allow" | "warn" | "block"; reason?: string };

// 발달바우처가 아닌 다른 사업을 가리키는 표시 → 무조건 차단.
const OTHER_PROGRAM_RE = /지역사회서비스|지역사회투자|지역자율형|지역사회\s*바우처|교육청|치료지원|특수교육|방과후/;
// 발달바우처(발달재활서비스) 표시.
const DEV_RE = /발달재활|발달바우처/;

function gridText(grid: GridCell[][]): string {
  return grid.flat().map((c) => (c.norm ?? c.text ?? "")).join(" ");
}

// 바우처 정산 구조(제공/승인일자·승인번호·바우처(분)) 또는 발달바우처 일정표 구조가 있나.
function hasDevStructure(spec: ResolvedSpec): boolean {
  const s = spec as ResolvedSpec & {
    result?: Array<{ apprNum?: unknown; apprDate?: unknown }>;
    voucher?: unknown[]; schedule?: unknown[]; scheduleCalendar?: unknown;
  };
  return !!(
    s.result?.some((r) => r.apprNum || r.apprDate) ||
    (s.voucher?.length) ||
    (s.schedule?.length) ||
    s.scheduleCalendar
  );
}

export function classifyDevVoucherForm(grid: GridCell[][], spec: ResolvedSpec): FormGate {
  const text = gridText(grid);

  // 1) 타사업 키워드 → 하드 차단
  if (OTHER_PROGRAM_RE.test(text)) {
    return {
      verdict: "block",
      reason: "이 양식은 발달바우처가 아닌 다른 사업(지역사회서비스·교육청 등) 양식으로 보여요. ‘우리 센터 양식’은 발달바우처 전용이에요. 지역사회바우처 등은 [기타지원사업] 메뉴에서 사용하세요.",
    };
  }

  const structure = hasDevStructure(spec);
  const dev = DEV_RE.test(text);

  // 2) 구조도 없고 발달 표시도 없으면 → 발달바우처 양식으로 볼 수 없음, 차단
  if (!structure && !dev) {
    return {
      verdict: "block",
      reason: "발달바우처 기록지·일정표 구조(제공일자·승인번호·바우처(분) 또는 일정표/달력)를 찾지 못했어요. 발달바우처 양식만 올릴 수 있어요.",
    };
  }

  // 3) 구조는 있으나 ‘발달재활’ 표시가 없으면 → 허용하되 확인 안내(지역사회바우처 등 오인 방지)
  if (!dev) {
    return {
      verdict: "warn",
      reason: "‘발달재활/발달바우처’ 표시를 찾지 못했어요. 발달바우처 양식이 맞는지 확인하세요. (지역사회바우처 등 다른 사업 양식은 [기타지원사업]에서 사용)",
    };
  }

  return { verdict: "allow" };
}
