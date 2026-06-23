// 기록지 매핑 역할 레지스트리 — 규칙 리졸버·LLM 폴백·클라이언트 UI가 공유하는 단일 출처.
// scalar: 칸 하나에 한 값(대상자이름 등). row: 회기마다 반복되는 값(날짜·시간 등) — 문서 순서대로 i번째 회기에 채움.

export type RoleKind = "scalar" | "row";
export type RoleDef = { role: string; kind: RoleKind; desc: string; synonyms: string[] };

export const ROLE_DEFS: RoleDef[] = [
  // ── 기본 정보(scalar) ──
  { role: "기관명",   kind: "scalar", desc: "서비스 제공 기관·센터 이름",            synonyms: ["제공기관명", "기관", "센터명", "기관명"] },
  { role: "대상자이름", kind: "scalar", desc: "아동·이용자 성명",                     synonyms: ["성명", "이용자 성명", "대상자명", "아동 이름", "이름"] },
  { role: "치료사이름", kind: "scalar", desc: "담당 치료사·제공인력 이름",            synonyms: ["제공인력", "담당", "담당자", "치료사", "제공자"] },
  { role: "생년월일",  kind: "scalar", desc: "대상자 생년월일",                       synonyms: ["생년월일", "생일"] },
  { role: "연도",     kind: "scalar", desc: "기록 연도(예: 2026)",                   synonyms: ["년", "연도", "년도"] },
  { role: "월",       kind: "scalar", desc: "기록 월(예: 6)",                         synonyms: ["월"] },
  { role: "학교",     kind: "scalar", desc: "재학 학교명",                            synonyms: ["학교", "소속"] },
  { role: "학년",     kind: "scalar", desc: "학년",                                   synonyms: ["학년"] },
  { role: "요일",     kind: "scalar", desc: "정기 치료 요일",                          synonyms: ["요일", "제공요일"] },
  { role: "정기시간",  kind: "scalar", desc: "정기 치료 시간대",                        synonyms: ["시간", "정기시간", "제공시간"] },
  { role: "치료목표",  kind: "scalar", desc: "치료·중재 목표",                          synonyms: ["치료목표", "목표", "장기목표"] },
  { role: "현행수준",  kind: "scalar", desc: "대상자 현행 수준·현재 능력",              synonyms: ["현행수준", "현재수준", "현행 수준"] },
  { role: "종합의견",  kind: "scalar", desc: "종합의견·총평(비고/종합의견 칸의 서술)",   synonyms: ["종합의견", "총평", "비고", "종합 의견", "종합의견 및 특이사항"] },
  // ── 회기(row) ──
  { role: "회차", kind: "row", desc: "회기 번호(1,2,3…). '(  )회차'처럼 번호 들어갈 칸",   synonyms: ["회차", "제공회차", "회기", "차수"] },
  { role: "날짜", kind: "row", desc: "각 회기 날짜. '(  /  )' 형태의 월/일 칸 포함",        synonyms: ["날짜", "월일", "제공일자", "서비스일자", "서비스제공일자", "일자"] },
  { role: "시작", kind: "row", desc: "회기 시작 시간. '(  :  )' 형태 포함",               synonyms: ["시작시간", "시작"] },
  { role: "종료", kind: "row", desc: "회기 종료 시간. '(  :  )' 형태 포함",               synonyms: ["종료시간", "종료"] },
  { role: "결과", kind: "row", desc: "회기 내용·서비스 결과·특이사항(서술형 칸)",         synonyms: ["서비스 내용", "내용", "결과", "특이사항", "서비스결과", "비고"] },
];

export const SCALAR_ROLES = ROLE_DEFS.filter((r) => r.kind === "scalar").map((r) => r.role);
export const ROW_ROLES    = ROLE_DEFS.filter((r) => r.kind === "row").map((r) => r.role);
export const ALL_ROLES    = new Set(ROLE_DEFS.map((r) => r.role));
