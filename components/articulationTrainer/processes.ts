// 음운변동(phonological process) 훈련 데이터 모델.
// 각 변동 = {목표 음소 ↔ 흔한 오류 음소} 쌍 + 자질/은유 라벨 + 대립쌍 자극어 + 음향 특징.
// 지속음/순간음(live/capture) 여부는 저장하지 않고 조음방법(manner)에서 유도(modeOf).
//
// ⚠️ 임상 주의: minimalPairs 시작 단어는 반드시 SLP 검토 후 사용. 대치 위치·연령 적합성 확인.

import { CONSONANTS, mannerOf, type Manner } from "@/components/articulator/phonemeMap";

export type PracticeMode = "live" | "capture";
export type AcousticFeature = "centroid" | "formants" | "burst" | "none";

export type ProcessId =
  | "stopping_fricative" // ㅅ→ㄷ (마찰음의 파열음화)
  | "velar_fronting" // ㄱ→ㄷ (연구개음 전방화)
  | "stopping_affricate" // ㅈ→ㄷ (파찰음의 파열음화)
  | "tap_vs_lateral" // ㄹ 탄설 ↔ 설측
  | "gliding_liquid"; // ㄹ→활음 (유음의 활음화)

export type MinimalPair = { target: string; error: string; note?: string };

export type PhonologicalProcess = {
  id: ProcessId | string; // 내장 5종 또는 맞춤 변동("custom_…")
  label: string; // "마찰음의 파열음화"
  short: string; // "ㅅ → ㄷ"
  targetPhone: string; // renderCore PHONES id, 예: "c_s"
  errorPhone: string; // "c_t"
  targetGrapheme: string; // "ㅅ"
  errorGrapheme: string; // "ㄷ"
  metaphorAxis: string; // "막음 ↔ 흐름"
  directionText: string; // 오류→목표 전환 캡션(무엇이 어떻게 바뀌나)
  acoustic: AcousticFeature;
  // 실시간 게이지 목표 대역(centroid Hz) — acoustic==="centroid"일 때만.
  centroidZone?: { min: number; max: number };
  cue: { external: string; internal: string }; // 외부초점(소리)/내부초점(혀)
  minimalPairs: MinimalPair[];
  ready: boolean; // v1에서 음향 피드백까지 완전 배선됐는지(아니면 3D 애니메이션+대립쌍만)
};

// 조음방법 → 실시간 가능 여부. 지속음=live(끌 수 있음), 순간음=capture(캡처·리뷰).
const CONTINUANT: Record<Manner, PracticeMode> = {
  fricative: "live",
  nasal: "live",
  lateral: "live",
  glottal: "live",
  stop: "capture",
  affricate: "capture",
  tap: "capture",
};

const consById = (cid: string) => CONSONANTS.find((c) => c.id === cid);

// 목표 음소의 조음방법으로 실시간/캡처 모드 결정. 모음은 지속음(live).
export function modeOf(p: PhonologicalProcess): PracticeMode {
  if (p.targetPhone.startsWith("v_")) return "live";
  const c = consById(p.targetPhone.slice(2));
  if (!c) return "capture";
  return CONTINUANT[mannerOf(c.manner)];
}

// /s/ 목표 대역(성인 기준, SibilantTrainer와 동일). 아동은 성도가 작아 다소 높게 이동 — 연령별
// 보정은 후속(v3). 지금은 성인 규준을 기준선으로.
const S_ZONE = { min: 5500, max: 8500 };

