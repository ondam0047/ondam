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
  count?: number; // 반복 유형의 반복 횟수(R1/R2)
}

// 간투사(filler) 후보 — 보수적으로 유지
const FILLERS = new Set(["음", "어", "으", "에", "엄", "그", "저", "거시기", "응", "그니까", "막"]);
// 수정/거짓시작 신호어
const REVISION = new Set(["아니", "아니아니", "그게아니라", "아니그", "내가아니", "아니다", "그러니까아니"]);

function hangulCount(s: string): number {
  return (s.match(/[가-힣]/g) || []).length;
}
// 자모(단독 자음/모음) — 소리 수준 반복 판별용
function isJamoOnly(s: string): boolean {
  return /^[ㄱ-ㅎㅏ-ㅣ]+$/.test(s);
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

/**
 * 전사(verbatim) → 비유창 유형 초안. 음향이 못 잡는 언어적 유형을 규칙으로 상세 분석.
 * - 반복(R1 낱말·R2 음절/소리): 토큰 내 대시 반복 + 토큰 간 동일 반복을 런(run)으로 묶어 횟수(count) 산출
 * - 연장(P): 늘임 부호(ː : ~ —)·같은 글자 3회↑ 연속, 늘임 정도를 note 에 기록
 * - 막힘(B): '#'·'(막힘)'
 * - 간투사(I)·수정/거짓시작(UR)
 */
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
  let i = 0;

  while (i < tokens.length) {
    const tokenRaw = tokens[i];
    const tokenSyll = hangulCount(tokenRaw);
    const at = duration > 0 ? (running / totalSyll) * duration : 0;
    const clean = collapse(tokenRaw);

    // 1) 막힘(B)
    if (BLOCK_MARK.test(tokenRaw)) {
      drafts.push({ type: "B", time: at, note: `전사: 막힘 '${tokenRaw}'` });
    }

    // 2) 연장(P) — 늘임 부호 또는 같은 글자 3회↑(대시 제외). 늘임 정도 추정.
    const elong = (tokenRaw.match(/(.)\1{2,}/g) || []).reduce((s, g) => s + g.length, 0);
    const marks = (tokenRaw.match(PROLONG_MARK) || []).length;
    if (marks > 0 || (!tokenRaw.includes("-") && elong > 0)) {
      const deg = marks > 0 ? `늘임표 ${marks}` : `반복모음 ${elong}자`;
      drafts.push({ type: "P", time: at, note: `전사: 연장 '${tokenRaw}' (${deg})` });
    }

    // 3) 수정(UR) — 신호어 (거짓시작은 5)에서 처리)
    if (REVISION.has(clean)) {
      drafts.push({ type: "UR", time: at, note: `전사: 수정 '${tokenRaw}'` });
    }

    // 4) 간투사(I)
    if (FILLERS.has(clean) && !tokenRaw.includes("-")) {
      drafts.push({ type: "I", time: at, note: `전사: 간투사 '${tokenRaw}'` });
    }

    // 5) 토큰 내 대시 반복: "지-지-지구", "에-에-에서", "ㅂ-바나나", "만났-만났어요"
    if (tokenRaw.includes("-")) {
      const parts = tokenRaw.split("-").map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const unit = parts[0];
        let reps = 1;
        for (const p of parts.slice(1)) {
          if (p === unit) reps++;
          else if (p.startsWith(unit) && p.length > unit.length) { reps++; break; } // 마지막 완성형
          else if (p.length === 1 && isJamoOnly(p) && p === unit) reps++;
          else break;
        }
        if (reps >= 2) {
          const us = hangulCount(unit);
          if (us >= 2) {
            drafts.push({ type: "R1", time: at, note: `전사: 낱말(부분) 반복 '${unit}' ${reps}회`, count: reps });
          } else {
            const kind = isJamoOnly(unit) ? "소리" : "음절";
            drafts.push({ type: "R2", time: at, note: `전사: ${kind} 반복 '${unit}' ${reps}회`, count: reps });
          }
        } else if (parts.length >= 2 && hangulCount(unit) === 1 && !FILLERS.has(unit)) {
          // 단음절 + 끊김(완성 안 됨) → 거짓시작(UR)
          drafts.push({ type: "UR", time: at, note: `전사: 거짓시작 '${tokenRaw}'` });
        }
      }
    }

    // 6) 토큰 간 동일 반복 런: "어제 어제 어제", "그 그"
    if (clean && !FILLERS.has(clean) && hangulCount(clean) >= 1) {
      let runLen = 1;
      while (i + runLen < tokens.length && collapse(tokens[i + runLen]) === clean) runLen++;
      if (runLen >= 2) {
        const sy = hangulCount(clean);
        if (sy >= 2) drafts.push({ type: "R1", time: at, note: `전사: 낱말 반복 '${clean}' ${runLen}회`, count: runLen });
        else drafts.push({ type: "R2", time: at, note: `전사: 음절 반복 '${clean}' ${runLen}회`, count: runLen });
        for (let k = 0; k < runLen; k++) running += hangulCount(tokens[i + k]);
        i += runLen;
        continue;
      }
    }

    running += tokenSyll;
    i++;
  }

  return drafts;
}
