// 바로툴(음성·학습 모듈) 요금제 게이팅 + 모듈 카탈로그.
//
// 정책(확정 2026-06-10):
//  - 무료체험(가입 30일) 중에는 plan 무관 전체 개방. 베타 가입자는 trialEndsAt=null = 무기한 개방.
//  - 체험 종료 후: pro → 전체 / solo → Solo 모듈만 / 그 외 → 잠금.
//  - 미완성 모듈은 "준비중"(soon) — 요금제와 무관하게 클릭 시 준비중 안내.

export type Plan = "trial" | "solo" | "pro" | "expired";
export type Tier = "solo" | "pro";
export type ModuleStatus = "ready" | "soon";

export type ToolModule = {
  key: string;
  no: number;            // 설계서상 모듈 번호(#1~9)
  label: string;
  desc: string;
  tier: Tier;
  status: ModuleStatus;  // ready=사용가능, soon=준비중
  href: string;
};

// 9개 모듈 카탈로그 — Solo 4종(#1~4) + Pro 5종(#5~9).
// 현재 단계는 기반(Phase 0)만 — 모든 모듈 준비중(soon)으로 노출.
export const TOOL_MODULES: ToolModule[] = [
  { key: "loudness",    no: 1, tier: "solo", status: "soon", href: "/tools/loudness",
    label: "실시간 음도·강도 시각화", desc: "목소리의 높낮이(음도)와 크기(강도)를 실시간 그래프로 보여줘요." },
  { key: "spectrogram", no: 2, tier: "solo", status: "soon", href: "/tools/spectrogram",
    label: "/s/ 스펙트로그램", desc: "마찰음 /s/ 소리를 스펙트로그램으로 시각화해 변별 학습을 도와요." },
  { key: "mpt",         no: 3, tier: "solo", status: "soon", href: "/tools/mpt",
    label: "MPT 측정", desc: "최대발성지속시간(MPT)을 3회 측정·기록해요." },
  { key: "daf",         no: 4, tier: "solo", status: "soon", href: "/tools/daf",
    label: "DAF 훈련 보조", desc: "지연 청각 피드백(50–500ms)으로 말하기 속도 연습을 보조해요." },

  { key: "speech-rate", no: 5, tier: "pro", status: "soon", href: "/tools/speech-rate",
    label: "말속도 측정", desc: "발화 구간을 잡아 초당 음절수(SPS)로 말속도를 측정해요." },
  { key: "fluency",     no: 6, tier: "pro", status: "soon", href: "/tools/fluency",
    label: "유창성 자가 모니터링", desc: "말의 흐름을 스스로 점검하고 기록으로 누적해요." },
  { key: "pacing",      no: 7, tier: "pro", status: "soon", href: "/tools/pacing",
    label: "말속도 조절 연습", desc: "메트로놈·페이싱 안내에 맞춰 말하기 속도를 조절하는 연습이에요." },
  { key: "articulation",no: 8, tier: "pro", status: "soon", href: "/tools/articulation",
    label: "조음 학습 자료 (바로조음)", desc: "조음 위치를 3D로 보며 익히는 학습 자료예요." },
  { key: "pragmatics",  no: 9, tier: "pro", status: "soon", href: "/tools/pragmatics",
    label: "화용 학습 게임 (바로화용)", desc: "상황 속 의사소통(화용)을 게임으로 연습해요." },
];

export function soloModules(): ToolModule[] {
  return TOOL_MODULES.filter((m) => m.tier === "solo");
}
export function proModules(): ToolModule[] {
  return TOOL_MODULES.filter((m) => m.tier === "pro");
}

// 요금제 판정에 필요한 사용자 필드(부분).
export type PlanUser = {
  plan: string | null;
  trialEndsAt: Date | null;
};

// 무료체험(또는 베타 무기한) 개방 상태인지.
// trialEndsAt=null → 베타 무기한 개방. 미래 → 체험 중. 과거 → 체험 종료.
export function isTrialOpen(user: PlanUser, now: Date = new Date()): boolean {
  if (user.trialEndsAt === null || user.trialEndsAt === undefined) return true;
  return user.trialEndsAt.getTime() > now.getTime();
}

// 특정 등급(tier)의 모듈을 사용할 수 있는지(준비중 여부와 무관한 "요금제" 판정).
export function canUseTier(user: PlanUser, tier: Tier, now: Date = new Date()): boolean {
  if (isTrialOpen(user, now)) return true;     // 체험·베타: 전체 개방
  if (user.plan === "pro") return true;        // Pro: 전체
  if (user.plan === "solo") return tier === "solo"; // Solo: Solo 모듈만
  return false;                                 // expired 등: 잠금
}

// 모듈 단위 접근 가능 여부.
export function canUseModule(user: PlanUser, m: ToolModule, now: Date = new Date()): boolean {
  return canUseTier(user, m.tier, now);
}

// 헤더/배지용 라벨.
export function planLabel(user: PlanUser, now: Date = new Date()): string {
  if (isTrialOpen(user, now)) {
    return user.trialEndsAt === null ? "베타 (전체 개방)" : "무료체험";
  }
  if (user.plan === "pro") return "Pro";
  if (user.plan === "solo") return "Solo";
  return "체험 종료";
}
