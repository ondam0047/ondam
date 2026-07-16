// Korean phoneme → blendshape-weight mapping for the rigged articulator model.
// Source of truth: Downloads/articulator_3d_notes.md (§ 한국어 음소 → 블렌드셰이프 매핑).
// Morph names must match the GLB exactly (head/lip/tongue meshes, keyed by name).
//
// Weight semantics (notes §조음 원리):
//   1.0       = full contact (stops, nasals, lateral)
//   0.7~0.85  = constriction, not touching (fricatives → turbulence)
//   0~0.3     = near-neutral / open (vowels, ㅎ)

export type Pose = Record<string, number>;

// The rigger's fresh v25 GLB (exported from Articulator.blend) keeps the ORIGINAL
// velum key: velum_open=1 moves the velum UP/BACK → port CLOSED (verified via morph
// delta: top-moved verts dY=+0.19, at X=-0.32 posterior). Our semantic wants
// velum_open=1 = port OPEN, so invert at runtime (val = 1 - val). Then rest
// (IDLE velum_open=1 → 0 → velum down → OPEN, nasal breathing), oral sounds
// (velum_open=0 → 1 → CLOSED), nasals (velum_open=1 → 0 → OPEN).
export const VELUM_INVERTED = true;

// 연구개 폐쇄 상한: 오럴 사운드(ㄱ 등)는 연구개가 후인두벽에 닿아 완전히 닫혀야 한다.
// 원본 velum_open 모프는 tip을 수직으로만 올려 root→tip이 0.48→0.43으로 줄고(foreshortening)
// 벽엔 안 닿았다. → head-rigged.glb의 셰이프키를 재구성: velum 플랩을 root(전방부착부 (0.03,0.42))
// 기준 강체회전(15°)으로 올리고(길이 유지), 순수 회전으로는 반경상 ~0.03 못 미치는 후인두벽까지
// 자유연 tip만 페더링해 posterior로 연장(top은 그대로 → 두개골 침범 없음). 최종 tip≈(-0.486,0.337)
// = 사용자가 표시한 벽 지점 도달. 오럴(폐쇄)=적용 1.0, 개방(비강 ㅇ/휴지)=적용 0(rest·하강).
// 적용값 = (1 - semantic) * VELUM_CLOSE.  (원본: head-rigged.backup-preVelumSeal.glb)
export const VELUM_CLOSE = 1.0;

// "닫힘"의 정의: 오럴 사운드가 완전 밀폐(semantic 0 → 적용 1.0)까지 가지 않고, 살짝 여지를 둔
// semantic 0.100(적용 0.9)을 닫힘의 하한으로 삼는다. 적용 직전 velum_open을 이 값으로 floor.
export const VELUM_CLOSED_MIN = 0.1;

export type Manner =
  | "stop"
  | "nasal"
  | "fricative"
  | "affricate"
  | "tap"
  | "lateral"
  | "glottal";

export function mannerOf(s: string): Manner {
  if (s.includes("파찰")) return "affricate";
  if (s.includes("파열")) return "stop";
  if (s.includes("비음")) return "nasal";
  if (s.includes("마찰")) return "fricative";
  if (s.includes("탄설")) return "tap";
  if (s.includes("설측")) return "lateral";
  return "glottal";
}

// All controllable morph targets (for zeroing / iteration).
export const MORPHS = [
  "tongue_tip_up",
  "tongue_tip_down",
  "tongue_front_up",
  "tongue_back_up",
  "tongue_retract",
  "tongue_groove",
  "tongue_lateral_channel",
  "lips_closed",
  "lips_round",
  "lips_spread",
  "jaw_open",
  "velum_open",
] as const;

// Lip-material opacity per phoneme type (notes §입술 투명도 매핑). Lower = reveal
// tongue/contact behind the lips; 1.0 = lips are the key articulator.
export const LIP_OPACITY = {
  bilabial: 1.0, // ㅂㅍㅁ — lips are the articulator
  rounded: 1.0, // ㅗㅜ + 원순 이중모음 — rounding is the cue
  spread: 0.6, // ㅣㅔㅐ — show spread but expose tongue
  fricative: 0.25, // ㅅㅆㅈㅊ — groove/contact is the cue
  alveolar: 0.4, // ㄷㅌㄴ — tongue-tip contact
  velar: 0.4, // ㄱㅋㅇ — tongue-back contact
  lateral: 0.3, // ㄹ — lateral airflow
  glottal: 0.5, // ㅎ — cavity follows vowel
  openVowel: 0.6, // ㅏㅓㅡ — show inside
  idle: 1.0,
} as const;

