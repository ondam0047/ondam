// 음도(F0) 추정 — 자기상관(autocorrelation) 방식. 브라우저 전용.
// AnalyserNode.getFloatTimeDomainData 로 받은 시간영역 버퍼를 입력.

// 반환: 추정 주파수(Hz), 무성/잡음이면 -1.
export function autoCorrelate(buf: Float32Array, sampleRate: number): number {
  const SIZE = buf.length;

  // 신호 세기(RMS)가 너무 작으면 음성 없음으로 간주.
  let rms = 0;
  for (let i = 0; i < SIZE; i++) {
    const v = buf[i];
    rms += v * v;
  }
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1;

  // 양 끝의 저진폭 구간을 잘라내 안정성 향상.
  let r1 = 0;
  let r2 = SIZE - 1;
  const thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buf[i]) < thres) { r1 = i; break; }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
  }

  const trimmed = buf.subarray(r1, r2);
  const n = trimmed.length;
  if (n < 2) return -1;

  // 자기상관 함수.
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < n - i; j++) {
      sum += trimmed[j] * trimmed[j + i];
    }
    c[i] = sum;
  }

  // 첫 골을 지난 뒤의 최대 피크 = 기본 주기.
  let d = 0;
  while (d < n - 1 && c[d] > c[d + 1]) d++;
  let maxval = -1;
  let maxpos = -1;
  for (let i = d; i < n; i++) {
    if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
  }
  if (maxpos <= 0) return -1;

  // 포물선 보간으로 피크 위치 정밀화.
  let T0 = maxpos;
  const x1 = c[T0 - 1];
  const x2 = c[T0];
  const x3 = c[T0 + 1] ?? x2;
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a) T0 = T0 - b / (2 * a);

  const freq = sampleRate / T0;
  // 사람 음성 범위 밖이면 버림.
  if (freq < 50 || freq > 1500) return -1;
  return freq;
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// 주파수 → 음이름(예: A3). A4=440 기준.
export function freqToNote(freq: number): string {
  if (freq <= 0) return "—";
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}
