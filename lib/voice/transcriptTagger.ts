/**
 * 전사(verbatim) 텍스트 기반 비유창 1차 자동 태깅 — 음향으로 못 잡는
 * 언어적 유형(간투사·낱말/음절 반복·수정/거짓시작)을 규칙으로 초안 태그.
 *
 * ⚠ 위치(time)는 음절 비율로 추정한 값입니다. 강제정렬(forced alignment)
 *   없이 산출하므로 실제 발화 시점과 차이가 있을 수 있어, 임상가가 재생
 *   확인 후 위치/유형을 수정하는 것을 전제로 합니다.
 *
 * 전제: 전사가 verbatim(비유창 포함)이어야 함 — 예) "음 어제 하 아니
 *   학교 에-에-에서 친구를 만났-만났어요". 클라우드 ASR 결과는 비유창을
 *   제거하므로 이 분석에 부적합.
 */

// I=간투사, UR=수정/거짓시작, R1=낱말 반복, R2=음절 반복, P=연장, B=막힘
export type TranscriptTagType = "I" | "UR" | "R1" | "R2" | "P" | "B";

export interface TranscriptDraft {
  type: TranscriptTagType;
  time: number; // 추정 (sec)
  note: string;
}

// 간투사(filler) 후보 — 보수적으로 유지
const FILLERS = new Set(["음", "어", "으", "에", "엄", "그", "저", "거시기"]);
// 수정/거짓시작 신호어
const REVISION = new Set(["아니", "아니아니", "그게아니라", "아니그", "내가아니"]);

function hangulCount(s: string): number {
  return (s.match(/[가-힣]/g) || []).length;
}

// 늘임표·물결·반복모음 정규화: "어어"→"어", "음~"→"음", "그…"→"그"
function collapse(token: string): string {
  let t = token.replace(/[~….,!?·ː—#]/g, "");
  t = t.replace(/(.)\1+/g, "$1");
  return t;
}

// 연장 표시: 늘임 부호(ː · : · ~ · — em대시)
const PROLONG_MARK = /[ː:~—]/;
// 막힘 표시: '#' 또는 (막힘)/막힘
const BLOCK_MARK = /#|막힘/;

export function tagFromTranscript(
  transcript: string,
  duration: number,
): TranscriptDraft[] {
  const text = transcript.trim();
  if (!text) return [];

  const tokens = text.split(/\s+/).filter(Boolean);
  const totalSyll = Math.max(1, hangulCount(text));
  const drafts: TranscriptDraft[] = [];

  let running = 0; // 지금까지의 음절 수
  let prevClean = "";

  for (const tokenRaw of tokens) {
    const tokenSyll = hangulCount(tokenRaw);
    const at = duration > 0 ? (running / totalSyll) * duration : 0;
    const clean = collapse(tokenRaw);

    // 1) 토큰 내 대시 반복: "지-지-지구", "에-에-에서", "만났-만났어요"
    if (tokenRaw.includes("-")) {
      const parts = tokenRaw.split("-").map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2 && parts[0] && parts[1].startsWith(parts[0])) {
        const unit = parts[0];
        const unitSyll = hangulCount(unit);
        if (unitSyll >= 2) {
          drafts.push({ type: "R1", time: at, note: `전사: 낱말 반복 '${unit}'` });
        } else if (unitSyll === 1) {
          drafts.push({ type: "R2", time: at, note: `전사: 음절 반복 '${unit}'` });
        }
      }
    }

    // 2) 수정/거짓시작(UR)
    if (REVISION.has(clean)) {
      drafts.push({ type: "UR", time: at, note: `전사: 수정 '${tokenRaw}'` });
    } else if (
      tokenSyll === 1 &&
      !FILLERS.has(clean) &&
      tokenRaw.endsWith("-")
    ) {
      // 단음절 + 끊김 표시 → 거짓시작
      drafts.push({ type: "UR", time: at, note: `전사: 거짓시작 '${tokenRaw}'` });
    }

    // 3) 간투사(I)
    if (FILLERS.has(clean) && !tokenRaw.includes("-")) {
      drafts.push({ type: "I", time: at, note: `전사: 간투사 '${tokenRaw}'` });
    }

    // 4) 토큰 간 동일 반복: "어제 어제", "그 그"
    if (clean && clean === prevClean) {
      const sy = hangulCount(clean);
      if (sy >= 2)
        drafts.push({ type: "R1", time: at, note: `전사: 낱말 반복 '${clean}'` });
      else if (sy === 1 && !FILLERS.has(clean))
        drafts.push({ type: "R2", time: at, note: `전사: 음절 반복 '${clean}'` });
    }

    // 5) 막힘(B): '#사과', '(막힘)' 등 멈춤 표시
    if (BLOCK_MARK.test(tokenRaw)) {
      drafts.push({ type: "B", time: at, note: `전사: 막힘 '${tokenRaw}'` });
    }

    // 6) 연장(P): 늘임 부호(ː : ~ —) 또는 같은 글자 3회↑ 연속('스스스', '어어어')
    //    단, '-'(반복 표시) 토큰은 제외 — 이미 반복으로 처리
    if (
      PROLONG_MARK.test(tokenRaw) ||
      (!tokenRaw.includes("-") && /(.)\1{2,}/.test(tokenRaw))
    ) {
      drafts.push({ type: "P", time: at, note: `전사: 연장 '${tokenRaw}'` });
    }

    running += tokenSyll;
    prevClean = clean;
  }

  return drafts;
}