export type Consonant = {
  id: string;
  label: string; // member graphemes (평/격/경 동일 그룹)
  manner: string;
  pose: Pose;
  opacity: number;
  repeat?: boolean; // ㄹ 탄설 — tap, oscillate
  note?: string;
};

// 자음 11그룹 (평음/격음/경음 동일 형태 — 성문 긴장도·VOT만 차이)
export const CONSONANTS: Consonant[] = [
  // 양순음 ㅂㅍㅃ·ㅁ는 입술이 완전히 밀폐돼야 하는데, lips_closed 모프가 아랫입술만
  // 위로 올리는 편측 모프(윗입술은 안 움직임)라 1.0으론 세로 틈 0.014가 남아 안 닫힘.
  // 아랫입술을 가볍게 올려 살짝 닿는 정도(1.1). 1.7~1.8은 눌려 겹쳐 보여 과함.
  // three.js는 morph influence를 1.0에서 자르지 않음(lips_round와 동일 원리).
  { id: "p", label: "ㅂㅍㅃ", manner: "양순 파열", pose: { lips_closed: 1.1 }, opacity: LIP_OPACITY.bilabial },
  { id: "m", label: "ㅁ", manner: "양순 비음", pose: { lips_closed: 1.1, velum_open: 1 }, opacity: LIP_OPACITY.bilabial },
  // 치조음: tip_up=1만으론 혀끝이 치조에 살짝 못 미쳐 → front_up 0.4로 혀 앞날을 함께 올려 접촉.
  { id: "t", label: "ㄷㅌㄸ", manner: "치조 파열", pose: { tongue_tip_up: 1, tongue_front_up: 0.4, jaw_open: 0.15 }, opacity: LIP_OPACITY.alveolar },
  { id: "n", label: "ㄴ", manner: "치조 비음", pose: { tongue_tip_up: 1, tongue_front_up: 0.4, velum_open: 1 }, opacity: LIP_OPACITY.alveolar },
  {
    id: "s",
    label: "ㅅㅆ",
    manner: "치조 마찰",
    pose: { tongue_front_up: 0.55, tongue_tip_up: 0.35, tongue_groove: 0.5, lips_closed: 0.6 },
    opacity: LIP_OPACITY.fricative,
    note: "마찰음: 혀 앞날이 치조에 접근하되 닿지 않고 좁은 틈 유지 — front_up 0.55(0.65는 너무 붙어 보여 살짝 낮춤, 마찰 틈 확보). 턱 안 벌어짐(lips_closed 0.6, 립 반투명이라 혀 그루브 보임)",
  },
  {
    id: "c",
    label: "ㅈㅊㅉ",
    manner: "치경경구개 파찰",
    pose: { tongue_front_up: 0.9, tongue_groove: 0.5, lips_closed: 0.6 },
    opacity: LIP_OPACITY.fricative,
    note: "폐쇄→개방 2단계. front_up 0.9(1.0은 혀가 경구개를 뚫고 넘어감 — 닿되 안 뚫게). 턱 안 벌어짐 — 휴지보다 살짝 다물린 자세(lips_closed 0.6, 마찰 개방 구간도 jaw 대신 lips_closed)",
  },
  // 연구개음(레퍼런스 David Newman /k g ŋ/ + 사용자 수동 조정): ㄱ와 ㅇ은 혀 위치가 동일하고
  // (혀 뒤가 연구개 오럴면에 접촉 — 이 면은 velum_open 모프로 거의 안 움직임) 연구개 tip만 다름.
  // velum_open은 semantic 값(적용 = (1−semantic)·VELUM_CLOSE, 디버그 슬라이더 표기와 동일).
  //   ㄱ(/k/·오럴): velum_open 0.10 → 적용 0.90 (연구개 상승·tip 벽 밀착·비강 밀폐). 동작 내내 고정.
  //   ㅇ(/ŋ/·비음): velum_open 0.85 → 적용 0.15 (연구개 하강·tip 개방·비강 개방).
  // 혀 값은 사용자가 수동 모프로 맞춘 ㅇ 자세를 공유. (RiggedViewer의 velar dorsum 리프트는 back_up≥0.9에서만
  // 발동하는데 여기 back_up=0.71이라 현재는 미발동 — 훗날 혀를 더 올릴 필요가 생기면 그 훅으로.)
  { id: "k", label: "ㄱㅋㄲ", manner: "연구개 파열", pose: { tongue_tip_down: 0.58, tongue_back_up: 1.0, tongue_retract: 1.0, tongue_groove: 1.0, velum_open: 0.1 }, opacity: LIP_OPACITY.velar },
  { id: "ng", label: "ㅇ(받침)", manner: "연구개 비음", pose: { tongue_tip_up: 0.13, tongue_tip_down: 0.29, tongue_back_up: 0.71, tongue_retract: 1.0, tongue_groove: 0.35, velum_open: 0.85 }, opacity: LIP_OPACITY.velar },
  { id: "r_tap", label: "ㄹ(탄설)", manner: "치조 탄설", pose: { tongue_tip_up: 1 }, opacity: LIP_OPACITY.lateral, repeat: true },
  // 설측: 탄설과 동일한 혀끝 치조 위치, 차이는 타이밍뿐(설측=유지 / 탄설=상승후 하강).
  // tongue_lateral_channel은 혀를 비인두까지 솟구치게 해 제외(모프 거동 의심 — 리거 확인 대상).
  { id: "l", label: "ㄹ(설측)", manner: "치조 설측", pose: { tongue_tip_up: 1 }, opacity: LIP_OPACITY.lateral },
  { id: "h", label: "ㅎ", manner: "성문 마찰", pose: { jaw_open: 0.3 }, opacity: LIP_OPACITY.glottal, note: "후속 모음에 동시조음" },
];

