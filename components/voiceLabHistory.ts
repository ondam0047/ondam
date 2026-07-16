/**
 * Voice Lab 통합 세션 기록.
 *
 * MPT / 음질 / 강도훈련 / 말속도 / 유창성 등 신규 모듈에서 사용하는
 * 단일 localStorage 저장소. 모듈별 결과를 그대로 JSON 으로 보관해
 * 한 화면에서 시간순으로 비교/내보내기 할 수 있게 합니다.
 *
 * 기존 트레이닝 (`pd-training-history`) 는 그대로 두고 신규 모듈은
 * 이 저장소로 통합 — 두 저장소가 독립 동작.
 */

export type VoiceLabModuleId =
  | "mpt"
  | "voice_quality"
  | "intensity_trainer"
  | "speech_rate"
  | "fluency"
  | "pitch"
  | "vhi"
  | "articulation_train";

export interface VoiceLabRecord {
  id: string;
  savedAt: string; // ISO
  moduleId: VoiceLabModuleId;
  clientName: string;
  notes?: string;
  /** 모듈마다 자유 형식 — 표시 용도. 숫자 위주 권장. */
  summary: Record<string, number | string>;
}

const KEY = "voice-lab-history";
const EVENT = "voice-lab-history-updated";

function isBrowser() {
  return typeof window !== "undefined";
}

export function getVoiceLabHistory(): VoiceLabRecord[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...parsed].sort(
      (a, b) =>
        new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
    );
  } catch {
    return [];
  }
}

export function saveVoiceLabRecord(
  rec: Omit<VoiceLabRecord, "id" | "savedAt"> & {
    id?: string;
    savedAt?: string;
  },
): VoiceLabRecord {
  const id = rec.id ?? `vl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const savedAt = rec.savedAt ?? new Date().toISOString();
  const record: VoiceLabRecord = {
    id,
    savedAt,
    moduleId: rec.moduleId,
    clientName: rec.clientName,
    notes: rec.notes,
    summary: rec.summary,
  };
  if (!isBrowser()) return record;
  try {
    const current = getVoiceLabHistory();
    const next = [record, ...current];
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
  } catch (err) {
    console.error("voice lab 기록 저장 실패", err);
  }
  return record;
}

export function deleteVoiceLabRecord(id: string): void {
  if (!isBrowser()) return;
  const next = getVoiceLabHistory().filter((r) => r.id !== id);
  window.localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EVENT));
}

export function clearVoiceLabHistory(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(EVENT));
}

export const VOICE_LAB_HISTORY_EVENT = EVENT;

export const MODULE_LABELS: Record<VoiceLabModuleId, string> = {
  mpt: "MPT",
  voice_quality: "음질 분석",
  intensity_trainer: "강도 훈련",
  speech_rate: "말속도",
  fluency: "유창성",
  pitch: "피치",
  vhi: "VHI",
  articulation_train: "음운변동 조음 훈련",
};

export function exportHistoryToCSV(records: VoiceLabRecord[]): string {
  if (records.length === 0) return "";
  // 모든 summary 키 합집합
  const keys = new Set<string>();
  for (const r of records) Object.keys(r.summary).forEach((k) => keys.add(k));
  const cols = Array.from(keys);
  const header = ["savedAt", "moduleId", "clientName", "notes", ...cols];
  const rows = records.map((r) => {
    const base = [
      r.savedAt,
      MODULE_LABELS[r.moduleId] ?? r.moduleId,
      r.clientName,
      r.notes ?? "",
    ];
    const vals = cols.map((k) => {
      const v = r.summary[k];
      return v === undefined || v === null ? "" : String(v);
    });
    return [...base, ...vals].map(csvEscape).join(",");
  });
  return [header.map(csvEscape).join(","), ...rows].join("\n");
}

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
