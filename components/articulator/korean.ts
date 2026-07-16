// 한글 단어 → 표준발음(음운변동 적용) → 음절/조음 대상 → 조음 라이브러리 음소(PHONES id) 매핑.
// 조음 위치는 표기가 아니라 "실제 발음"을 따라야 하므로 표준발음법의 주요 음운변동을 적용한다.
//
// 적용 규칙(조음 위치·방법에 영향):
//   · 음절끝소리(평파열음화)·겹받침 단순화 — 받침 중화/불파
//   · 연음(재음절화) — 받침이 뒤 모음 초성으로, 원래 조음위치 복원(옷이→오시)
//   · 비음화 — 파열음+비음 → 비음(악마→앙마, 국물→궁물, 닫는→단는)
//   · ㄹ 비음화 — ㅁㅇ+ㄹ → ㄴ(종로→종노, 대통령→대통녕)
//   · 유음화 — ㄴㄹ/ㄹㄴ → ㄹㄹ(신라→실라, 칼날→칼랄)
//   · 구개음화 — ㄷㅌ+이 → ㅈㅊ(굳이→구지, 같이→가치)
//   · 격음화·ㅎ탈락 — 좋다→조타, 좋아→조아 (격음은 평음과 조음위치 동일)
//
// 미적용(다음 단계·조음위치 무관): 경음화(평↔경 위치 동일, 국밥→국빱), ㄴ첨가, 사잇소리.
//
// 변이음(allophone): ㄹ=초성 탄설[ɾ]/종성·설측 [l], ㅇ=초성 무음/종성 [ŋ], 받침 불파,
//   ㅅ/ㅆ+ㅣ·j → 경구개 [ɕ](표시만, 포즈 미세보정은 옵션). 카테고리 변이음은 매핑에 반영.

