"use client";

// 순간음(파열·파찰) 캡처 리뷰 — 파열음/파찰음은 조음이 0.0x초 순간(버스트/VOT)이라
// 실시간 게이지가 무의미하다. 그래서 아이 산출을 짧게 녹음해서 **다시 들려주는(청각 되들림)**
// 게 핵심. 분석·판정은 하지 않는다(판정은 치료사 ✓/✗의 몫).
//  ⚠️ 녹음은 세션 내 임시 — 저장/전송 없음(사생활). 다시 녹음하면 이전 것은 폐기.

import { useCallback, useEffect, useRef, useState } from "react";

const MAX_MS = 2500; // 단어 하나 길이면 충분 — 자동 정지

const CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

type Status = "idle" | "recording" | "recorded";

export default function CaptureRecorder({ targetWord }: { targetWord: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const cleanupStream = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const stopRec = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const r = recRef.current;
    if (r && r.state !== "inactive") r.stop();
  }, []);

  const startRec = useCallback(async () => {
    setError(null);
    if (url) {
      URL.revokeObjectURL(url);
      setUrl(null);
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: CONSTRAINTS });
      streamRef.current = stream;
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      recRef.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        cleanupStream();
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        setUrl(URL.createObjectURL(blob));
        setStatus("recorded");
      };
      rec.start();
      setStatus("recording");
      timerRef.current = window.setTimeout(stopRec, MAX_MS);
    } catch (err) {
      console.error(err);
      setError("마이크 접근에 실패했습니다. 브라우저 권한을 확인하세요.");
      setStatus("idle");
      cleanupStream();
    }
  }, [url, cleanupStream, stopRec]);

  const play = useCallback(() => {
    if (url) new Audio(url).play().catch(() => undefined);
  }, [url]);

  // 마운트 해제 시 정리(트랙 정지 + objectURL 해제).
  useEffect(
    () => () => {
      cleanupStream();
      if (url) URL.revokeObjectURL(url);
    },
    [cleanupStream, url],
  );

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">
          캡처 — 「{targetWord}」 산출 녹음
        </h3>
        {status === "recording" ? (
          <button
            onClick={stopRec}
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
          >
            ● 정지
          </button>
        ) : (
          <button
            onClick={startRec}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
          >
            {status === "recorded" ? "다시 녹음" : "녹음"}
          </button>
        )}
      </div>

      {error && (
        <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
      )}

      <div className="flex h-16 items-center justify-center rounded-lg bg-slate-50 px-3 text-center">
        {status === "recording" ? (
          <span className="animate-pulse text-sm font-medium text-rose-600">● 녹음 중…</span>
        ) : status === "recorded" ? (
          <span className="text-xs text-slate-500">녹음 완료 — 아이와 함께 들어보세요</span>
        ) : (
          <span className="text-xs text-slate-400">
            아이가 「{targetWord}」를 말하게 하고 녹음하세요
          </span>
        )}
      </div>

      {status === "recorded" && url && (
        <button
          onClick={play}
          className="mt-2 w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          ▶ 재생 — 아이와 함께 들어요
        </button>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        파열·파찰음은 순간음이라 실시간 게이지 대신 <strong>녹음→재생</strong>으로 되들려줍니다. 아이가
        낸 소리를 다시 들려주고(「{targetWord}」로 들리는지) 목표 조음과 비교해 보세요. 녹음은 세션 내
        임시이며 저장·전송되지 않습니다.
      </p>
    </div>
  );
}