export const PROCESSES: PhonologicalProcess[] = [
  {
    id: "stopping_fricative",
    label: "마찰음의 파열음화",
    // 마찰음(ㅅ·ㅆ)이 파열음(ㄷ·ㄸ)으로 대치되는 변동. 대치음은 아동마다 ㄷ/ㄸ, 위치도
    // 어두·어중 다양 → 3D·게이지는 대표적으로 ㅅ↔ㄷ를 쓰고, 실제 자극어는 치료사가 편집한다.
    short: "ㅅ·ㅆ → ㄷ·ㄸ",
    targetPhone: "c_s",
    errorPhone: "c_t",
    targetGrapheme: "ㅅ",
    errorGrapheme: "ㄷ",
    metaphorAxis: "막음 ↔ 흐름",
    directionText: "혀를 완전히 막지 말고, 좁은 틈으로 바람을 흘려보내요 (ㄷ 막음 → ㅅ 흐름)",
    acoustic: "centroid",
    centroidZone: S_ZONE,
    cue: {
      external: "ㅅ 바람 소리를 길게 들어봐요 — 뱀 소리처럼 스~~",
      internal: "혀끝을 윗니 뒤에 살짝 대고 가운데로 좁은 길을 만들어요",
    },
    // 시작 자극어(SLP 검토 완료 예시). 치료사가 아동의 실제 오류를 보고 편집·추가한다.
    // 대치음이 ㄷ(살→달, 시소→시도)일 수도, ㄸ(사자→따자, 사과→따과)일 수도 있다.
    minimalPairs: [
      { target: "살", error: "달" },
      { target: "손", error: "돈" },
      { target: "사자", error: "따자" },
      { target: "시소", error: "시도", note: "어중 ㅅ 대치" },
      { target: "사과", error: "따과" },
    ],
    ready: true,
  },
  {
    id: "velar_fronting",
    label: "연구개음 전방화",
    short: "ㄱ → ㄷ",
    targetPhone: "c_k",
    errorPhone: "c_t",
    targetGrapheme: "ㄱ",
    errorGrapheme: "ㄷ",
    metaphorAxis: "앞(치조) ↔ 뒤(연구개)",
    directionText: "혀끝을 앞에 대지 말고, 혀 뒤를 올려 목구멍 쪽에서 막아요 (ㄷ 앞 → ㄱ 뒤)",
    acoustic: "burst",
    cue: {
      external: "ㄱ은 목 안쪽에서 나는 소리예요 — 콕 하고 터져요",
      internal: "혀끝은 내리고, 혀 뒤(등)를 위로 올려 여린입천장에 붙여요",
    },
    minimalPairs: [
      { target: "곰", error: "돔" },
      { target: "굴", error: "둘" },
      { target: "개", error: "대" },
      { target: "공", error: "동" },
    ],
    ready: false,
  },
  {
    id: "stopping_affricate",
    label: "파찰음의 파열음화",
    short: "ㅈ → ㄷ",
    targetPhone: "c_c",
    errorPhone: "c_t",
    targetGrapheme: "ㅈ",
    errorGrapheme: "ㄷ",
    metaphorAxis: "막음 ↔ 막았다 흘림",
    directionText: "막았다가 천천히 열어 바람을 흘려요 (ㄷ 막음 → ㅈ 막았다 흘림)",
    acoustic: "burst",
    cue: {
      external: "ㅈ은 막았다가 스르륵 열리는 소리예요",
      internal: "혀 앞날을 입천장에 붙였다가 살짝 떼며 바람을 흘려보내요",
    },
    minimalPairs: [
      { target: "잘", error: "달" },
      { target: "종", error: "동" },
      { target: "자", error: "다" },
      { target: "짐", error: "딤" },
    ],
    ready: false,
  },
  {
    id: "tap_vs_lateral",
    label: "ㄹ 탄설음 ↔ 설측음",
    short: "탄설 ↔ 설측",
    targetPhone: "c_r_tap",
    errorPhone: "c_l",
    targetGrapheme: "ㄹ(탄설)",
    errorGrapheme: "ㄹ(설측)",
    metaphorAxis: "톡(한 번) ↔ 대고 유지",
    directionText: "혀끝을 한 번 톡 튕겨요 — 붙여서 유지하지 말고 (설측 유지 → 탄설 톡)",
    acoustic: "none",
    cue: {
      external: "'아라'의 ㄹ은 혀끝을 살짝 톡 튕겨요",
      internal: "혀끝을 치조에 아주 짧게 스치듯 한 번만 대요",
    },
    minimalPairs: [
      { target: "나라", error: "날라", note: "어중 ㄹ: 탄설 vs 설측(중첩) — SLP 검토 필요" },
      { target: "구름", error: "굴음", note: "예시 — SLP 검토 필요" },
    ],
    ready: false,
  },
  {
    id: "gliding_liquid",
    label: "유음의 활음화",
    short: "ㄹ → 활음",
    targetPhone: "c_r_tap",
    errorPhone: "v_i",
    targetGrapheme: "ㄹ",
    errorGrapheme: "y/w",
    metaphorAxis: "혀끝 접촉 ↔ 미끄러짐",
    directionText: "입만 움직이지 말고, 혀끝을 위로 올려 톡 대요 (활음 → ㄹ 접촉)",
    acoustic: "none",
    cue: {
      external: "ㄹ은 혀가 위를 살짝 치는 소리예요",
      internal: "혀끝을 치조에 올려 대세요 — 그냥 입만 벌리지 말고",
    },
    minimalPairs: [
      { target: "라면", error: "야면", note: "예시 — SLP 검토 필요" },
      { target: "우리", error: "우이", note: "ㄹ 생략/활음화" },
    ],
    ready: false,
  },
];

export const processById = (id: string) => PROCESSES.find((p) => p.id === id)!;
