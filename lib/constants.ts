export const WEEK = ["일", "월", "화", "수", "목", "금", "토"] as const;

export const SLOTS = [
  "09:00~09:50", "09:50~10:40", "10:40~11:30", "11:30~12:20",
  "13:30~14:20", "14:20~15:10", "15:10~16:00", "16:00~16:50",
  "16:50~17:40", "17:40~18:30", "18:30~19:20",
] as const;

// 기본 서비스 종류 — 센터마다 다를 수 있고 Center.serviceTypes 가 우선.
export const DEFAULT_SERVICE_TYPES = ["언어재활", "놀이치료", "감각통합치료"] as const;
export type ServiceType = string;

// 1인 모드에서 내 설정 드롭다운에 노출할 주력 서비스 종류 후보.
export const PRIMARY_SERVICE_OPTIONS = [
  "언어재활",
  "놀이치료",
  "감각통합치료",
  "미술심리",
  "음악심리",
  "심리상담",
  "행동재활",
  "운동재활",
  "기타",
] as const;

// 보건복지부 발달재활서비스 제공인력 8종 + 기타.
// 가입 시 선택받고, 본인이 기본으로 다루는 서비스 종류를 자동 설정에 사용.
export const THERAPIST_TYPES = [
  "언어재활사",
  "놀이심리상담사",
  "감각통합치료사",
  "미술심리상담사",
  "음악심리상담사",
  "임상심리사",
  "행동발달재활사",
  "운동발달재활사",
  "기타",
] as const;
export type TherapistType = (typeof THERAPIST_TYPES)[number];

// 치료사 종류 → 기본 서비스 종류 매핑.
// 가입 시 자동으로 Center.serviceTypes 에 본인 종류 첫 번째로.
export const THERAPIST_TO_SERVICE: Record<string, string> = {
  "언어재활사":       "언어재활",
  "놀이심리상담사":   "놀이치료",
  "감각통합치료사":   "감각통합치료",
  "미술심리상담사":   "미술심리",
  "음악심리상담사":   "음악심리",
  "임상심리사":       "심리상담",
  "행동발달재활사":   "행동재활",
  "운동발달재활사":   "운동재활",
};

export function parseServiceTypes(str: string | null | undefined): string[] {
  if (!str) return [...DEFAULT_SERVICE_TYPES];
  return str.split(",").map((s) => s.trim()).filter(Boolean);
}

// 센터별 시간대 (Center.slots) 파싱
export function parseSlots(str: string | null | undefined): string[] {
  if (!str) return [...SLOTS];
  return str.split(",").map((s) => s.trim()).filter(Boolean);
}

// 요일별 시간대 오버라이드 직렬화/역직렬화.
// 형식: "1=09:00~09:50,3=10:00~10:50" (요일=시간대). 기본 시간대와 같은 요일은 저장 안 함.
export function parseDaySlots(str: string | null | undefined): Record<number, string> {
  const out: Record<number, string> = {};
  if (!str) return out;
  for (const part of str.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const dow = Number(part.slice(0, eq));
    const slot = part.slice(eq + 1).trim();
    if (Number.isInteger(dow) && slot) out[dow] = slot;
  }
  return out;
}

export function serializeDaySlots(
  map: Record<number, string>,
  days: number[],
  defaultSlot: string | null,
): string | null {
  const entries = [...days]
    .filter((d) => map[d] && map[d] !== defaultSlot)
    .sort((a, b) => a - b)
    .map((d) => `${d}=${map[d]}`);
  return entries.length ? entries.join(",") : null;
}

// 한국 공휴일 (수동 관리). 추후 data.go.kr API 동기화 예정.
// 그레고리력은 음력 매년 다르므로 매년 추가해야 함.
export const HOLIDAYS: Record<string, string> = {
  // 2026
  "2026-1-1": "신정",
  "2026-2-16": "설날연휴",
  "2026-2-17": "설날",
  "2026-2-18": "설날연휴",
  "2026-3-1": "삼일절",
  "2026-3-2": "대체공휴일",
  "2026-5-5": "어린이날",
  "2026-5-24": "부처님오신날",
  "2026-5-25": "대체공휴일",
  "2026-6-6": "현충일",
  "2026-8-15": "광복절",
  "2026-8-17": "대체공휴일",
  "2026-9-24": "추석연휴",
  "2026-9-25": "추석",
  "2026-9-26": "추석연휴",
  "2026-10-3": "개천절",
  "2026-10-5": "대체공휴일",
  "2026-10-9": "한글날",
  "2026-12-25": "성탄절",
  // 2027
  "2027-1-1": "신정",
  "2027-2-6": "설날연휴",
  "2027-2-7": "설날",
  "2027-2-8": "설날연휴",
  "2027-3-1": "삼일절",
  "2027-5-5": "어린이날",
  "2027-5-13": "부처님오신날",
  "2027-6-6": "현충일",
  "2027-8-15": "광복절",
  "2027-8-16": "대체공휴일",
  "2027-9-14": "추석연휴",
  "2027-9-15": "추석",
  "2027-9-16": "추석연휴",
  "2027-10-3": "개천절",
  "2027-10-4": "대체공휴일",
  "2027-10-9": "한글날",
  "2027-10-11": "대체공휴일",
  "2027-12-25": "성탄절",
  // 2028
  "2028-1-1": "신정",
  "2028-1-26": "설날연휴",
  "2028-1-27": "설날",
  "2028-1-28": "설날연휴",
  "2028-3-1": "삼일절",
  "2028-5-2": "부처님오신날",
  "2028-5-5": "어린이날",
  "2028-6-6": "현충일",
  "2028-8-15": "광복절",
  "2028-10-3": "개천절·추석연휴",
  "2028-10-4": "추석",
  "2028-10-5": "추석연휴",
  "2028-10-6": "대체공휴일",
  "2028-10-9": "한글날",
  "2028-12-25": "성탄절",
};

// 호환을 위해 옛 이름도 유지
export const HOLIDAYS_2026 = HOLIDAYS;

export function holiday(y: number, m: number, d: number): string | null {
  return HOLIDAYS[`${y}-${m}-${d}`] ?? null;
}

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function minusMin(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  let t = h * 60 + m - mins;
  if (t < 0) t += 1440;
  return pad(Math.floor(t / 60)) + ":" + pad(t % 60);
}

// 임의의 "HH:MM~HH:MM" 시간 검증 (자유 입력용)
export function isValidSlot(s: string): boolean {
  return /^\d{1,2}:\d{2}~\d{1,2}:\d{2}$/.test(s.trim());
}

// HH:MM 두 개 사이의 분 차이 (자정 넘는 케이스 무시)
export function slotMinutes(slot: string): number {
  const m = slot.match(/^(\d{1,2}):(\d{2})~(\d{1,2}):(\d{2})$/);
  if (!m) return 0;
  return (+m[3] * 60 + +m[4]) - (+m[1] * 60 + +m[2]);
}
