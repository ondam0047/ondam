export type ModuleType = "visual" | "audio" | "mixed";

export interface TrainingRecord {
  id: string;
  savedAt: string;
  moduleType: ModuleType;
  clientName: string;
  sessionNote: string;
  practiceText: string;
  targetSps: number;
  measuredSps: number;
  feedback: string;
  chunkMode: string;
  recordingSec: number;
}

export const TRAINING_STORAGE_KEY = "pd-training-history";
export const TRAINING_HISTORY_UPDATED_EVENT = "pd-training-history-updated";

function isBrowser() {
  return typeof window !== "undefined";
}

function emitTrainingHistoryUpdated() {
  if (!isBrowser()) return;
  window.dispatchEvent(new Event(TRAINING_HISTORY_UPDATED_EVENT));
}

export function getTrainingHistory(): TrainingRecord[] {
  if (!isBrowser()) return [];

  try {
    const raw = localStorage.getItem(TRAINING_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.sort((a, b) => {
      const aTime = new Date(a.savedAt).getTime();
      const bTime = new Date(b.savedAt).getTime();
      return bTime - aTime;
    });
  } catch (error) {
    console.error("훈련 기록 불러오기 실패:", error);
    return [];
  }
}

export function getTrainingHistoryByModule(moduleType: ModuleType) {
  return getTrainingHistory().filter((item) => item.moduleType === moduleType);
}

export function saveTrainingRecord(record: TrainingRecord) {
  if (!isBrowser()) return;

  try {
    const current = getTrainingHistory();
    const updated = [record, ...current];
    localStorage.setItem(TRAINING_STORAGE_KEY, JSON.stringify(updated));
    emitTrainingHistoryUpdated();
  } catch (error) {
    console.error("훈련 기록 저장 실패:", error);
  }
}

export function deleteTrainingRecord(recordId: string) {
  if (!isBrowser()) return;

  try {
    const current = getTrainingHistory();
    const updated = current.filter((item) => item.id !== recordId);
    localStorage.setItem(TRAINING_STORAGE_KEY, JSON.stringify(updated));
    emitTrainingHistoryUpdated();
  } catch (error) {
    console.error("기록 삭제 실패:", error);
  }
}

export function deleteTrainingHistoryByModule(moduleType: ModuleType) {
  if (!isBrowser()) return;

  try {
    const current = getTrainingHistory();
    const updated = current.filter((item) => item.moduleType !== moduleType);
    localStorage.setItem(TRAINING_STORAGE_KEY, JSON.stringify(updated));
    emitTrainingHistoryUpdated();
  } catch (error) {
    console.error("모듈 기록 전체 삭제 실패:", error);
  }
}

function escapeCsv(value: string | number) {
  const stringValue = String(value ?? "");
  return `"${stringValue.replace(/"/g, '""')}"`;
}

export function downloadTrainingHistoryCsv(moduleType?: ModuleType) {
  if (!isBrowser()) return;

  try {
    const records = moduleType
      ? getTrainingHistoryByModule(moduleType)
      : getTrainingHistory();

    if (records.length === 0) {
      alert("다운로드할 기록이 없습니다.");
      return;
    }

    const headers = [
      "savedAt",
      "moduleType",
      "clientName",
      "sessionNote",
      "practiceText",
      "targetSps",
      "measuredSps",
      "feedback",
      "chunkMode",
      "recordingSec",
    ];

    const rows = records.map((record) =>
      [
        escapeCsv(record.savedAt),
        escapeCsv(record.moduleType),
        escapeCsv(record.clientName),
        escapeCsv(record.sessionNote),
        escapeCsv(record.practiceText),
        escapeCsv(record.targetSps),
        escapeCsv(record.measuredSps),
        escapeCsv(record.feedback),
        escapeCsv(record.chunkMode),
        escapeCsv(record.recordingSec),
      ].join(",")
    );

    const csv = [headers.join(","), ...rows].join("\n");

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = moduleType
      ? `training-history-${moduleType}.csv`
      : "training-history-all.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("CSV 다운로드 실패:", error);
    alert("CSV 다운로드 중 오류가 발생했습니다.");
  }
}