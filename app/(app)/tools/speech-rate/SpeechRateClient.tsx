"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useKoreanASR } from "@/lib/voice/useKoreanASR";
import { decodeAudioFile } from "@/lib/voice/audioFile";
import { downloadReport } from "@/lib/voice/report";
import ToolMonitor from "../ToolMonitor";

// ───────────────────────── 말속도 분석 (VAD 기반 쉼 자동 분할) ─────────────────────────
type Segment = {
  start: number;
  end: number;
  type: "speech" | "pause";
};

type SpeechRateResult = {
  totalDuration: number;
  speechDuration: number;
  pauseDuration: number;
  segments: Segment[];
  pauseCount: number;
  longPauseCount: number;
  meanPauseDuration: number;
  maxPauseDuration: number;
};

function analyzeSpeechRate(
  signal: Float32Array,
  sampleRate: number,
  options?: {
    threshold?: number;
    minPauseMs?: number;
    longPauseMs?: number;
    trimEnds?: boolean;
  },
): SpeechRateResult {
  const minPauseMs = options?.minPauseMs ?? 100;
  const longPauseMs = options?.longPauseMs ?? 250;
  // trimEnds=false 면 선행/후행 침묵을 제거하지 않음(사용자가 구간을 직접 지정한 경우).
  const trimEnds = options?.trimEnds ?? true;

  const frameSize = Math.round(sampleRate * 0.025);
  const hopSize = Math.round(sampleRate * 0.01);

  // 1차: 프레임별 RMS
  const frameTimes: number[] = [];
  const rmsArr: number[] = [];
  for (let start = 0; start + frameSize <= signal.length; start += hopSize) {
    let sumSq = 0;
    for (let i = 0; i < frameSize; i++) {
      const s = signal[start + i];
      sumSq += s * s;
    }
    frameTimes.push(start / sampleRate);
    rmsArr.push(Math.sqrt(sumSq / frameSize));
  }

  // 적응형 임계: 녹음 레벨이 작아도 쉼/발화를 구분하도록 잡음바닥+여유로 자동 설정.
  // (고정 임계 0.012 는 소리가 작은 녹음에서 전부 '쉼'으로 잡혀 조음속도가 0이 되는 문제가 있었음)
  let threshold = options?.threshold;
  if (threshold == null) {
    const sorted = [...rmsArr].sort((a, b) => a - b);
    const pct = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0);
    const noise = pct(0.15);
    const peak = pct(0.95);
    threshold = Math.max(0.006, noise + 0.12 * Math.max(0, peak - noise));
  }
  const isVoiced: boolean[] = rmsArr.map((r) => r > (threshold as number));

  if (isVoiced.length === 0) {
    return {
      totalDuration: signal.length / sampleRate,
      speechDuration: 0,
      pauseDuration: 0,
      segments: [],
      pauseCount: 0,
      longPauseCount: 0,
      meanPauseDuration: 0,
      maxPauseDuration: 0,
    };
  }

  // 프레임 상태 변화 기반 초기 분할
  const raw: Segment[] = [];
  let curType: "speech" | "pause" = isVoiced[0] ? "speech" : "pause";
  let curStartIdx = 0;
  for (let i = 1; i < isVoiced.length; i++) {
    const t = isVoiced[i] ? "speech" : "pause";
    if (t !== curType) {
      raw.push({
        start: frameTimes[curStartIdx],
        end: frameTimes[i],
        type: curType,
      });
      curType = t;
      curStartIdx = i;
    }
  }
  raw.push({
    start: frameTimes[curStartIdx],
    end: signal.length / sampleRate,
    type: curType,
  });

  // 짧은 쉼(<minPauseMs)을 주변 발화로 병합
  const filtered: Segment[] = [];
  for (const seg of raw) {
    const durMs = (seg.end - seg.start) * 1000;
    if (
      seg.type === "pause" &&
      durMs < minPauseMs &&
      filtered.length > 0 &&
      filtered[filtered.length - 1].type === "speech"
    ) {
      filtered[filtered.length - 1].end = seg.end;
    } else if (
      filtered.length > 0 &&
      filtered[filtered.length - 1].type === seg.type
    ) {
      filtered[filtered.length - 1].end = seg.end;
    } else {
      filtered.push({ ...seg });
    }
  }

  // 선행/후행 쉼(첫 발화 전·마지막 발화 후 침묵) 제거 (trimEnds 일 때만)
  if (trimEnds) {
    while (filtered.length > 0 && filtered[0].type === "pause") filtered.shift();
    while (
      filtered.length > 0 &&
      filtered[filtered.length - 1].type === "pause"
    )
      filtered.pop();
  }

  const speechSegs = filtered.filter((s) => s.type === "speech");
  const pauseSegs = filtered.filter((s) => s.type === "pause");

  const totalDuration =
    filtered.length > 0
      ? filtered[filtered.length - 1].end - filtered[0].start
      : 0;
  const speechDuration = speechSegs.reduce((s, x) => s + (x.end - x.start), 0);
  const pauseDuration = pauseSegs.reduce((s, x) => s + (x.end - x.start), 0);
  const longPauseCount = pauseSegs.filter(
    (x) => (x.end - x.start) * 1000 >= longPauseMs,
  ).length;
  const meanPauseDuration =
    pauseSegs.length > 0 ? pauseDuration / pauseSegs.length : 0;
  const maxPauseDuration =
    pauseSegs.length > 0
      ? Math.max(...pauseSegs.map((x) => x.end - x.start))
      : 0;

  return {
    totalDuration,
    speechDuration,
    pauseDuration,
    segments: filtered,
    pauseCount: pauseSegs.length,
    longPauseCount,
    meanPauseDuration,
    maxPauseDuration,
  };
}

