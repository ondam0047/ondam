// 마이크 입력 + Web Audio 공용 헬퍼 (바로툴 음성 모듈 공용)
// 모두 브라우저 전용 — "use client" 컴포넌트에서만 import.

export type MicHandle = {
  stream: MediaStream;
  ctx: AudioContext;
  analyser: AnalyserNode;
  source: MediaStreamAudioSourceNode;
  close: () => void;
};

// 마이크 권한 요청 + AnalyserNode 연결.
// 음도·강도 정확도를 위해 브라우저의 자동 보정(에코제거·잡음억제·자동게인)을 끔.
export async function openMic(fftSize = 2048): Promise<MicHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
  const Ctx: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  // 자동재생 정책으로 suspended 상태일 수 있어 명시적으로 재개.
  if (ctx.state === "suspended") {
    try { await ctx.resume(); } catch { /* noop */ }
  }
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = fftSize;
  analyser.smoothingTimeConstant = 0.8;
  source.connect(analyser);

  const close = () => {
    try { source.disconnect(); } catch { /* noop */ }
    try { stream.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
    try { void ctx.close(); } catch { /* noop */ }
  };

  return { stream, ctx, analyser, source, close };
}

// 시간영역 데이터(Float32, -1~1)의 RMS(실효값) 0~1.
export function rmsOf(timeDomain: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < timeDomain.length; i++) {
    const v = timeDomain[i];
    sum += v * v;
  }
  return Math.sqrt(sum / timeDomain.length);
}

// RMS → 0~100 강도 레벨 (VoiceLab 기준 배율 300, 상한 100).
export function rmsToLevel(rms: number): number {
  return Math.min(100, Math.round(rms * 300));
}

// 마이크가 지원되는 환경인지.
export function micSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}