const CHO = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];
const JUNG = [
  "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ",
  "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ",
];
const JONG = [
  "", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ",
  "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];
const CHO_IDX: Record<string, number> = Object.fromEntries(CHO.map((c, i) => [c, i]));
const JUNG_IDX: Record<string, number> = Object.fromEntries(JUNG.map((c, i) => [c, i]));
const JONG_IDX: Record<string, number> = Object.fromEntries(JONG.map((c, i) => [c, i]));

// 겹받침 → [앞소리, 뒷소리] (연음 시 분리)
const CLUSTER: Record<string, [string, string]> = {
  ㄳ: ["ㄱ", "ㅅ"], ㄵ: ["ㄴ", "ㅈ"], ㄶ: ["ㄴ", "ㅎ"], ㄺ: ["ㄹ", "ㄱ"], ㄻ: ["ㄹ", "ㅁ"],
  ㄼ: ["ㄹ", "ㅂ"], ㄽ: ["ㄹ", "ㅅ"], ㄾ: ["ㄹ", "ㅌ"], ㄿ: ["ㄹ", "ㅍ"], ㅀ: ["ㄹ", "ㅎ"], ㅄ: ["ㅂ", "ㅅ"],
};
// 겹받침 대표음(자음 앞·어말)
const CLUSTER_REP: Record<string, string> = {
  ㄳ: "ㄱ", ㄵ: "ㄴ", ㄶ: "ㄴ", ㄺ: "ㄱ", ㄻ: "ㅁ", ㄼ: "ㄹ", ㄽ: "ㄹ", ㄾ: "ㄹ", ㄿ: "ㅂ", ㅀ: "ㄹ", ㅄ: "ㅂ",
};
// 홑받침 평파열음화(중화)
const NEUT: Record<string, string> = {
  ㄲ: "ㄱ", ㅋ: "ㄱ", ㅅ: "ㄷ", ㅆ: "ㄷ", ㅈ: "ㄷ", ㅊ: "ㄷ", ㅌ: "ㄷ", ㅍ: "ㅂ", ㅎ: "ㄷ",
};
const ASP: Record<string, string> = { ㄱ: "ㅋ", ㄷ: "ㅌ", ㅈ: "ㅊ", ㅂ: "ㅍ", ㅅ: "ㅆ" };
const STOP_TO_NASAL: Record<string, string> = { ㄱ: "ㅇ", ㄷ: "ㄴ", ㅂ: "ㅁ" };

const isCluster = (j: string) => j.length === 1 && j in CLUSTER;
const neutralize = (coda: string): string =>
  coda === "" ? "" : isCluster(coda) ? CLUSTER_REP[coda] : NEUT[coda] ?? coda;
// 구개음화 유발 모음(표준: 이/히). 안전하게 ㅣ만.
const isPalatalNuc = (nuc: string) => nuc === "ㅣ";

// 초성 자모 → 자음 라이브러리 id (ㅇ=무음 null). 격음/경음은 조음위치 동일 그룹.
const ONSET_ID: Record<string, string | null> = {
  ㄱ: "k", ㄲ: "k", ㅋ: "k",
  ㄴ: "n", ㄷ: "t", ㄸ: "t", ㅌ: "t",
  ㄹ: "r_tap",
  ㅁ: "m", ㅂ: "p", ㅃ: "p", ㅍ: "p",
  ㅅ: "s", ㅆ: "s",
  ㅇ: null,
  ㅈ: "c", ㅉ: "c", ㅊ: "c",
  ㅎ: "h",
};
const NUCLEUS_ID: Record<string, string> = {
  ㅏ: "a", ㅐ: "ae", ㅑ: "a", ㅒ: "e", ㅓ: "eo", ㅔ: "e", ㅕ: "eo", ㅖ: "e",
  ㅗ: "o", ㅘ: "a", ㅙ: "e", ㅚ: "e", ㅛ: "o", ㅜ: "u", ㅝ: "eo", ㅞ: "e",
  ㅟ: "i", ㅠ: "u", ㅡ: "eu", ㅢ: "i", ㅣ: "i",
};
// 종성(발음 확정된 7종성) → 자음 라이브러리 id
const CODA_ID: Record<string, string> = {
  ㄱ: "k", ㄴ: "n", ㄷ: "t", ㄹ: "l", ㅁ: "m", ㅂ: "p", ㅇ: "ng",
};

export type TargetRole = "onset" | "nucleus" | "coda";
export const ROLE_LABEL: Record<TargetRole, string> = { onset: "초성", nucleus: "중성", coda: "종성" };

export type WordTarget = {
  key: string; // `${sylIndex}-${role}`
  syl: number;
  role: TargetRole;
  jamo: string; // 발음 자모
  phoneId: string; // PHONES id ("c_*" / "v_*")
  note?: string; // 변이음 메모
  poseOverride?: Record<string, number>; // 변이음 자세(있으면 라이브러리 기본 포즈 대신 사용)
  glide?: string; // 활음(반모음) 중성이면 온글라이드 시작 모음 id("i"=j / "u"=w / "eu"=ㅢ). 재생 시 온글라이드→핵모음 전이.
};

// 활음(반모음) 중성 → 온글라이드 시작 고모음. j계열=ㅣ(i), w계열=ㅜ(u), ㅢ=ㅡ(eu).
// 핵모음은 NUCLEUS_ID가 이미 정함(ㅑ→a 등). 재생에서 이 시작모음→핵모음으로 미끄러진다.
const GLIDE_ONSET: Record<string, string> = {
  ㅑ: "i", ㅕ: "i", ㅛ: "i", ㅠ: "i", ㅖ: "i", ㅒ: "i",
  ㅘ: "u", ㅝ: "u", ㅙ: "u", ㅞ: "u", ㅟ: "u", ㅚ: "u",
  ㅢ: "eu",
};

// 변이음 자세: ㅅ/ㅆ + ㅣ·j → 경구개 [ɕ]. 기본 ㅅ(치경, front_up 0.55/tip_up 0.35)보다
// 혀 앞날을 경구개로 더 올리고(front_up 0.85) 혀끝은 낮춰(tip_up 0.15) 접촉점을 경구개로 옮김.
const S_PALATAL_POSE: Record<string, number> = {
  tongue_front_up: 0.85,
  tongue_tip_up: 0.15,
  tongue_groove: 0.5,
  lips_closed: 0.6,
};
export type SyllableInfo = { char: string; targets: WordTarget[] };
export type WordAnalysis = {
  input: string;
  pronunciation: string; // 표준발음 음절열
  rules: string[]; // 적용된 음운변동
  notes: string[]; // 변이음 등 참고
  syllables: SyllableInfo[];
};

type Syl = { cho: string; jung: string; jong: string };

const isHangul = (code: number) => code >= 0xac00 && code <= 0xd7a3;

function parse(word: string): Syl[] {
  const out: Syl[] = [];
  for (const ch of Array.from(word)) {
    const code = ch.codePointAt(0)!;
    if (!isHangul(code)) continue;
    const s = code - 0xac00;
    out.push({
      cho: CHO[Math.floor(s / (28 * 21))],
      jung: JUNG[Math.floor(s / 28) % 21],
      jong: JONG[s % 28],
    });
  }
  return out;
}

function compose(s: Syl): string {
  const ci = CHO_IDX[s.cho] ?? 11; // 기본 ㅇ
  const ji = JUNG_IDX[s.jung] ?? 0;
  const ki = JONG_IDX[s.jong] ?? 0;
  return String.fromCodePoint(0xac00 + (ci * 21 + ji) * 28 + ki);
}

export function analyzeWord(word: string): WordAnalysis {
  const syls = parse(word);
  const rules = new Set<string>();
  const notes = new Set<string>();
  if (!syls.length) {
    return { input: word, pronunciation: "", rules: [], notes: [], syllables: [] };
  }

  for (let i = 0; i < syls.length - 1; i++) {
    const A = syls[i];
    const B = syls[i + 1];
    let coda = A.jong;
    let onset = B.cho;
    const nuc = B.jung;

    if (onset === "ㅇ") {
      // 모음 초성: 연음 / ㅎ탈락 / 구개음화 / 겹받침 분리
      if (coda === "") continue;
      if (isCluster(coda)) {
        const [c1, c2] = CLUSTER[coda];
        if (c2 === "ㅎ") {
          // ㄶ,ㅀ + 모음 → ㅎ탈락, 앞자음 연음 (많아→마나, 싫어→시러)
          B.cho = c1;
          A.jong = "";
          rules.add("ㅎ 탈락");
          rules.add("연음");
        } else {
          A.jong = c1; // 앞자음은 받침
          B.cho = c2; // 뒷자음은 연음
          rules.add("연음(겹받침)");
        }
      } else if (coda === "ㅇ") {
        // ㅇ[ŋ]은 그대로 받침, 뒤 초성 무음 유지 (강아지)
        continue;
      } else if (coda === "ㅎ") {
        A.jong = "";
        rules.add("ㅎ 탈락");
      } else if ((coda === "ㄷ" || coda === "ㅌ") && isPalatalNuc(nuc)) {
        B.cho = coda === "ㄷ" ? "ㅈ" : "ㅊ";
        A.jong = "";
        rules.add("구개음화");
      } else {
        // 연음: 받침이 원래 소리로 뒤 초성이 됨 (옷이→오시, 앞에→아페)
        B.cho = coda;
        A.jong = "";
        rules.add("연음");
      }
      continue;
    }

    // 자음 초성
    // 1) 격음화 / ㅎ축약 (받침에 ㅎ)
    const hInCoda = coda === "ㅎ" || coda === "ㄶ" || coda === "ㅀ";
    if (hInCoda && onset in ASP) {
      B.cho = ASP[onset];
      A.jong = coda === "ㄶ" ? "ㄴ" : coda === "ㅀ" ? "ㄹ" : "";
      rules.add("격음화");
      coda = A.jong;
    }
    // 2) 평파열음화(중화)
    const nc = neutralize(coda);
    if (nc !== coda && coda !== "") rules.add("음절끝소리(중화)");
    coda = nc;
    onset = B.cho;
    // 3) 비음화 (파열음 + 비음)
    if (coda in STOP_TO_NASAL && (onset === "ㄴ" || onset === "ㅁ")) {
      coda = STOP_TO_NASAL[coda];
      rules.add("비음화");
    }
    // 3b) 파열음 + ㄹ → 파열음 비음화 + ㄹ→ㄴ (백리→뱅니)
    if (coda in STOP_TO_NASAL && onset === "ㄹ") {
      coda = STOP_TO_NASAL[coda];
      B.cho = "ㄴ";
      onset = "ㄴ";
      rules.add("비음화");
    }
    // 4) ㄹ 비음화 (ㅁㅇ + ㄹ)
    if ((coda === "ㅁ" || coda === "ㅇ") && onset === "ㄹ") {
      B.cho = "ㄴ";
      onset = "ㄴ";
      rules.add("ㄹ 비음화");
    }
    // 5) 유음화
    if (coda === "ㄴ" && onset === "ㄹ") {
      coda = "ㄹ";
      rules.add("유음화");
    } else if (coda === "ㄹ" && onset === "ㄴ") {
      B.cho = "ㄹ";
      onset = "ㄹ";
      rules.add("유음화");
    }
    A.jong = coda;
    B.cho = onset;
  }

  // 어말 받침 중화
  const last = syls[syls.length - 1];
  if (last.jong) {
    const nc = neutralize(last.jong);
    if (nc !== last.jong) rules.add("음절끝소리(중화)");
    last.jong = nc;
  }

  // 발음 음절 + 조음 대상 빌드
  const syllables: SyllableInfo[] = syls.map((s, si) => {
    const targets: WordTarget[] = [];
    // 초성
    if (s.cho !== "ㅇ") {
      let id = ONSET_ID[s.cho];
      let note: string | undefined;
      let poseOverride: Record<string, number> | undefined;
      // 변이음: 초성 ㄹ은 탄설[ɾ]. 앞 음절 받침이 ㄹ이면 설측[l](유음화/설측).
      if (s.cho === "ㄹ") {
        const prevCoda = si > 0 ? syls[si - 1].jong : "";
        if (prevCoda === "ㄹ") {
          id = "l";
          note = "설측 [l]";
        } else {
          note = "탄설 [ɾ]";
        }
      }
      // 변이음: ㅅ/ㅆ + ㅣ → 경구개 [ɕ] (혀 앞날을 경구개로 더 올림)
      if ((s.cho === "ㅅ" || s.cho === "ㅆ") && s.jung === "ㅣ") {
        note = "경구개음화 [ɕ]";
        poseOverride = S_PALATAL_POSE;
        notes.add("ㅅ/ㅆ + ㅣ → 경구개 [ɕ]");
      }
      if (id) targets.push({ key: `${si}-onset`, syl: si, role: "onset", jamo: s.cho, phoneId: "c_" + id, note, poseOverride });
    }
    // 중성
    const nId = NUCLEUS_ID[s.jung];
    if (nId) {
      const glide = GLIDE_ONSET[s.jung];
      if (glide) notes.add("활음(반모음) 전이");
      targets.push({ key: `${si}-nucleus`, syl: si, role: "nucleus", jamo: s.jung, phoneId: "v_" + nId, glide });
    }
    // 종성
    if (s.jong) {
      const cId = CODA_ID[s.jong];
      if (cId) {
        const note = cId === "ng" ? "연구개 비음 [ŋ]" : "받침 불파";
        if (cId !== "ng") notes.add("받침은 불파음(파열 없음)");
        targets.push({ key: `${si}-coda`, syl: si, role: "coda", jamo: s.jong, phoneId: "c_" + cId, note });
      }
    }
    return { char: compose(s), targets };
  });

  return {
    input: word,
    pronunciation: syls.map(compose).join(""),
    rules: [...rules],
    notes: [...notes],
    syllables,
  };
}
