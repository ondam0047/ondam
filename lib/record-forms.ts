// 기록지 서식 목록 — 센터가 내 설정에서 고른다(지역마다 양식이 다를 수 있어서).
// 클라이언트·서버 양쪽에서 import 가능하도록 데이터만 둔다.

export const RECORD_FORMS = [
  { key: "standard", label: "서식A" },
  { key: "dongtan", label: "서식B" },
  { key: "namyangju", label: "서식C" },
] as const;

export type RecordFormKey = (typeof RECORD_FORMS)[number]["key"];

export const RECORD_FORM_KEYS = RECORD_FORMS.map((f) => f.key) as RecordFormKey[];

export function isRecordFormKey(s: string | null | undefined): s is RecordFormKey {
  return !!s && (RECORD_FORM_KEYS as string[]).includes(s);
}

export function recordFormLabel(key: string): string {
  return RECORD_FORMS.find((f) => f.key === key)?.label ?? key;
}
