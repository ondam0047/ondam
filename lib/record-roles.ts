// 기록지 매핑 역할 레지스트리 — 규칙 리졸버·LLM 폴백·클라이언트 UI가 공유하는 단일 출처.
// scalar: 칸 하나에 한 값(대상자이름 등). row: 회기마다 반복되는 값(날짜·시간 등) — 문서 순서대로 i번째 회기에 채움.

export type RoleKind = "scalar" | "row";
export type FormType = "record" | "schedule";
// forms 미지정 = 기록지·일정표 공통. 지정 시 해당 양식 종류에서만 후보로 제시.
export type RoleDef = { role: string; kind: RoleKind; desc: string; synonyms: string[]; forms?: FormType[] };

export const ROLE_DEFS: RoleDef[] = [
  // ── 공통 기본 정보(scalar) — 기록지·일정표 양쪽 ──
  { role: "기관명",   kind: "scalar", desc: "서비스 제공 기관·센터 이름(제공자명)",     synonyms: ["제공기관명", "기관", "센터명", "기관명", "제공자", "제공자명"] },
  { role: "대상자이름", kind: "scalar", desc: "아동·이용자 성명",                     synonyms: ["성명", "이용자 성명", "대상자명", "아동 이름", "이름"] },
  { role: "치료사이름", kind: "scalar", desc: "담당 치료사·제공인력 이름",            synonyms: ["제공인력", "담당", "담당자", "치료사"] },
  { role: "생년월일",  kind: "scalar", desc: "대상자 생년월일",                       synonyms: ["생년월일", "생일"] },
  { role: "서비스종류", kind: "scalar", desc: "서비스·치료 종류(언어재활 등)",          synonyms: ["서비스종류", "제공영역", "서비스 종류", "치료종류", "영역", "서비스유형"] },
  // ── 기록지 전용(scalar) ──
  { role: "연도",     kind: "scalar", desc: "기록 연도(예: 2026)",                   synonyms: ["년", "연도", "년도"], forms: ["record"] },
  { role: "월",       kind: "scalar", desc: "기록 월(예: 6)",                         synonyms: ["월"], forms: ["record"] },
  { role: "학교",     kind: "scalar", desc: "재학 학교명",                            synonyms: ["학교", "소속"], forms: ["record"] },
  { role: "학년",     kind: "scalar", desc: "학년",                                   synonyms: ["학년"], forms: ["record"] },
  { role: "요일",     kind: "scalar", desc: "정기 치료 요일",                          synonyms: ["요일", "제공요일"], forms: ["record"] },
  { role: "정기시간",  kind: "scalar", desc: "정기 치료 시간대",                        synonyms: ["시간", "정기시간", "제공시간"], forms: ["record"] },
  { role: "치료목표",  kind: "scalar", desc: "치료·중재 목표",                          synonyms: ["치료목표", "목표", "장기목표"], forms: ["record"] },
  { role: "현행수준",  kind: "scalar", desc: "대상자 현행 수준·현재 능력",              synonyms: ["현행수준", "현재수준", "현행 수준"], forms: ["record"] },
  { role: "종합의견",  kind: "scalar", desc: "종합의견·총평(비고/종합의견 칸의 서술)",   synonyms: ["종합의견", "총평", "비고", "종합 의견", "종합의견 및 특이사항"], forms: ["record"] },
  // ── 기록지 회기(row) ──
  { role: "회차", kind: "row", desc: "회기 번호(1,2,3…). '(  )회차'처럼 번호 들어갈 칸",   synonyms: ["회차", "제공회차", "회기", "차수"], forms: ["record"] },
  { role: "날짜", kind: "row", desc: "각 회기 날짜. '(  /  )' 형태의 월/일 칸 포함",        synonyms: ["날짜", "월일", "제공일자", "서비스일자", "서비스제공일자", "일자"], forms: ["record"] },
  { role: "시작", kind: "row", desc: "회기 시작 시간. '(  :  )' 형태 포함",               synonyms: ["시작시간", "시작"], forms: ["record"] },
  { role: "종료", kind: "row", desc: "회기 종료 시간. '(  :  )' 형태 포함",               synonyms: ["종료시간", "종료"], forms: ["record"] },
  { role: "결과", kind: "row", desc: "회기 내용·서비스 결과(서술형 칸, '서비스 내용'·'내용/결과')", synonyms: ["서비스 내용", "내용", "결과", "서비스결과", "내용/결과"], forms: ["record"] },
  { role: "비고", kind: "row", desc: "회기 비고·특이사항(내용/결과와 별도로 있는 칸)",      synonyms: ["비고", "특이사항", "비고·특이사항", "비고/특이사항"], forms: ["record"] },
  // ── 일정표 전용 라벨(scalar) ──
  { role: "관리번호",   kind: "scalar", desc: "바우처 관리번호 등 관리번호",            synonyms: ["관리번호", "관리 번호"], forms: ["schedule"] },
  { role: "단가",       kind: "scalar", desc: "회기당 단가(금액)",                      synonyms: ["단가", "회당단가", "제공단가", "이용단가"], forms: ["schedule"] },
  { role: "횟수",       kind: "scalar", desc: "월 제공 횟수(회기 수)",                  synonyms: ["횟수", "제공횟수", "총횟수", "회수"], forms: ["schedule"] },
  { role: "총금액",     kind: "scalar", desc: "총 이용금액·총액",                       synonyms: ["총금액", "총액", "합계", "총비용", "총이용금액"], forms: ["schedule"] },
  { role: "본인부담금",  kind: "scalar", desc: "본인부담금",                            synonyms: ["본인부담금", "본인부담", "자부담", "본인 부담금"], forms: ["schedule"] },
  { role: "주기",       kind: "scalar", desc: "제공 주기(주 1회 등)",                   synonyms: ["주기", "제공주기"], forms: ["schedule"] },
  { role: "제공일",     kind: "scalar", desc: "정기 제공 요일/일자",                    synonyms: ["제공일", "제공요일", "이용요일"], forms: ["schedule"] },
  { role: "작성일자",   kind: "scalar", desc: "양식 작성일자",                          synonyms: ["작성일자", "작성일", "작성 일자"], forms: ["schedule"] },
  { role: "전화",       kind: "scalar", desc: "연락처·전화번호",                        synonyms: ["전화", "연락처", "전화번호", "휴대전화"], forms: ["schedule"] },
];

// 양식 종류별 후보 역할(미지정이면 공통이라 양쪽에 포함). formType 없으면 전체.
export function rolesForForm(formType?: FormType): RoleDef[] {
  if (!formType) return ROLE_DEFS;
  return ROLE_DEFS.filter((r) => !r.forms || r.forms.includes(formType));
}

// 기존 소비처(기록지·기타지원사업 UI/채움)는 기록지 역할만 기대하므로 record 범위로 둔다.
// 일정표 역할은 rolesForForm("schedule") 로 따로 가져온다. ALL_ROLES 는 검증용 전체 합집합.
export const SCALAR_ROLES = rolesForForm("record").filter((r) => r.kind === "scalar").map((r) => r.role);
export const ROW_ROLES    = rolesForForm("record").filter((r) => r.kind === "row").map((r) => r.role);
export const ALL_ROLES    = new Set(ROLE_DEFS.map((r) => r.role));