export type Vowel = {
  id: string;
  label: string;
  feature: string;
  pose: Pose;
  opacity: number;
};

// 단모음 8 (ㅚㅟ는 이중모음으로 처리)
export const VOWELS: Record<string, Vowel> = {
  // ㅏ [ɐ] 저·중앙 — 후설이 아니므로 tongue_retract 제거(개구가 핵심 단서)
  a: { id: "a", label: "ㅏ", feature: "저·중앙 평순", pose: { jaw_open: 0.85 }, opacity: LIP_OPACITY.openVowel },
  // ㅓ [ʌ]는 中모음(ㅔ·ㅗ와 같은 높이) — jaw 0.5는 저모음 ㅏ 쪽으로 과다 개구였음.
  // 표준 단모음표 기준 中모음 개구(ㅔ 0.35/ㅗ 0.3)에 맞춰 0.4로 낮추고 lips_closed
  // 0.15로 입술을 조금 더 모음(평순이라 round/spread는 없음).
  eo: { id: "eo", label: "ㅓ", feature: "중·중설 평순", pose: { jaw_open: 0.4, tongue_retract: 0.2, lips_closed: 0.15 }, opacity: LIP_OPACITY.openVowel },
  // 원순모음 ㅗ·ㅜ: lips_round 모프의 최대(1.0)보다 더 오므려야 자연스러워 → 1.5로
  // 외삽(three.js는 morph influence를 1.0에서 자르지 않고 델타를 그만큼 더 밀어붙임).
  // 턱이 조금 열리므로(ㅜ도 소량) 그대로면 입이 벌어져 → lips_closed 0.3으로 위아래
  // 입술을 다시 모아 "작게 오므린 원순" 구멍을 만든다(라운드+클로즈드 동시 조합).
  o: { id: "o", label: "ㅗ", feature: "중·후 원순", pose: { jaw_open: 0.3, lips_round: 1.5, lips_closed: 0.3, tongue_back_up: 0.4 }, opacity: LIP_OPACITY.rounded },
  // ㅜ는 고모음이라 ㅗ(중모음)보다 아랫입술이 더 위로 올라와 아주 작은 원순 구멍이
  // 돼야 함 → lips_closed 0.7(ㅗ 0.3보다 훨씬 높게)로 아랫입술을 더 끌어올림.
  u: { id: "u", label: "ㅜ", feature: "고·후 원순", pose: { jaw_open: 0.15, lips_round: 1.5, lips_closed: 0.7, tongue_back_up: 0.6 }, opacity: LIP_OPACITY.rounded },
  // 고모음 ㅡ·ㅣ: 입을 거의 다문 자세라 lips_closed 0.5로 위아래 입술을 더 모음(벌어짐 감소).
  eu: { id: "eu", label: "ㅡ", feature: "고·후 평순", pose: { tongue_back_up: 0.5, lips_closed: 0.5 }, opacity: LIP_OPACITY.openVowel },
  i: { id: "i", label: "ㅣ", feature: "고·전 평순", pose: { tongue_front_up: 0.8, lips_spread: 0.6, lips_closed: 0.5 }, opacity: LIP_OPACITY.spread },
  // 현대 서울말에서 ㅔ/ㅐ는 [e̞]로 병합 → 동일 자세 (이중모음 ㅖ=ㅒ, ㅞ=ㅙ도 자동 일치)
  e: { id: "e", label: "ㅔ", feature: "중·전 평순 [e̞] (ㅔ/ㅐ 병합)", pose: { tongue_front_up: 0.35, lips_spread: 0.3, jaw_open: 0.35 }, opacity: LIP_OPACITY.spread },
  ae: { id: "ae", label: "ㅐ", feature: "중·전 평순 [e̞] (ㅔ/ㅐ 병합)", pose: { tongue_front_up: 0.35, lips_spread: 0.3, jaw_open: 0.35 }, opacity: LIP_OPACITY.spread },
};

