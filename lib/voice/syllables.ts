// 한글 음절·어절 처리 + 말속도 피드백 (바로툴 말속도/말속도조절 공용)

// 한글 음절(가–힣) 개수.
export function countKoreanSyllables(text: string): number {
  const matches = text.match(/[가-힣]/g);
  return matches ? matches.length : 0;
}

export type ChunkMode = "1어절씩" | "2어절씩" | "3어절씩" | "4어절씩" | "전체 문장";

export function getChunkSize(mode: ChunkMode): number {
  switch (mode) {
    case "1어절씩": return 1;
    case "2어절씩": return 2;
    case "3어절씩": return 3;
    case "4어절씩": return 4;
    default: return Number.MAX_SAFE_INTEGER; // 전체 문장
  }
}

// 텍스트를 어절 단위 묶음으로 분할.
export function splitIntoChunks(text: string, mode: ChunkMode): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const size = getChunkSize(mode);
  if (size === Number.MAX_SAFE_INTEGER) return [trimmed];
  const words = trimmed.split(/\s+/);
  const out: string[] = [];
  for (let i = 0; i < words.length; i += size) {
    out.push(words.slice(i, i + size).join(" "));
  }
  return out;
}

export type RateFeedback = "빠름" | "느림" | "적절";

// 측정 말속도(SPS)와 목표를 비교 (±0.4 음절/초 이내면 적절).
export function getRateFeedback(measuredSps: number, targetSps: number): RateFeedback {
  const diff = measuredSps - targetSps;
  if (diff > 0.4) return "빠름";
  if (diff < -0.4) return "느림";
  return "적절";
}
