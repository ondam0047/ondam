// 스펙트럼 모멘트 계산 — 마찰음(/s/ vs /ʃ/) 변별용.
// 근거: Jongman, Wayland & Wong (2000) JASA;
//   /s/ 스펙트럼 중심 ≈6–8 kHz, /ʃ/ ≈3–4 kHz (성인).
//   아동은 성도가 작아 전반적으로 조금 더 높은 구간으로 이동.
export type SpectralAnalysis = {
  centroid: number;
  hfEnergy: number;
  lfEnergy: number;
  hfRatio: number;
  isFricative: boolean;
};

export function analyzeSibilantSpectrum(
  freqData: Float32Array,
  sampleRate: number,
  options?: {
    hfLow?: number; hfHigh?: number; lfLow?: number; lfHigh?: number;
    minEnergy?: number; fricativeHfRatio?: number;
  },
): SpectralAnalysis {
  const nBins = freqData.length;
  const binWidth = sampleRate / 2 / nBins;
  const hfLow = options?.hfLow ?? 2000;
  const hfHigh = options?.hfHigh ?? 12000;
  const lfLow = options?.lfLow ?? 100;
  const lfHigh = options?.lfHigh ?? 1000;
  const minEnergy = options?.minEnergy ?? 0.005;
  const fricativeHfRatio = options?.fricativeHfRatio ?? 0.55;

  let weightedSum = 0;
  let hfEnergy = 0;
  let lfEnergy = 0;

  for (let i = 0; i < nBins; i++) {
    const f = (i + 0.5) * binWidth;
    const db = freqData[i];
    if (!isFinite(db) || db < -110) continue;
    const mag = Math.pow(10, db / 20);
    if (f >= hfLow && f <= hfHigh) {
      weightedSum += f * mag;
      hfEnergy += mag;
    } else if (f >= lfLow && f <= lfHigh) {
      lfEnergy += mag;
    }
  }

  const total = hfEnergy + lfEnergy;
  const hfRatio = total > 0 ? hfEnergy / total : 0;
  const centroid = hfEnergy > 0 ? weightedSum / hfEnergy : 0;
  const isFricative = hfEnergy > minEnergy && hfRatio > fricativeHfRatio;
  return { centroid, hfEnergy, lfEnergy, hfRatio, isFricative };
}