// ───────────────────────── 음절 수 추정 (한글·자모·숫자·영어 모음군) ─────────────────────────
const HANGUL_SYLLABLE = /[가-힣]/g;
const HANGUL_JAMO = /[ㄱ-ㅎㅏ-ㅣ]/g;
const DIGITS = /[0-9]/g;
const ENGLISH_WORD = /[a-zA-Z]+/g;

function countEnglishSyllables(word: string): number {
  const w = word.toLowerCase();
  if (w.length === 0) return 0;
  const groups = w.match(/[aeiouy]+/g) ?? [];
  let count = groups.length;
  if (count > 1 && /e$/.test(w)) count -= 1;
  return Math.max(1, count);
}

function countSyllables(text: string): number {
  if (!text) return 0;
  const hangulCount = (text.match(HANGUL_SYLLABLE) ?? []).length;
  const jamoCount = (text.match(HANGUL_JAMO) ?? []).length;
  const digitCount = (text.match(DIGITS) ?? []).length;
  let englishCount = 0;
  const words = text.match(ENGLISH_WORD) ?? [];
  for (const w of words) englishCount += countEnglishSyllables(w);
  return hangulCount + jamoCount + digitCount + englishCount;
}

function normalizeTranscript(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// ───────────────────────── 파형 피크 추출 ─────────────────────────
function computePeaks(data: Float32Array, buckets: number): number[] {
  const out = new Array(buckets).fill(0);
  const size = Math.floor(data.length / buckets) || 1;
  for (let i = 0; i < buckets; i++) {
    let max = 0;
    const start = i * size;
    const end = Math.min(data.length, start + size);
    for (let j = start; j < end; j++) {
      const a = Math.abs(data[j]);
      if (a > max) max = a;
    }
    out[i] = max;
  }
  const peak = Math.max(...out, 1e-6);
  return out.map((v) => v / peak);
}

type Phase = "idle" | "recording" | "done";
const DURATION_OPTIONS = [10, 15, 30, 60] as const;
type Duration = (typeof DURATION_OPTIONS)[number];

// 인라인 스타일 토큰 헬퍼
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  fontSize: 14,
  color: "var(--text)",
};
const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 8,
  fontSize: 13,
  fontWeight: 600,
  color: "var(--text-soft)",
};

