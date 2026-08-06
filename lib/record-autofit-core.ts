// 자동 글자축소의 순수 계산부 — hwpx(record-autofit.ts)·hwp(record-hwp.ts) 어댑터 공용.
// 단위: HWPUNIT = 1/7200 inch, 글자크기 1/100pt = 1 HWPUNIT (두 포맷 완전 동일).

export const SAFETY_LINES = 0.5;
export const MIN_FONT_HEIGHT = 450; // 4.5pt
export const TIGHT_LINE_SPACING = 110; // %

// 텍스트의 표시 폭(한글·전각 1.0, 그 외 0.55)을 글자 수 환산값으로 추정.
export function displayUnits(text: string): number {
  let u = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    const wide =
      (code >= 0x1100 && code <= 0x11ff) ||
      (code >= 0x3000 && code <= 0x303f) ||
      (code >= 0x3130 && code <= 0x318f) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0xff00 && code <= 0xffef);
    u += wide ? 1 : 0.55;
  }
  return u;
}

// 글자 폭 charWidth(≈ fontHeight) 에서, 가용 폭 textWidth 안에 paraText 가 차지할 줄 수.
export function estimateLines(paraText: string, textWidth: number, charWidth: number): number {
  if (textWidth <= 0 || charWidth <= 0) return 1;
  const perLine = Math.max(1, Math.floor(textWidth / charWidth));
  let lines = 0;
  for (const seg of paraText.split(/\r?\n/)) {
    lines += Math.max(1, Math.ceil(displayUnits(seg) / perLine));
  }
  return Math.max(1, lines);
}

// 칸(usableHeight×textWidth)에 텍스트가 들어가는 가장 큰 글자 크기.
// baseFont 상한, minFont 하한, 50단위 하향 탐색. spacingPct = 실제 쓸 줄간격 %.
export function chooseFontHeight(args: {
  text: string;
  textWidth: number;
  usableHeight: number;
  baseFont: number;
  spacingPct: number;
  minFont?: number;
}): number {
  const { text, textWidth, usableHeight, baseFont, spacingPct } = args;
  const minFont = args.minFont ?? MIN_FONT_HEIGHT;
  const fits = (font: number): boolean => {
    const pitch = Math.round((font * spacingPct) / 100);
    const cap = Math.max(1, Math.floor(usableHeight / pitch));
    const need = estimateLines(text, textWidth, font) + SAFETY_LINES;
    return need <= cap;
  };
  if (fits(baseFont)) return baseFont;
  let chosen = minFont;
  for (let f = baseFont - 50; f >= minFont; f -= 50) {
    chosen = f;
    if (fits(f)) break;
  }
  return chosen;
}
