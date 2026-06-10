// YIN 알고리즘 (de Cheveigné & Kawahara 2002) 단축 구현.
// 시간영역 버퍼에서 기본주파수(F0) 추정. 반환 -1 이면 신뢰 피치 없음.
export function yinPitch(
  buffer: Float32Array,
  sampleRate: number,
  threshold = 0.1,
): number {
  const N = buffer.length;
  const halfN = Math.floor(N / 2);
  const diff = new Float32Array(halfN);

  // Step 1: difference function d_t(tau)
  for (let tau = 0; tau < halfN; tau++) {
    let sum = 0;
    for (let i = 0; i < halfN; i++) {
      const delta = buffer[i] - buffer[i + tau];
      sum += delta * delta;
    }
    diff[tau] = sum;
  }

  // Step 2: cumulative mean normalized difference
  const cmnd = new Float32Array(halfN);
  cmnd[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < halfN; tau++) {
    runningSum += diff[tau];
    cmnd[tau] = runningSum === 0 ? 1 : (diff[tau] * tau) / runningSum;
  }

  // Step 3: absolute threshold — 최소값을 가지는 첫 tau
  let tauEstimate = -1;
  for (let tau = 2; tau < halfN; tau++) {
    if (cmnd[tau] < threshold) {
      while (tau + 1 < halfN && cmnd[tau + 1] < cmnd[tau]) {
        tau++;
      }
      tauEstimate = tau;
      break;
    }
  }
  if (tauEstimate === -1) return -1;

  // Step 4: parabolic interpolation 으로 sub-sample 정밀화
  const x0 = tauEstimate > 0 ? tauEstimate - 1 : tauEstimate;
  const x2 = tauEstimate + 1 < halfN ? tauEstimate + 1 : tauEstimate;
  let betterTau: number;
  if (x0 === tauEstimate) {
    betterTau = cmnd[tauEstimate] <= cmnd[x2] ? tauEstimate : x2;
  } else if (x2 === tauEstimate) {
    betterTau = cmnd[tauEstimate] <= cmnd[x0] ? tauEstimate : x0;
  } else {
    const s0 = cmnd[x0];
    const s1 = cmnd[tauEstimate];
    const s2 = cmnd[x2];
    const denom = 2 * (2 * s1 - s2 - s0);
    betterTau = denom === 0 ? tauEstimate : tauEstimate + (s2 - s0) / denom;
  }

  return sampleRate / betterTau;
}
