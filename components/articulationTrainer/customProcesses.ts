// 임상가 맞춤 훈련 데이터(localStorage) — 두 가지를 다룬다.
//  1) 대립쌍(자극어) 편집: 내장 변동이든 맞춤 변동이든, 치료사가 아동의 실제 오류를 보고
//     (목표어/오류어) 짝을 자유롭게 추가·삭제. 변동별로 저장.
//  2) 맞춤 변동 만들기: 내장 5종에 국한하지 않고, 기존 음소 자세 라이브러리에서 목표/오류
//     음소를 골라 새 대조를 직접 만든다(3D 자세·소리 동기화는 그대로 재사용).
//
// ⚠️ 임상 주의: 모든 자극어는 SLP가 대치 위치·연령 적합성을 검토한 뒤 사용.

import { PHONES, phoneById } from "@/components/articulator/renderCore";
import type { MinimalPair, PhonologicalProcess } from "./processes";

export type CustomProcess = PhonologicalProcess & { custom: true };

const PAIRS_KEY = "voice-lab-artic-pairs"; // { [processId]: MinimalPair[] }
const CUSTOM_KEY = "voice-lab-artic-custom"; // CustomProcess[]

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장 실패(용량/사생활 모드)는 조용히 무시 — 세션 내 state로는 동작 */
  }
}

// ── 대립쌍 편집(변동별) ───────────────────────────────────────────────
// 저장된 편집본이 있으면 그것을, 없으면 변동 기본 자극어를 반환.
export function loadPairs(processId: string, seed: MinimalPair[]): MinimalPair[] {
  const all = readJSON<Record<string, MinimalPair[]>>(PAIRS_KEY, {});
  const saved = all[processId];
  return Array.isArray(saved) && saved.length ? saved : seed;
}
export function savePairs(processId: string, pairs: MinimalPair[]): void {
  const all = readJSON<Record<string, MinimalPair[]>>(PAIRS_KEY, {});
  all[processId] = pairs;
  writeJSON(PAIRS_KEY, all);
}

// ── 맞춤 변동 ─────────────────────────────────────────────────────────
export function loadCustomProcesses(): CustomProcess[] {
  const list = readJSON<CustomProcess[]>(CUSTOM_KEY, []);
  // 저장 스키마가 깨졌거나 참조 음소가 사라진 항목은 걸러낸다.
  return Array.isArray(list)
    ? list.filter(
        (p) =>
          p &&
          typeof p.id === "string" &&
          PHONES.some((x) => x.id === p.targetPhone) &&
          PHONES.some((x) => x.id === p.errorPhone),
      )
    : [];
}
export function saveCustomProcesses(list: CustomProcess[]): void {
  writeJSON(CUSTOM_KEY, list);
}
export function deleteCustomProcess(id: string): CustomProcess[] {
  const next = loadCustomProcesses().filter((p) => p.id !== id);
  saveCustomProcesses(next);
  // 함께 편집 자극어도 정리.
  const all = readJSON<Record<string, MinimalPair[]>>(PAIRS_KEY, {});
  if (all[id]) {
    delete all[id];
    writeJSON(PAIRS_KEY, all);
  }
  return next;
}

// 빌더용 음소 선택지(자세가 있는 자음·모음). 자음 먼저.
export const PHONE_OPTIONS = PHONES.map((p) => ({
  id: p.id,
  grapheme: p.label,
  kind: p.kind,
  desc: p.desc,
})).sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "consonant" ? -1 : 1));

function newId(): string {
  // 브라우저 환경 — crypto.randomUUID 우선, 폴백은 타임스탬프+난수.
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return "custom_" + c.randomUUID();
  return "custom_" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

// ㅅ만 검증된 실시간 목표대역(centroid)을 가진다. 그 외 목표는 3D+대립쌍+소리만.
const S_ZONE = { min: 5500, max: 8500 };

// 폼 입력으로부터 PhonologicalProcess 파생(기존 음소 자세를 그대로 사용).
export function makeCustomProcess(input: {
  label: string;
  targetPhone: string;
  errorPhone: string;
  pairs: MinimalPair[];
}): CustomProcess {
  const t = phoneById(input.targetPhone);
  const e = phoneById(input.errorPhone);
  const isS = input.targetPhone === "c_s";
  return {
    id: newId(),
    label: input.label.trim() || `${t.label} → ${e.label}`,
    short: `${t.label} → ${e.label}`,
    targetPhone: input.targetPhone,
    errorPhone: input.errorPhone,
    targetGrapheme: t.label,
    errorGrapheme: e.label,
    metaphorAxis: `${t.label} ↔ ${e.label}`,
    directionText: `${e.label} 자세에서 ${t.label} 자세로 바꿔요 — 색으로 표시된 조음기관을 보세요`,
    acoustic: isS ? "centroid" : "none",
    ...(isS ? { centroidZone: S_ZONE } : {}),
    cue: {
      external: `${t.label} 소리를 귀로 잘 들어봐요`,
      internal: `${t.desc} 자세로 혀·입을 놓아요`,
    },
    minimalPairs: input.pairs,
    ready: true,
    custom: true,
  };
}
