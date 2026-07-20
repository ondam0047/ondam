// 음운변동(phonological process) 훈련 데이터 모델.
// 각 변동 = {목표 음소 ↔ 흔한 오류 음소} 쌍 + 자질/은유 라벨 + 대립쌍 자극어 + 음향 특징.
// 지속음/순간음(live/capture) 여부는 저장하지 않고 조음방법(manner)에서 유도(modeOf).
//
// ⚠️ 임상 주의: minimalPairs 시작 단어는 반드시 SLP 검토 후 사용. 대치 위치·연령 적합성 확인.

import { CONSONANTS, mannerOf, type Manner, type Pose } from "@/components/articulator/phonemeMap";

export type PracticeMode = "live" | "capture";
export type AcousticFeature = "centroid" | "formants" | "burst" | "none";

export type ProcessId =
  | "stopping_fricative" // ㅅ→ㄷ (마찰음의 파열음화)
  | "velar_fronting" // ㄱ→ㄷ (연구개음 전방화)
  | "stopping_affricate" // ㅈ→ㄷ (파찰음의 파열음화)
  | "tap_vs_lateral" // ㄹ 탄설 ↔ 설측
  | "gliding_liquid" // ㄹ→활음 (유음의 활음화)
  | "distortion_s"; // ㅅ 왜곡 (구개음화 — 혀가 뒤로/경구개)

export type MinimalPair = { target: string; error: string; note?: string };

