export const WEEK = ["일", "월", "화", "수", "목", "금", "토"] as const;

export const SLOTS = [
  "09:00~09:50", "09:50~10:40", "10:40~11:30", "11:30~12:20",
  "13:30~14:20", "14:20~15:10", "15:10~16:00", "16:00~16:50",
  "16:50~17:40", "17:40~18:30", "18:30~19:20",
] as const;

// 기본 서비스 종류 — 센터마다 다를 수 있고 Center.serviceTypes 가 우선.
// 폼·드롭다운에서는 parseServiceTypes(center.serviceTypes) 를 호출해 동적으로 받아오기.
export const DEFAULT_SERVICE_TYPES = ["언어재활", "놀이치료", "감각통합치료"] as const;
export type ServiceType = string;

export function parseServiceTypes(str: string | null | undefined): string[] {
  if (!str) return [...DEFAULT_SERVICE_TYPES];
  return str.split(",").map((s) => s.trim()).filter(Boolean);
}

// 2026 공휴일 (프로토타입에서 가져옴 — 나중에 자동 동기화 가능)
export const HOLIDAYS_2026: Record<string, string> = {
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
  "2026-9-24": "추석연휴",
  "2026-9-25": "추석",
  "2026-9-26": "추석연휴",
  "2026-10-3": "개천절",
  "2026-10-5": "대체공휴일",
  "2026-10-9": "한글날",
  "2026-12-25": "성탄절",
};

export function holiday(y: number, m: number, d: number): string | null {
  return HOLIDAYS_2026[`${y}-${m}-${d}`] ?? null;
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
