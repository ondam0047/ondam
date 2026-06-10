"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Web Speech API (SpeechRecognition) 기반 한국어 실시간 전사 훅.
 *
 *  - Chrome / Edge / 최신 Safari 에서만 동작 (브라우저 의존)
 *  - 인터넷 연결 필요 (대부분 브라우저가 클라우드 ASR 사용)
 *  - 마이크 권한 필요 (별도 getUserMedia 호출과 공존 가능)
 *  - 음성 인식 엔진이 침묵·잡음 시 자동 종료할 수 있어 onend 에서 재시작
 *
 * 사용: `const { supported, start, stop, finalTranscript, interim } = useKoreanASR();`
 */

type RecognitionAlt = { transcript: string };
type RecognitionResult = {
  isFinal: boolean;
  0: RecognitionAlt;
  length: number;
};
type RecognitionEvent = {
  resultIndex: number;
  results: {
    length: number;
    [k: number]: RecognitionResult;
  };
};

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useKoreanASR(opts?: { lang?: string }) {
  const lang = opts?.lang ?? "ko-KR";
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);
  const [finalTranscript, setFinalTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldRunRef = useRef(false);
  const finalRef = useRef("");

  useEffect(() => {
    setSupported(getRecognitionCtor() !== null);
  }, []);

  const buildRecognition = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return null;
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      let interimTxt = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const txt = res[0]?.transcript ?? "";
        if (res.isFinal) {
          finalRef.current += (finalRef.current ? " " : "") + txt.trim();
        } else {
          interimTxt += txt;
        }
      }
      setFinalTranscript(finalRef.current);
      setInterim(interimTxt);
    };

    rec.onerror = (ev) => {
      // 'no-speech', 'aborted' 등은 자동 재시작 흐름에서 무시
      if (ev.error && ev.error !== "no-speech" && ev.error !== "aborted") {
        setError(ev.error);
      }
    };

    rec.onend = () => {
      // 자동 종료 시 사용자 의도가 계속 실행이면 재시작
      if (shouldRunRef.current) {
        try {
          rec.start();
        } catch {
          // 이미 시작된 상태 등 — 무시
        }
      } else {
        setActive(false);
      }
    };

    rec.onstart = () => setActive(true);
    return rec;
  }, [lang]);

  const start = useCallback(() => {
    setError(null);
    setFinalTranscript("");
    setInterim("");
    finalRef.current = "";
    shouldRunRef.current = true;
    const rec = buildRecognition();
    if (!rec) {
      setError("이 브라우저에서 음성 인식을 지원하지 않습니다 (Chrome/Edge 권장).");
      return;
    }
    recRef.current = rec;
    try {
      rec.start();
    } catch (e) {
      setError(e instanceof Error ? e.message : "시작 실패");
    }
  }, [buildRecognition]);

  const stop = useCallback(() => {
    shouldRunRef.current = false;
    const rec = recRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {
        // 무시
      }
    }
    setActive(false);
  }, []);

  const reset = useCallback(() => {
    shouldRunRef.current = false;
    const rec = recRef.current;
    if (rec) {
      try {
        rec.abort();
      } catch {
        // 무시
      }
    }
    finalRef.current = "";
    setFinalTranscript("");
    setInterim("");
    setActive(false);
    setError(null);
  }, []);

  useEffect(() => () => {
    shouldRunRef.current = false;
    const rec = recRef.current;
    if (rec) {
      try {
        rec.abort();
      } catch {
        // 무시
      }
    }
  }, []);

  return { supported, active, finalTranscript, interim, error, start, stop, reset };
}