export type Diphthong = {
  id: string;
  label: string;
  from: string; // vowel id
  to: string; // vowel id
};

// 이중모음 — 단모음간 시간축 보간. ㅐ/ㅔ 병합([e̞])으로 ㅖ=ㅒ, ㅞ=ㅙ=ㅚ가
// 동일 발음이라 통합 버튼으로 묶음.
export const DIPHTHONGS: Diphthong[] = [
  { id: "ya", label: "ㅑ", from: "i", to: "a" },
  { id: "yeo", label: "ㅕ", from: "i", to: "eo" },
  { id: "yo", label: "ㅛ", from: "i", to: "o" },
  { id: "yu", label: "ㅠ", from: "i", to: "u" },
  { id: "ye", label: "ㅖ/ㅒ", from: "i", to: "e" }, // ㅖ=ㅒ
  { id: "wa", label: "ㅘ", from: "u", to: "a" },
  { id: "wo", label: "ㅝ", from: "u", to: "eo" },
  { id: "we", label: "ㅞ/ㅙ/ㅚ", from: "u", to: "e" }, // ㅞ=ㅙ=ㅚ
  { id: "wi", label: "ㅟ", from: "u", to: "i" },
  { id: "ui", label: "ㅢ", from: "eu", to: "i" },
];

// Build a full 12-morph pose (missing targets → 0) from a sparse pose.
export function fullPose(p: Pose): Pose {
  const out: Pose = {};
  for (const m of MORPHS) out[m] = p[m] ?? 0;
  return out;
}

// Rest/idle: velopharyngeal port OPEN (nasal breathing). Oral sounds actively
// close it (velum_open = 0); nasals keep it open. Since v16 the shape key drives
// the port directly (w=1 = open) — no apply-time inversion.
// Rest = lips SLIGHTLY OPEN (natural speech-ready posture) — no lips_closed. Only the
// bilabials ㅂㅍㅃ·ㅁ actively bring the lips into contact (lips_closed ~1.8). All
// consonants settle back to this slightly-open rest.
export const IDLE_POSE: Pose = fullPose({ velum_open: 1 });

// Linear interpolation between two poses (used for diphthongs & smoothing).
export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const out: Pose = {};
  for (const m of MORPHS) {
    const av = a[m] ?? 0;
    const bv = b[m] ?? 0;
    out[m] = av + (bv - av) * t;
  }
  return out;
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