export type PhonologicalProcess = {
  id: ProcessId | string; // 내장 5종 또는 맞춤 변동("custom_…")
  label: string; // "마찰음의 파열음화"
  short: string; // "ㅅ → ㄷ"
  targetPhone: string; // renderCore PHONES id, 예: "c_s"
  errorPhone: string; // "c_t"
  targetGrapheme: string; // "ㅅ"
  errorGrapheme: string; // "ㄷ"
  // 오류가 "다른 음소로 대치"가 아니라 "같은 음소의 조음 왜곡"(예: 구개음화 ㅅ)일 때,
  // errorPhone(대치음) 대신 이 자세를 오류 포즈로 사용. (없으면 errorPhone 음소 자세 사용.)
  errorPoseOverride?: Pose;
  // 3D 시상면에 기류(공기 흐름)를 함께 보일지 — 마찰음 계열(협착 틈 마찰)에서만 의미 있음.
  airflow?: boolean;
  // 왜곡(distortion): 오류가 "다른 낱말로 대치(뜻 바뀜)"가 아니라 "같은 낱말이 왜곡되게 산출"됨.
  // true면 우측 패널을 대립쌍(의사소통 실패) 대신 "정상 ↔ 왜곡" 대조로 표시(뜻은 유지).
  distortion?: boolean;
  // 설측음화(lateral): 공기가 혀 중앙(홈)이 아니라 양옆으로 샘. true면 기류를 좌우로 갈라 보이고,
  // 좌우는 측면(사지탈)에서 안 보이므로 기본 시점을 정면/비스듬으로. 검출은 centroid+hfRatio.
  lateral?: boolean;
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
    id: "distortion_s",
    label: "ㅅ 왜곡 (구개음화)",
    // 마찰음 /ㅅ/의 협착점이 치조(앞)에서 경구개(뒤)로 밀려 혀가 뒤로 솟는 왜곡.
    // 대치(다른 음소)가 아니라 같은 ㅅ의 조음 위치가 뒤로 간 것 → errorPoseOverride 사용.
    // 청지각적으로 [ɕ]에 가까운 "쉬"스러운 소리(맑은 ㅅ 대비 후방·저주파).
    short: "치조 ㅅ ↔ 경구개 ㅅ",
    targetPhone: "c_s",
    errorPhone: "c_s", // 왜곡이라 대치음 없음 — 자세는 errorPoseOverride로.
    // 정상 ㅅ 자세에서 혀를 뒤·위(경구개)로 크게 보낸 왜곡: retract·back_up↑↑, tip_up 0, front_up↑.
    // 정확(치조 앞)↔왜곡(경구개 뒤) 사이 혀 이동 폭을 넓혀 실시간 대비가 잘 보이게.
    errorPoseOverride: {
      tongue_front_up: 0.85,
      tongue_tip_up: 0,
      tongue_back_up: 0.6,
      tongue_retract: 0.9,
      tongue_groove: 0.35,
      lips_closed: 0.5,
    },
    targetGrapheme: "ㅅ",
    errorGrapheme: "ㅅ(구개음화)",
    airflow: true,
    distortion: true, // 대립쌍(뜻 바뀜) 아님 — /ㅅ/ 연습 + 마이크 실시간 혀 위치 피드백.
    metaphorAxis: "앞(치조) ↔ 뒤(경구개)",
    directionText:
      "혀를 뒤로 올리지 말고, 혀끝을 앞으로 가져와 윗니 뒤(치조)에서 좁은 틈을 만들어요 (경구개 뒤 → 치조 앞)",
    acoustic: "centroid",
    centroidZone: S_ZONE,
    cue: {
      external: "ㅅ은 앞니 사이로 바람이 새는 맑은 소리예요 — 스~ (거친 '쉬' 소리가 아니라)",
      internal: "혀를 뒤로 당기지 말고 혀끝을 윗니 뒤에 가깝게 두고 가운데로 좁은 길을 만들어요",
    },
    // 왜곡은 낱말 자체가 바뀌지 않음 — target=정상 ㅅ 낱말, error=구개음화된 청지각 근사(한글).
    // 반드시 SLP가 아동의 실제 왜곡을 듣고 편집.
    minimalPairs: [
      { target: "사자", error: "샤자", note: "구개음화 ㅅ≈[ɕ] — SLP 검토 필요" },
      { target: "소", error: "쇼", note: "예시 — SLP 검토 필요" },
      { target: "수박", error: "슈박", note: "예시 — SLP 검토 필요" },
      { target: "가위", error: "가위(왜곡)", note: "어중 ㅅ 왜곡 — SLP 검토 필요" },
    ],
    ready: true,
  },
  {
    id: "distortion_s_lateral",
    label: "ㅅ 왜곡 (설측음화)",
    // 설측음화(lateral lisp): 혀끝이 치조에 붙어 중앙 홈이 막히고 공기가 혀 양옆으로 샘([ɬ]).
    // 청지각적으로 둔탁·다습한 "슬러시" 소리(맑은 중앙 마찰 대비 저주파·저집중).
    short: "중앙 마찰 ↔ 양옆 샘",
    targetPhone: "c_s",
    errorPhone: "c_s",
    // 정상 ㅅ에서 혀끝을 올려 붙이고(tip_up↑) 중앙 홈을 닫은(groove 0) 설측 자세.
    // (tongue_lateral_channel 모프는 리거 납품본 버그로 제외 — 좌우 표현은 기류로.)
    errorPoseOverride: {
      tongue_tip_up: 1,
      tongue_front_up: 0.3,
      tongue_groove: 0,
      lips_closed: 0.5,
    },
    targetGrapheme: "ㅅ",
    errorGrapheme: "ㅅ(설측음화)",
    airflow: true,
    distortion: true,
    lateral: true,
    metaphorAxis: "가운데로 곧게 ↔ 옆으로 샘",
    directionText:
      "혀끝을 완전히 붙이지 말고, 혀 가운데로 좁은 길을 만들어 바람을 곧게 앞으로 보내요 (옆으로 새지 않게)",
    acoustic: "centroid",
    centroidZone: S_ZONE,
    cue: {
      external: "ㅅ은 가운데로 곧게 새는 맑은 소리예요 — 스~ (옆으로 새는 축축한 소리가 아니라)",
      internal: "혀끝을 살짝 떼고 혀 가운데에 좁은 홈을 만들어 바람이 앞으로 곧게 나가게 해요",
    },
    minimalPairs: [
      { target: "사자", error: "사자(설측)", note: "설측음화 ㅅ≈[ɬ] — SLP 검토 필요" },
      { target: "소", error: "소(설측)", note: "예시 — SLP 검토 필요" },
      { target: "수박", error: "수박(설측)", note: "예시 — SLP 검토 필요" },
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
