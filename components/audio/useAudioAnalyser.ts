"use client";

// 실시간 마이크 → Web Audio AnalyserNode 라이프사이클 공유 훅.
// 프로젝트 전반(SibilantTrainer/PitchMeter 등)에 복붙돼 있던 getUserMedia + AudioContext +
// AnalyserNode 셋업/해제를 한 곳으로. 특징 추출(FFT/시간영역 읽기)은 소비 측 onFrame에서 직접.
//  · 기본 제약: echoCancellation/noiseSuppression/autoGainControl 모두 OFF(조음 분석엔 원음 필요).
//  · onFrame(analyser, ctx): rAF 매 프레임 호출. 소비자가 getFloatFrequencyData /
//    getFloatTimeDomainData 등을 직접 읽어 처리.

import { useCallback, useEffect, useRef, useState } from "react";

export type UseAudioAnalyserOptions = {
  fftSize?: number;
  smoothingTimeConstant?: number;
  constraints?: MediaTrackConstraints;
  onFrame?: (analyser: AnalyserNode, ctx: AudioContext) => void;
};

export type UseAudioAnalyser = {
  isRecording: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  analyserRef: React.RefObject<AnalyserNode | null>;
  audioCtxRef: React.RefObject<AudioContext | null>;
};

const DEFAULT_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

export function useAudioAnalyser(options: UseAudioAnalyserOptions = {}): UseAudioAnalyser {
  const { fftSize = 4096, smoothingTimeConstant = 0.3, constraints, onFrame } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  // onFrame을 ref로 잡아 매 렌더마다 rAF 재등록 없이 최신 콜백 사용.
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    setIsRecording(false);
  }, []);

  const tick = useCallback(() => {
    const a = analyserRef.current;
    const ctx = audioCtxRef.current;
    if (!a || !ctx) return;
    onFrameRef.current?.(a, ctx);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: constraints ?? DEFAULT_CONSTRAINTS,
      });
      streamRef.current = stream;
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const a = ctx.createAnalyser();
      a.fftSize = fftSize;
      a.smoothingTimeConstant = smoothingTimeConstant;
      analyserRef.current = a;
      source.connect(a);
      setIsRecording(true);
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      console.error(err);
      setError("마이크 접근에 실패했습니다.");
    }
  }, [constraints, fftSize, smoothingTimeConstant, tick]);

  useEffect(() => () => stop(), [stop]);

  return { isRecording, error, start, stop, analyserRef, audioCtxRef };
}