export default function SpeechRateClient() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [maxDuration, setMaxDuration] = useState<Duration>(15);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<SpeechRateResult | null>(null);
  const [syllables, setSyllables] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editedTranscript, setEditedTranscript] = useState<string>("");
  const [autoFilled, setAutoFilled] = useState(false);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [rawDuration, setRawDuration] = useState(0);
  // 사용자가 파형에서 드래그로 정하는 분석 구간(초)
  const [selStart, setSelStart] = useState(0);
  const [selEnd, setSelEnd] = useState(0);
  // 파형 색칠용 전체 신호 세그먼트(선택과 무관)
  const [fullSegments, setFullSegments] = useState<Segment[]>([]);
  const [subj, setSubj] = useState<{ subject: string | null; clinician: string; chartSvg?: string }>({ subject: null, clinician: "" });

  const asr = useKoreanASR();

  // 분석에 사용할 원본 신호(녹음 또는 파일) 보관 — 구간 변경 시 재분석.
  const signalRef = useRef<Float32Array | null>(null);
  const srRef = useRef<number>(44100);

  // 선택 구간만 다시 듣기용 재생 컨텍스트
  const [playingSel, setPlayingSel] = useState(false);
  const playCtxRef = useRef<AudioContext | null>(null);
  const playSrcRef = useRef<AudioBufferSourceNode | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const recordedRef = useRef<Float32Array[]>([]);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);

  const cleanup = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
  }, []);

  // 선택 구간(초)으로 재분석. trimEnds=false → 선택 길이 = 전체 시간.
  const recompute = useCallback((startSec: number, endSec: number) => {
    const sig = signalRef.current;
    const sr = srRef.current;
    if (!sig) return;
    const a = Math.max(0, Math.floor(startSec * sr));
    const b = Math.min(sig.length, Math.floor(endSec * sr));
    if (b - a < sr * 0.2) return; // 최소 0.2초
    setResult(analyzeSpeechRate(sig.subarray(a, b), sr, { trimEnds: false }));
  }, []);

  // 선택 구간 재생 정지
  const stopSelection = useCallback(() => {
    if (playSrcRef.current) {
      try { playSrcRef.current.onended = null; playSrcRef.current.stop(); } catch { /* noop */ }
      try { playSrcRef.current.disconnect(); } catch { /* noop */ }
      playSrcRef.current = null;
    }
    if (playCtxRef.current) {
      playCtxRef.current.close().catch(() => undefined);
      playCtxRef.current = null;
    }
    setPlayingSel(false);
  }, []);

  // 파형에서 정한 [selStart, selEnd] 구간만 다시 듣기
  const playSelection = useCallback((startSec: number, endSec: number) => {
    const sig = signalRef.current;
    const sr = srRef.current;
    if (!sig) return;
    stopSelection();
    const a = Math.max(0, Math.floor(startSec * sr));
    const b = Math.min(sig.length, Math.floor(endSec * sr));
    if (b - a < sr * 0.05) return;
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      playCtxRef.current = ctx;
      const buf = ctx.createBuffer(1, b - a, sr);
      buf.getChannelData(0).set(sig.subarray(a, b));
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.onended = () => stopSelection();
      playSrcRef.current = src;
      src.start();
      setPlayingSel(true);
    } catch (err) {
      console.error(err);
      stopSelection();
    }
  }, [stopSelection]);

  // 녹음/파일 신호로 파형·기본 선택구간·초기 분석 세팅.
  const setupFromSignal = useCallback((combined: Float32Array, sr: number) => {
    signalRef.current = combined;
    srRef.current = sr;
    const dur = combined.length / sr;
    setPeaks(computePeaks(combined, 800));
    setRawDuration(dur);
    // 파형 색칠용: 전체 신호를 트리밍 없이 분석한 세그먼트
    setFullSegments(analyzeSpeechRate(combined, sr, { trimEnds: false }).segments);
    // 기본 선택구간 = VAD 감지 발화 구간(앞뒤 침묵 제외), 없으면 전체
    const trimmed = analyzeSpeechRate(combined, sr);
    let s0 = 0;
    let e0 = dur;
    if (trimmed.segments.length > 0) {
      s0 = trimmed.segments[0].start;
      e0 = trimmed.segments[trimmed.segments.length - 1].end;
    }
    setSelStart(s0);
    setSelEnd(e0);
    const a = Math.max(0, Math.floor(s0 * sr));
    const b = Math.min(combined.length, Math.floor(e0 * sr));
    setResult(analyzeSpeechRate(combined.subarray(a, b), sr, { trimEnds: false }));
  }, []);

  const finalizeAndAnalyze = useCallback(() => {
    if (processorRef.current) processorRef.current.disconnect();
    if (sourceRef.current) sourceRef.current.disconnect();

    const totalLen = recordedRef.current.reduce((s, b) => s + b.length, 0);
    const combined = new Float32Array(totalLen);
    let offset = 0;
    for (const b of recordedRef.current) {
      combined.set(b, offset);
      offset += b.length;
    }
    const sr = audioCtxRef.current?.sampleRate ?? 44100;
    setupFromSignal(combined, sr);
    setPhase("done");
    asr.stop();
    cleanup();
  }, [cleanup, asr, setupFromSignal]);

  const start = useCallback(async () => {
    setErrorMsg(null);
    setElapsed(0);
    setResult(null);
    setEditedTranscript("");
    setAutoFilled(false);
    setSyllables("");
    setPhase("recording");
    recordedRef.current = [];
    if (asr.supported) asr.start();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      // 자동재생 정책으로 suspended 면 onaudioprocess 가 안 울려 녹음이 비게 됨 → 명시적 재개
      if (ctx.state === "suspended") {
        try { await ctx.resume(); } catch { /* noop */ }
      }
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      proc.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const copy = new Float32Array(input.length);
        copy.set(input);
        recordedRef.current.push(copy);
      };
      processorRef.current = proc;
      source.connect(proc);
      proc.connect(ctx.destination);
      startTimeRef.current = performance.now();

      const tick = () => {
        const e = (performance.now() - startTimeRef.current) / 1000;
        setElapsed(e);
        if (e >= maxDuration) {
          finalizeAndAnalyze();
        } else {
          rafRef.current = requestAnimationFrame(tick);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      console.error(err);
      setErrorMsg("마이크 접근 실패");
      setPhase("idle");
      asr.stop();
      cleanup();
    }
  }, [maxDuration, finalizeAndAnalyze, cleanup, asr]);

  const analyzeFile = useCallback(async (file: File) => {
    setErrorMsg(null);
    setResult(null);
    setEditedTranscript("");
    setSyllables("");
    setAutoFilled(true); // 파일 업로드 시 ASR 자동채움 비활성 (전사 직접 입력)
    try {
      const { data, sampleRate } = await decodeAudioFile(file);
      setupFromSignal(data, sampleRate);
      setPhase("done");
    } catch (err) {
      console.error(err);
      setErrorMsg("오디오 파일을 분석할 수 없습니다. 다른 파일을 시도하세요.");
      setPhase("idle");
    }
  }, [setupFromSignal]);

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (file) analyzeFile(file);
    },
    [analyzeFile],
  );

  const stopEarly = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    finalizeAndAnalyze();
  }, [finalizeAndAnalyze]);

  const reset = useCallback(() => {
    stopSelection();
    setResult(null);
    setSyllables("");
    setEditedTranscript("");
    setAutoFilled(false);
    setPhase("idle");
    setElapsed(0);
    setPeaks([]);
    setRawDuration(0);
    setSelStart(0);
    setSelEnd(0);
    setFullSegments([]);
    signalRef.current = null;
    asr.reset();
  }, [asr, stopSelection]);

  // 녹음이 끝났을 때 ASR 전사로부터 음절 수 자동 산출.
  useEffect(() => {
    if (phase !== "done") return;
    if (!asr.supported) return;
    const finalText = normalizeTranscript(asr.finalTranscript);
    if (autoFilled || !finalText) return;
    setEditedTranscript(finalText);
    setSyllables(String(countSyllables(finalText)));
    setAutoFilled(true);
  }, [phase, asr.finalTranscript, asr.supported, autoFilled]);

  const recountFromEdited = useCallback(() => {
    setSyllables(String(countSyllables(editedTranscript)));
  }, [editedTranscript]);

  useEffect(() => () => cleanup(), [cleanup]);
  useEffect(() => () => stopSelection(), [stopSelection]);

  const syllablesNum = parseInt(syllables, 10);
  const validSyllables = !isNaN(syllablesNum) && syllablesNum > 0;

  const overallSPS =
    result && validSyllables ? syllablesNum / result.totalDuration : 0;
  const articulationSPS =
    result && validSyllables && result.speechDuration > 0
      ? syllablesNum / result.speechDuration
      : 0;
  const overallWPM = (overallSPS * 60) / 2.5; // 음절·단어 대략 2.5음절 기준

  const downloadSrReport = () => {
    if (!result) return;
    const rateRows = validSyllables
      ? [
          { label: "음절 수", value: `${syllablesNum} 개` },
          {
            label: "전체 말속도",
            value: `${overallSPS.toFixed(2)} SPS`,
            ref: `≈ ${overallWPM.toFixed(0)} WPM`,
          },
          {
            label: "조음속도 (쉼 제외)",
            value: `${articulationSPS.toFixed(2)} SPS`,
          },
        ]
      : [{ label: "음절 수", value: "(미입력 — 말속도 계산 불가)" }];
    downloadReport(
      {
        title: "말속도 측정 리포트",
        subtitle: `전체 ${result.totalDuration.toFixed(2)}초 · 발화 ${result.speechDuration.toFixed(2)}초`,
        meta: { subject: subj.subject ?? undefined, clinician: subj.clinician || undefined },
      chartSvg: subj.chartSvg,
        sections: [
          {
            heading: "시간 · 쉼 구간",
            rows: [
              {
                label: "전체 시간",
                value: `${result.totalDuration.toFixed(2)} 초`,
              },
              {
                label: "순 발화 시간",
                value: `${result.speechDuration.toFixed(2)} 초`,
                ref: `${((result.speechDuration / result.totalDuration) * 100).toFixed(0)}%`,
              },
              {
                label: "쉼 구간 수",
                value: `${result.pauseCount} 회`,
                ref: `장쉼(≥250ms) ${result.longPauseCount}회`,
              },
              {
                label: "평균 쉼 길이",
                value: `${(result.meanPauseDuration * 1000).toFixed(0)} ms`,
                ref: `최대 ${(result.maxPauseDuration * 1000).toFixed(0)} ms`,
              },
            ],
          },
          { heading: "말속도", rows: rateRows },
          ...(editedTranscript.trim()
            ? [
                {
                  heading: "전사",
                  rows: [{ label: "내용", value: editedTranscript.trim() }],
                },
              ]
            : []),
        ],
        footnote:
          "참고 범위: 낭독 4.5–6.0 SPS / 자유발화 3.5–5.0 SPS. VAD 임계 기반 쉼 자동 분할. 본 수치는 학습·연습·시각화 보조용 추정치입니다.",
      },
      "speech_rate",
    );
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {errorMsg && (
        <div
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            fontSize: 14,
            background: "#F6E4DE",
            color: "#8A2F1C",
            border: "1px solid #E6C3B8",
          }}
        >
          {errorMsg}
        </div>
      )}

      <div className="card">
        <div className="card-body" style={{ display: "grid", gap: 18 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 800,
                color: "var(--text)",
              }}
            >
              녹음
            </h2>
            <span
              className="badge"
              style={{
                fontSize: 12,
                padding: "5px 12px",
                borderColor: "transparent",
                ...(phase === "idle"
                  ? { background: "var(--surface-2)", color: "var(--text-soft)" }
                  : phase === "recording"
                    ? { background: "#F4E4C8", color: "#8A6422" }
                    : { background: "var(--primary-soft)", color: "var(--primary)" }),
              }}
            >
              {phase === "idle" && "대기"}
              {phase === "recording" && "● 녹음 중"}
              {phase === "done" && "✓ 완료"}
            </span>
          </div>

          {phase === "idle" && (
            <div style={{ display: "grid", gap: 16 }}>
              <div>
                <label style={labelStyle}>최대 녹음 시간</label>
                <div
                  style={{
                    display: "flex",
                    overflow: "hidden",
                    borderRadius: 10,
                    border: "1px solid var(--border-strong)",
                  }}
                >
                  {DURATION_OPTIONS.map((d) => (
                    <button
                      key={d}
                      onClick={() => setMaxDuration(d)}
                      style={{
                        flex: 1,
                        padding: "8px 12px",
                        fontSize: 14,
                        fontWeight: 600,
                        border: "none",
                        cursor: "pointer",
                        ...(d === maxDuration
                          ? { background: "var(--primary)", color: "var(--primary-ink)" }
                          : { background: "var(--surface)", color: "var(--text-soft)" }),
                      }}
                    >
                      {d}초
                    </button>
                  ))}
                </div>
              </div>
              <button
                className="btn btn-primary"
                onClick={start}
                style={{ width: "100%", padding: "14px 24px", fontSize: 17 }}
              >
                녹음 시작
              </button>
              <label
                style={{
                  display: "flex",
                  cursor: "pointer",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  borderRadius: 12,
                  border: "2px dashed var(--border-strong)",
                  background: "var(--surface-2)",
                  padding: "12px 24px",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--text-soft)",
                }}
              >
                📁 또는 녹음 파일 업로드
                <input
                  type="file"
                  accept="audio/*"
                  onChange={onFileChange}
                  style={{ display: "none" }}
                />
              </label>
              <p
                style={{
                  fontSize: 12,
                  color: "var(--text-mute)",
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                &quot;녹음 시작&quot; 후 대상자에게 낭독·자유발화를 요청하세요
                (설정 시간에 자동 종료, 조기 종료 가능). 또는 미리 녹음한 파일을
                업로드하면 VAD 로 쉼을 자동 분할합니다. 파일 업로드 시 음절 수는
                전사를 붙여넣거나 직접 입력하세요.
              </p>
            </div>
          )}

          {phase === "recording" && (
            <div style={{ display: "grid", gap: 16 }}>
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontSize: 60,
                    fontWeight: 800,
                    fontVariantNumeric: "tabular-nums",
                    color: "var(--text)",
                    lineHeight: 1.1,
                  }}
                >
                  {elapsed.toFixed(1)}
                </div>
                <div
                  style={{ marginTop: 4, fontSize: 14, color: "var(--text-mute)" }}
                >
                  / {maxDuration}초
                </div>
              </div>
              <div
                style={{
                  height: 12,
                  overflow: "hidden",
                  borderRadius: 999,
                  background: "var(--surface-2)",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    background: "var(--primary)",
                    transition: "all 0.1s",
                    width: `${(elapsed / maxDuration) * 100}%`,
                  }}
                />
              </div>
              {asr.supported && (
                <div
                  style={{
                    borderRadius: 10,
                    border: "1px solid #E8D097",
                    background: "#F4E4C8",
                    padding: 12,
                  }}
                >
                  <p
                    style={{
                      margin: "0 0 4px",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#8A6422",
                    }}
                  >
                    실시간 전사 {asr.active ? "● 인식 중" : "대기"}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      minHeight: "1.5rem",
                      fontSize: 14,
                      color: "var(--text)",
                    }}
                  >
                    <span>{asr.finalTranscript}</span>
                    <span style={{ color: "var(--text-mute)" }}>
                      {" "}
                      {asr.interim}
                    </span>
                  </p>
                </div>
              )}
              <button
                className="btn"
                onClick={stopEarly}
                style={{ width: "100%", padding: "12px 24px", fontSize: 14 }}
              >
                조기 종료 + 분석
              </button>
            </div>
          )}

          {phase === "done" && result && (
            <div style={{ display: "grid", gap: 16 }}>
              <p style={{ margin: 0, fontSize: 14, color: "var(--primary)" }}>
                ✓ 녹음 완료 · 자동 분석 결과
              </p>

              {/* 파형 + 발화/쉼 오버레이 */}
              <div
                style={{
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  padding: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, margin: "0 0 8px", flexWrap: "wrap" }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--text-soft)" }}>
                    파형 · 양끝 손잡이를 끌거나 Shift+드래그로 분석 구간을 정하세요 (초록 = 발화, 회색 = 쉼)
                  </p>
                  <span style={{ fontSize: 12, color: "var(--text-mute)", display: "inline-flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                    분석 구간 <b style={{ color: "var(--text)" }}>{(selEnd - selStart).toFixed(2)}초</b>
                    ({selStart.toFixed(2)}–{selEnd.toFixed(2)})
                    <button
                      className="btn btn-sm"
                      style={{ padding: "2px 8px" }}
                      onClick={() => playingSel ? stopSelection() : playSelection(selStart, selEnd)}
                    >
                      {playingSel ? "⏸ 정지" : "▶ 선택 구간 듣기"}
                    </button>
                    <button
                      className="btn btn-sm"
                      style={{ padding: "2px 8px" }}
                      onClick={() => { stopSelection(); setSelStart(0); setSelEnd(rawDuration); recompute(0, rawDuration); }}
                    >
                      전체
                    </button>
                  </span>
                </div>
                <SpeechWaveform
                  peaks={peaks}
                  rawDuration={rawDuration}
                  segments={fullSegments}
                  selStart={selStart}
                  selEnd={selEnd}
                  onChange={(s, e) => { stopSelection(); setSelStart(s); setSelEnd(e); recompute(s, e); }}
                />
                <div
                  style={{
                    marginTop: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    fontSize: 12,
                    color: "var(--text-mute)",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span
                      style={{
                        display: "inline-block",
                        height: 12,
                        width: 12,
                        borderRadius: 3,
                        background: "var(--primary)",
                      }}
                    ></span>{" "}
                    발화 {result.speechDuration.toFixed(2)}초
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span
                      style={{
                        display: "inline-block",
                        height: 12,
                        width: 12,
                        borderRadius: 3,
                        background: "var(--border-strong)",
                      }}
                    ></span>{" "}
                    쉼 {result.pauseDuration.toFixed(2)}초 ({result.pauseCount}회)
                  </span>
                </div>
              </div>

              {asr.supported ? (
                <div style={{ display: "grid", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>자동 전사 (수정 가능)</label>
                    <textarea
                      value={editedTranscript}
                      onChange={(e) => setEditedTranscript(e.target.value)}
                      rows={3}
                      placeholder={
                        asr.finalTranscript
                          ? ""
                          : "전사 결과 없음 — 직접 입력하거나 음절 수만 아래에 입력하세요."
                      }
                      style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6, fontFamily: "inherit" }}
                    />
                    <div
                      style={{
                        marginTop: 4,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        fontSize: 12,
                        color: "var(--text-mute)",
                      }}
                    >
                      <span>Web Speech API (Chrome/Edge) · 한국어 인식</span>
                      <button
                        className="btn btn-sm"
                        onClick={recountFromEdited}
                      >
                        전사 → 음절 수 재계산
                      </button>
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>
                      음절 수 (자동 카운트, 수정 가능)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={syllables}
                      onChange={(e) => setSyllables(e.target.value)}
                      placeholder="예: 45"
                      style={{
                        ...inputStyle,
                        padding: "12px 16px",
                        fontSize: 18,
                        fontWeight: 700,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    />
                    <p
                      style={{
                        margin: "4px 0 0",
                        fontSize: 12,
                        color: "var(--text-mute)",
                        lineHeight: 1.6,
                      }}
                    >
                      한글 음절 블록·자모·숫자 자릿수·영어 단어(모음군) 합산. ASR
                      인식 오류 가능 → 검토 후 보정 권장.
                    </p>
                  </div>
                </div>
              ) : (
                <div>
                  <label style={labelStyle}>
                    음절 수 입력 (대상자가 말한 전체 음절 수)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={syllables}
                    onChange={(e) => setSyllables(e.target.value)}
                    placeholder="예: 45"
                    style={{
                      ...inputStyle,
                      padding: "12px 16px",
                      fontSize: 18,
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  />
                  <p
                    style={{
                      margin: "4px 0 0",
                      fontSize: 12,
                      color: "#8A6422",
                      lineHeight: 1.6,
                    }}
                  >
                    이 브라우저는 음성 인식을 지원하지 않습니다. Chrome/Edge
                    사용을 권장합니다. 직접 음절 수를 입력하세요.
                  </p>
                </div>
              )}

              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                <button
                  className="btn btn-primary"
                  onClick={start}
                  style={{ flex: 1, padding: "12px 24px", fontSize: 14 }}
                >
                  다시 녹음
                </button>
                <label
                  className="btn"
                  style={{
                    display: "flex",
                    cursor: "pointer",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  📁 파일 업로드
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={onFileChange}
                    style={{ display: "none" }}
                  />
                </label>
                <button className="btn" onClick={reset}>
                  전체 초기화
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {phase === "done" && result && (
        <div className="card">
          <div className="card-body" style={{ display: "grid", gap: 16 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 800,
                  color: "var(--text)",
                }}
              >
                분석 결과
              </h3>
              <button className="btn btn-sm" onClick={downloadSrReport}>
                📄 리포트 다운로드
              </button>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 12,
              }}
            >
              <ResultBox
                label="전체 시간"
                value={`${result.totalDuration.toFixed(2)} 초`}
              />
              <ResultBox
                label="순 발화 시간"
                value={`${result.speechDuration.toFixed(2)} 초`}
                sub={`${((result.speechDuration / result.totalDuration) * 100).toFixed(0)}% of total`}
              />
              <ResultBox
                label="쉼 구간 수"
                value={`${result.pauseCount} 회`}
                sub={`장쉼(≥250ms) ${result.longPauseCount}회`}
              />
              <ResultBox
                label="평균 쉼 길이"
                value={`${(result.meanPauseDuration * 1000).toFixed(0)} ms`}
                sub={`최대 ${(result.maxPauseDuration * 1000).toFixed(0)} ms`}
              />
            </div>
            {validSyllables && (
              <div
                style={{
                  borderRadius: 12,
                  border: "1px solid var(--border-strong)",
                  background: "var(--primary-soft)",
                  padding: 16,
                }}
              >
                <h4
                  style={{
                    margin: "0 0 12px",
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--primary)",
                  }}
                >
                  음절 수 {syllablesNum}개 기준 말속도
                </h4>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                    gap: 12,
                  }}
                >
                  <ResultBox
                    label="전체 말속도"
                    value={`${overallSPS.toFixed(2)} SPS`}
                    sub={`≈ ${overallWPM.toFixed(0)} WPM`}
                    highlight
                  />
                  <ResultBox
                    label="조음속도"
                    value={`${articulationSPS.toFixed(2)} SPS`}
                    sub={"쉼 제외"}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {phase === "done" && result && (
        <ToolMonitor
          module="speech-rate"
          getMetrics={() =>
            validSyllables
              ? { sps: Number(overallSPS.toFixed(2)), artSps: Number(articulationSPS.toFixed(2)), dur: Number(result.totalDuration.toFixed(2)), syllables: syllablesNum }
              : null
          }
          renderSummary={(m) => `말속도 ${m.sps ?? "-"} · 조음 ${m.artSps ?? "-"} SPS · ${m.dur ?? "-"}초${m.syllables ? ` · ${m.syllables}음절` : ""}`}
          trends={[
            { key: "sps", label: "말속도(전체)", unit: "SPS", color: "#2563EB" },
            { key: "artSps", label: "조음속도(쉼 제외)", unit: "SPS", color: "#5A6E3D" },
          ]}
          onContext={setSubj}
        />
      )}

      <details
        className="card"
        style={{ padding: 0 }}
      >
        <summary
          style={{
            cursor: "pointer",
            padding: "12px 16px",
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-soft)",
            listStyle: "revert",
          }}
        >
          참고 범위 + 활용
        </summary>
        <div
          style={{
            padding: "0 16px 14px",
            display: "grid",
            gap: 12,
            fontSize: 14,
            color: "var(--text-soft)",
          }}
        >
          <div>
            <p style={{ margin: 0, fontWeight: 700 }}>성인 일반 참고 범위</p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-mute)" }}>
              낭독: 4.5–6.0 SPS / 자유발화: 3.5–5.0 SPS
            </p>
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 700 }}>활용</p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-mute)" }}>
              말속도가 빠르거나 불규칙할 때 자기 인식·조절 연습에 활용할 수
              있습니다. 전체속도·조음속도·쉼 분포를 함께 보며 말의 흐름을
              점검해 보세요.
            </p>
          </div>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 12,
              color: "var(--text-mute)",
              lineHeight: 1.6,
            }}
          >
            본 자료는 학습·연습·시각화 보조용이며, 수치는 추정치입니다. VAD
            임계 기반으로 쉼을 자동 분할합니다.
          </p>
        </div>
      </details>
    </div>
  );
}

const WAVE_H = 84;

function SpeechWaveform({
  peaks,
  rawDuration,
  segments,
  selStart,
  selEnd,
  onChange,
}: {
  peaks: number[];
  rawDuration: number;
  segments: Segment[];
  selStart: number;
  selEnd: number;
  onChange: (start: number, end: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<"start" | "end" | "region" | null>(null);
  const regionAnchorRef = useRef<number>(0);

  // 파형 그리기 (전체 신호, 선택과 무관)
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const classify = (t: number): "speech" | "pause" | "none" => {
      for (const s of segments) {
        if (t >= s.start && t <= s.end) return s.type;
      }
      return "none";
    };

    const draw = () => {
      const cssW = wrap.clientWidth;
      const cssH = WAVE_H;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(cssW * dpr));
      canvas.height = Math.floor(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.fillStyle = "#F5EDE0";
      ctx.fillRect(0, 0, cssW, cssH);
      const mid = cssH / 2;
      const n = peaks.length;
      if (n === 0 || rawDuration <= 0) return;
      const barW = cssW / n;
      const colors = { speech: "#5A6E3D", pause: "#C9BC9C", none: "#E4DAC4" };
      for (let i = 0; i < n; i++) {
        const t = (i / n) * rawDuration;
        const h = Math.max(1, peaks[i] * cssH * 0.9);
        ctx.fillStyle = colors[classify(t)];
        ctx.fillRect(i * barW, mid - h / 2, Math.max(0.5, barW), h);
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [peaks, rawDuration, segments]);

  // 드래그 → 시간 변환 후 onChange
  useEffect(() => {
    const move = (clientX: number) => {
      const wrap = wrapRef.current;
      const which = dragRef.current;
      if (!wrap || !which || rawDuration <= 0) return;
      const rect = wrap.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const t = ratio * rawDuration;
      const MIN = 0.2; // 최소 구간 0.2초
      if (which === "region") {
        const anchor = regionAnchorRef.current;
        const a = Math.min(anchor, t);
        const b = Math.max(anchor, t);
        onChange(a, Math.max(b, a + MIN));
      } else if (which === "start") onChange(Math.min(t, selEnd - MIN), selEnd);
      else onChange(selStart, Math.max(t, selStart + MIN));
    };
    const onMouseMove = (e: MouseEvent) => move(e.clientX);
    const onTouchMove = (e: TouchEvent) => { if (e.touches[0]) { e.preventDefault(); move(e.touches[0].clientX); } };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [rawDuration, selStart, selEnd, onChange]);

  const startPct = rawDuration > 0 ? (selStart / rawDuration) * 100 : 0;
  const endPct = rawDuration > 0 ? (selEnd / rawDuration) * 100 : 100;

  const handle = (which: "start" | "end"): React.CSSProperties => ({
    position: "absolute", top: 0, bottom: 0, width: 12, marginLeft: -6,
    left: `${which === "start" ? startPct : endPct}%`,
    cursor: "ew-resize", touchAction: "none", zIndex: 3,
    display: "flex", alignItems: "center", justifyContent: "center",
  });
  const bar: React.CSSProperties = { width: 3, height: "70%", borderRadius: 2, background: "var(--primary)", boxShadow: "0 0 0 1px rgba(255,255,255,0.7)" };

  return (
    <div
      ref={wrapRef}
      onMouseDown={(e) => {
        // Shift+드래그 → 새 구간 선택 (손잡이가 아닌 빈 영역)
        if (!e.shiftKey || rawDuration <= 0) return;
        const wrap = wrapRef.current;
        if (!wrap) return;
        e.preventDefault();
        const rect = wrap.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const t = ratio * rawDuration;
        regionAnchorRef.current = t;
        dragRef.current = "region";
        onChange(t, Math.min(rawDuration, t + 0.2));
      }}
      style={{ position: "relative", width: "100%", overflow: "hidden", borderRadius: 8, border: "1px solid var(--border-strong)", height: WAVE_H, userSelect: "none" }}
    >
      <canvas ref={canvasRef} style={{ display: "block" }} />
      {/* 선택 밖 영역 어둡게 */}
      <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${startPct}%`, background: "rgba(31,35,23,0.28)", zIndex: 1, pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: `${100 - endPct}%`, background: "rgba(31,35,23,0.28)", zIndex: 1, pointerEvents: "none" }} />
      {/* 선택 경계선 */}
      <div style={{ position: "absolute", top: 0, bottom: 0, left: `${startPct}%`, right: `${100 - endPct}%`, border: "2px solid var(--primary)", borderRadius: 4, zIndex: 2, pointerEvents: "none" }} />
      {/* 드래그 손잡이 */}
      <div style={handle("start")} onMouseDown={(e) => { e.preventDefault(); dragRef.current = "start"; }} onTouchStart={() => { dragRef.current = "start"; }}><div style={bar} /></div>
      <div style={handle("end")} onMouseDown={(e) => { e.preventDefault(); dragRef.current = "end"; }} onTouchStart={() => { dragRef.current = "end"; }}><div style={bar} /></div>
    </div>
  );
}

function ResultBox({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        borderRadius: 12,
        border: highlight
          ? "1px solid var(--accent)"
          : "1px solid var(--border)",
        background: "var(--surface)",
        padding: "12px 16px",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 12,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.03em",
          color: "var(--text-soft)",
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: "4px 0 0",
          fontSize: 20,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: highlight ? "var(--primary)" : "var(--text)",
        }}
      >
        {value}
      </p>
      {sub && (
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-mute)" }}>
          {sub}
        </p>
      )}
    </div>
  );
}
