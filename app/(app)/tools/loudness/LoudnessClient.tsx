"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { yinPitch } from "@/lib/voice/yin";
import { freqToNoteName, semitonesBetween } from "@/lib/voice/noteUtils";
import { decodeAudioFile } from "@/lib/voice/audioFile";
import { downloadReport } from "@/lib/voice/report";
import ToolMonitor from "../ToolMonitor";

const DURATION_OPTIONS = [15, 30, 45, 60] as const;
type Duration = (typeof DURATION_OPTIONS)[number];

const FFT_SIZES = [2048, 4096] as const;
type FftSize = (typeof FFT_SIZES)[number];

type Preset = { id: string; label: string; lower: number; upper: number };
const PRESETS: Preset[] = [
  { id: "custom", label: "사용자 정의", lower: 0, upper: 0 },
  { id: "male", label: "성인 남성 (85–180 Hz)", lower: 85, upper: 180 },
  { id: "female", label: "성인 여성 (165–255 Hz)", lower: 165, upper: 255 },
  { id: "child", label: "아동 (250–400 Hz)", lower: 250, upper: 400 },
];

const F_MIN = 50;
const F_MAX = 500;
const DB_MIN = 30;
const DB_MAX = 100;
const DB_OFFSET = 80; // dBFS → dB SPL 추정 오프셋(캘리브레이션 없이)
const CHART_WIDTH = 900;
const CHART_H = 440;
const PADDING = { top: 24, right: 80, bottom: 44, left: 80 };
const GAP_THRESHOLD_SEC = 0.15;

const PITCH_COLOR = "#2563EB";
const DB_COLOR = "#C0492F";

type Sample = { t: number; f0: number | null; db: number | null };
type Scale = { toY: (v: number) => number; toVal: (y: number) => number };

function logScale(min: number, max: number, height: number): Scale {
  const logMin = Math.log(min);
  const logMax = Math.log(max);
  const innerH = height - PADDING.top - PADDING.bottom;
  return {
    toY: (v) => {
      const c = Math.max(min, Math.min(max, v));
      return PADDING.top + innerH * (1 - (Math.log(c) - logMin) / (logMax - logMin));
    },
    toVal: (y) => {
      const ratio = 1 - (y - PADDING.top) / innerH;
      return Math.exp(logMin + ratio * (logMax - logMin));
    },
  };
}
function linScale(min: number, max: number, height: number): Scale {
  const innerH = height - PADDING.top - PADDING.bottom;
  return {
    toY: (v) => {
      const c = Math.max(min, Math.min(max, v));
      return PADDING.top + innerH * (1 - (c - min) / (max - min));
    },
    toVal: (y) => {
      const ratio = 1 - (y - PADDING.top) / innerH;
      return min + ratio * (max - min);
    },
  };
}
function timeToX(t: number, duration: number): number {
  const innerWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  return PADDING.left + innerWidth * (t / duration);
}
function buildPath(samples: Sample[], key: "f0" | "db", toY: (v: number) => number, duration: number): string {
  const parts: string[] = [];
  let lastT = -1;
  let lastValid = false;
  for (const s of samples) {
    const v = s[key];
    if (v == null) { lastValid = false; continue; }
    const x = timeToX(s.t, duration);
    const y = toY(v);
    if (!lastValid || s.t - lastT > GAP_THRESHOLD_SEC) parts.push(`M ${x.toFixed(2)} ${y.toFixed(2)}`);
    else parts.push(`L ${x.toFixed(2)} ${y.toFixed(2)}`);
    lastT = s.t;
    lastValid = true;
  }
  return parts.join(" ");
}

export default function LoudnessClient() {
  const [duration, setDuration] = useState<Duration>(30);
  const [fftSize, setFftSize] = useState<FftSize>(2048);
  const [isRecording, setIsRecording] = useState(false);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [currentF0, setCurrentF0] = useState<number | null>(null);
  const [currentDb, setCurrentDb] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [lowerBound, setLowerBound] = useState(150);
  const [upperBound, setUpperBound] = useState(280);
  const [dbLower, setDbLower] = useState(65);
  const [dbUpper, setDbUpper] = useState(80);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fileDuration, setFileDuration] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ chart: "pitch" | "intensity"; bound: "low" | "high" } | null>(null);
  const [presetId, setPresetId] = useState("custom");
  const [subj, setSubj] = useState<{ subject: string | null; clinician: string; chartSvg?: string }>({ subject: null, clinician: "" });
  // 음도/강도 표시 선택 (둘 다 또는 하나만)
  const [showPitch, setShowPitch] = useState(true);
  const [showDb, setShowDb] = useState(true);
  // 모바일에선 그래프 높이를 줄여요
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  const chartH = isMobile ? 300 : CHART_H;

  // 둘 다 꺼지지 않도록 — 마지막 하나는 끌 수 없음
  const togglePitch = useCallback(() => setShowPitch((v) => (v && !showDb ? v : !v)), [showDb]);
  const toggleDb = useCallback(() => setShowDb((v) => (v && !showPitch ? v : !v)), [showPitch]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const samplesRef = useRef<Sample[]>([]);
  const durationRef = useRef<Duration>(duration);
  const fftSizeRef = useRef<FftSize>(fftSize);
  const draggingRef = useRef<typeof dragging>(null);

  useEffect(() => { draggingRef.current = dragging; }, [dragging]);
  useEffect(() => { durationRef.current = duration; }, [duration]);
  useEffect(() => { fftSizeRef.current = fftSize; }, [fftSize]);

  const pitchScale = useMemo(() => logScale(F_MIN, F_MAX, chartH), [chartH]);
  const dbScale = useMemo(() => linScale(DB_MIN, DB_MAX, chartH), [chartH]);

  const stop = useCallback(() => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => undefined); audioCtxRef.current = null; }
    analyserRef.current = null;
    sourceRef.current = null;
    setIsRecording(false);
  }, []);

  const tick = useCallback(() => {
    const analyser = analyserRef.current;
    const ctx = audioCtxRef.current;
    if (!analyser || !ctx) return;
    const dur = durationRef.current;
    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    const f0 = yinPitch(buf, ctx.sampleRate);
    let sumSq = 0;
    for (let i = 0; i < buf.length; i++) sumSq += buf[i] * buf[i];
    const rms = Math.sqrt(sumSq / buf.length);
    const dbSPL = (rms > 0 ? 20 * Math.log10(rms) : -100) + DB_OFFSET;
    const t = (performance.now() - startTimeRef.current) / 1000;
    if (t >= dur) { setElapsed(dur); stop(); return; }
    const validF0 = f0 > F_MIN && f0 < F_MAX && isFinite(f0);
    const validDb = dbSPL > DB_MIN && dbSPL < DB_MAX;
    if (validF0 || validDb) {
      samplesRef.current.push({ t, f0: validF0 ? f0 : null, db: validDb ? dbSPL : null });
      setSamples([...samplesRef.current]);
    }
    setCurrentF0(validF0 ? f0 : null);
    setCurrentDb(validDb ? dbSPL : null);
    setElapsed(t);
    rafRef.current = requestAnimationFrame(tick);
  }, [stop]);

  const start = useCallback(async () => {
    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = fftSizeRef.current;
      analyser.smoothingTimeConstant = 0;
      analyserRef.current = analyser;
      source.connect(analyser);
      samplesRef.current = [];
      setSamples([]);
      setCurrentF0(null);
      setCurrentDb(null);
      setElapsed(0);
      setFileDuration(0);
      setFileName(null);
      startTimeRef.current = performance.now();
      setIsRecording(true);
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      console.error(err);
      setErrorMsg("마이크 접근에 실패했어요. 브라우저 주소창의 마이크 권한을 확인해 주세요.");
    }
  }, [tick]);

  const reset = useCallback(() => {
    stop();
    samplesRef.current = [];
    setSamples([]);
    setCurrentF0(null);
    setCurrentDb(null);
    setElapsed(0);
    setFileDuration(0);
    setFileName(null);
  }, [stop]);

  const analyzeFile = useCallback(async (file: File) => {
    setErrorMsg(null);
    stop();
    try {
      const { data, sampleRate, duration: dur } = await decodeAudioFile(file);
      const win = fftSizeRef.current;
      const hop = Math.max(1, Math.round(sampleRate * 0.02));
      const out: Sample[] = [];
      for (let start = 0; start + win <= data.length; start += hop) {
        const frame = data.subarray(start, start + win);
        const f0 = yinPitch(frame, sampleRate);
        let sumSq = 0;
        for (let i = 0; i < frame.length; i++) sumSq += frame[i] * frame[i];
        const rms = Math.sqrt(sumSq / frame.length);
        const dbSPL = (rms > 0 ? 20 * Math.log10(rms) : -100) + DB_OFFSET;
        const validF0 = f0 > F_MIN && f0 < F_MAX && isFinite(f0);
        const validDb = dbSPL > DB_MIN && dbSPL < DB_MAX;
        if (validF0 || validDb) out.push({ t: start / sampleRate, f0: validF0 ? f0 : null, db: validDb ? dbSPL : null });
      }
      samplesRef.current = out;
      setSamples(out);
      setFileDuration(dur);
      setFileName(file.name);
      setCurrentF0(null);
      setCurrentDb(null);
      setElapsed(0);
    } catch (err) {
      console.error(err);
      setErrorMsg("오디오 파일을 분석할 수 없어요. 다른 파일을 시도해 주세요.");
    }
  }, [stop]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) analyzeFile(file);
  }, [analyzeFile]);

  useEffect(() => () => stop(), [stop]);

  const pitchStats = useMemo(() => {
    const voiced = samples.filter((s) => s.f0 != null) as { t: number; f0: number }[];
    if (voiced.length === 0) return { mean: 0, min: 0, max: 0, inRange: 0, total: 0, inRangePct: 0, rangeSemitones: 0 };
    let sum = 0, min = Infinity, max = -Infinity, inRange = 0;
    for (const s of voiced) {
      sum += s.f0;
      if (s.f0 < min) min = s.f0;
      if (s.f0 > max) max = s.f0;
      if (s.f0 >= lowerBound && s.f0 <= upperBound) inRange++;
    }
    return { mean: sum / voiced.length, min, max, inRange, total: voiced.length, inRangePct: (inRange / voiced.length) * 100, rangeSemitones: semitonesBetween(min, max) };
  }, [samples, lowerBound, upperBound]);

  const dbStats = useMemo(() => {
    const valid = samples.filter((s) => s.db != null) as { t: number; db: number }[];
    if (valid.length === 0) return { mean: 0, min: 0, max: 0, inRange: 0, total: 0, inRangePct: 0 };
    let sum = 0, min = Infinity, max = -Infinity, inRange = 0;
    for (const s of valid) {
      sum += s.db;
      if (s.db < min) min = s.db;
      if (s.db > max) max = s.db;
      if (s.db >= dbLower && s.db <= dbUpper) inRange++;
    }
    return { mean: sum / valid.length, min, max, inRange, total: valid.length, inRangePct: (inRange / valid.length) * 100 };
  }, [samples, dbLower, dbUpper]);

  const handleDragValue = useCallback((v: number) => {
    const cur = draggingRef.current;
    if (!cur) return;
    if (cur.chart === "pitch") {
      const f = Math.max(F_MIN + 1, Math.min(F_MAX - 1, v));
      if (cur.bound === "low") setLowerBound(Math.min(f, upperBound - 5));
      else setUpperBound(Math.max(f, lowerBound + 5));
      setPresetId("custom");
    } else {
      const d = Math.max(DB_MIN + 1, Math.min(DB_MAX - 1, v));
      if (cur.bound === "low") setDbLower(Math.min(d, dbUpper - 3));
      else setDbUpper(Math.max(d, dbLower + 3));
    }
  }, [lowerBound, upperBound, dbLower, dbUpper]);

  const endDrag = useCallback(() => setDragging(null), []);

  const handlePresetChange = useCallback((id: string) => {
    setPresetId(id);
    const preset = PRESETS.find((p) => p.id === id);
    if (preset && id !== "custom") { setLowerBound(preset.lower); setUpperBound(preset.upper); }
  }, []);

  const exportCSV = useCallback(() => {
    if (samples.length === 0) return;
    const lines = ["time_sec,f0_hz,in_pitch_range,db_spl,in_db_range"];
    for (const s of samples) {
      const inPitch = s.f0 != null && s.f0 >= lowerBound && s.f0 <= upperBound ? 1 : 0;
      const inDb = s.db != null && s.db >= dbLower && s.db <= dbUpper ? 1 : 0;
      lines.push(`${s.t.toFixed(3)},${s.f0 != null ? s.f0.toFixed(2) : ""},${inPitch},${s.db != null ? s.db.toFixed(2) : ""},${inDb}`);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `음도강도_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [samples, lowerBound, upperBound, dbLower, dbUpper]);

  const downloadPitchReport = useCallback(() => {
    if (samples.length === 0) return;
    const dur = fileDuration > 0 ? fileDuration : duration;
    downloadReport({
      title: "음도·강도 분석 리포트",
      subtitle: `${fileDuration > 0 ? `파일: ${fileName ?? ""} · ` : "마이크 녹음 · "}길이 ${dur.toFixed(1)}초`,
      meta: { subject: subj.subject ?? undefined, clinician: subj.clinician || undefined },
      chartSvg: subj.chartSvg,
      sections: [
        {
          heading: "음도 (기본주파수 F0)",
          rows: [
            { label: "평균 F0", value: `${pitchStats.mean.toFixed(1)} Hz (${freqToNoteName(pitchStats.mean)})` },
            { label: "최소 ~ 최대", value: `${pitchStats.min.toFixed(0)} ~ ${pitchStats.max.toFixed(0)} Hz` },
            { label: "음역", value: `${pitchStats.rangeSemitones.toFixed(1)} semitone` },
            { label: "목표 음역대", value: `${lowerBound.toFixed(0)} ~ ${upperBound.toFixed(0)} Hz` },
            { label: "목표 음역대 체류", value: `${pitchStats.inRangePct.toFixed(1)} %`, ref: `${pitchStats.inRange}/${pitchStats.total} 샘플` },
          ],
        },
        {
          heading: "강도 (dB SPL 추정)",
          rows: [
            { label: "평균 강도", value: `${dbStats.mean.toFixed(1)} dB` },
            { label: "최소 ~ 최대", value: `${dbStats.min.toFixed(0)} ~ ${dbStats.max.toFixed(0)} dB` },
            { label: "목표 강도 구간", value: `${dbLower.toFixed(0)} ~ ${dbUpper.toFixed(0)} dB` },
            { label: "목표 강도 체류", value: `${dbStats.inRangePct.toFixed(1)} %`, ref: `${dbStats.inRange}/${dbStats.total} 샘플` },
          ],
        },
      ],
      footnote: "강도는 RMS→dBFS+80 추정값으로, 절대값보다 상대 변화 추적에 적합합니다. 목표 강도는 일반적으로 70–85 dB 범위를 권장합니다.",
    }, "음도강도");
  }, [samples, fileDuration, fileName, duration, pitchStats, dbStats, lowerBound, upperBound, dbLower, dbUpper, subj]);

  const effDur = fileDuration > 0 ? fileDuration : duration;
  const pitchPath = useMemo(() => buildPath(samples, "f0", pitchScale.toY, effDur), [samples, pitchScale, effDur]);
  const dbPath = useMemo(() => buildPath(samples, "db", dbScale.toY, effDur), [samples, dbScale, effDur]);
  const gridTimes = useMemo(() => {
    const step = effDur <= 15 ? 3 : effDur <= 30 ? 5 : effDur <= 60 ? 10 : 20;
    const out: number[] = [];
    for (let t = 0; t <= effDur; t += step) out.push(Math.round(t));
    const last = Math.round(effDur);
    if (out[out.length - 1] !== last) out.push(last);
    return out;
  }, [effDur]);

  const segBtn = (active: boolean): React.CSSProperties => ({
    padding: "7px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none",
    background: active ? "var(--primary)" : "var(--surface)", color: active ? "#fff" : "var(--text-soft)",
  });

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* 컨트롤 바 */}
      <div className="card">
        <div className="card-body" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-soft)" }}>측정 시간</span>
            <div style={{ display: "flex", overflow: "hidden", borderRadius: 8, border: "1px solid var(--border)" }}>
              {DURATION_OPTIONS.map((d) => (
                <button key={d} onClick={() => setDuration(d)} disabled={isRecording} style={segBtn(d === duration)}>{d}초</button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-soft)" }}>음역대 프리셋</span>
            <select value={presetId} onChange={(e) => handlePresetChange(e.target.value)} disabled={isRecording}
              style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 13, color: "var(--text)" }}>
              {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-soft)" }}>정밀도</span>
            <div style={{ display: "flex", overflow: "hidden", borderRadius: 8, border: "1px solid var(--border)" }}
              title="fftSize: 큰 값일수록 저음역까지 정확하지만 화면 갱신이 느려져요.">
              {FFT_SIZES.map((f) => (
                <button key={f} onClick={() => setFftSize(f)} disabled={isRecording} style={segBtn(f === fftSize)}>
                  {f === 2048 ? "기본 (~70Hz↑)" : "저음 (~35Hz↑)"}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-soft)" }}>표시</span>
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 600, color: PITCH_COLOR, cursor: "pointer" }}>
              <input type="checkbox" checked={showPitch} onChange={togglePitch} style={{ accentColor: PITCH_COLOR }} /> 음도
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 600, color: DB_COLOR, cursor: "pointer" }}>
              <input type="checkbox" checked={showDb} onChange={toggleDb} style={{ accentColor: DB_COLOR }} /> 강도
            </label>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {!isRecording ? (
              <button className="btn btn-primary" onClick={start}>시작</button>
            ) : (
              <button className="btn" onClick={stop} style={{ borderColor: DB_COLOR, color: DB_COLOR }}>정지</button>
            )}
            <label className="btn" style={{ cursor: isRecording ? "not-allowed" : "pointer", opacity: isRecording ? 0.5 : 1 }}>
              파일 업로드
              <input type="file" accept="audio/*" onChange={onFileChange} disabled={isRecording} style={{ display: "none" }} />
            </label>
            <button className="btn" onClick={reset} disabled={isRecording}>초기화</button>
            <button className="btn" onClick={exportCSV} disabled={isRecording || samples.length === 0}>CSV 저장</button>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div style={{ padding: "10px 14px", borderRadius: 10, fontSize: 13.5, lineHeight: 1.6, background: "#F6E4DE", color: "#8A2F1C", border: "1px solid #E6C3B8" }}>
          {errorMsg}
        </div>
      )}

      {/* 음도(F0) + 강도(dB) 통합 차트 */}
      <DualTrackChart
        height={chartH} mobile={isMobile} showPitch={showPitch} showDb={showDb}
        duration={effDur} elapsed={elapsed} isRecording={isRecording}
        pitchScale={pitchScale} dbScale={dbScale}
        pitchGrid={[60, 80, 100, 150, 200, 300, 400]} dbGrid={[40, 50, 60, 70, 80, 90]}
        gridTimes={gridTimes} pitchPath={pitchPath} dbPath={dbPath}
        currentF0={isRecording ? currentF0 : null} currentDb={isRecording ? currentDb : null}
        pitchLower={lowerBound} pitchUpper={upperBound} dbLower={dbLower} dbUpper={dbUpper}
        dragging={dragging}
        onDragStart={(chart, bound) => setDragging({ chart, bound })}
        onDragValue={handleDragValue} onDragEnd={endDrag}
      />

      {showPitch && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          <StatBox label="현재 음도" value={currentF0 ? `${currentF0.toFixed(1)} Hz` : "-"} sub={currentF0 ? freqToNoteName(currentF0) : ""} />
          <StatBox label="평균 음도" value={pitchStats.total ? `${pitchStats.mean.toFixed(1)} Hz` : "-"} sub={pitchStats.total ? freqToNoteName(pitchStats.mean) : ""} />
          <StatBox label="음역 (최소~최대)" value={pitchStats.total ? `${pitchStats.min.toFixed(0)} ~ ${pitchStats.max.toFixed(0)} Hz` : "-"} sub={pitchStats.total ? `${pitchStats.rangeSemitones.toFixed(1)} semitone` : ""} />
          <StatBox label="목표 음역대 체류" value={pitchStats.total ? `${pitchStats.inRangePct.toFixed(1)} %` : "-"} sub={pitchStats.total ? `${pitchStats.inRange} / ${pitchStats.total} 샘플` : ""} accent />
        </div>
      )}
      {showDb && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          <StatBox label="현재 강도" value={currentDb ? `${currentDb.toFixed(1)} dB` : "-"} />
          <StatBox label="평균 강도" value={dbStats.total ? `${dbStats.mean.toFixed(1)} dB` : "-"} />
          <StatBox label="강도 범위" value={dbStats.total ? `${dbStats.min.toFixed(0)} ~ ${dbStats.max.toFixed(0)} dB` : "-"} />
          <StatBox label="목표 강도 체류" value={dbStats.total ? `${dbStats.inRangePct.toFixed(1)} %` : "-"} sub={dbStats.total ? `${dbStats.inRange} / ${dbStats.total} 샘플` : ""} accent />
        </div>
      )}

      {isRecording && (
        <div style={{ padding: "10px 14px", borderRadius: 10, fontSize: 13.5, background: "var(--primary-soft)", color: "var(--primary)" }}>
          녹음 중 · 경과 {elapsed.toFixed(1)} / {duration}초
        </div>
      )}
      {!isRecording && fileDuration > 0 && (
        <div style={{ padding: "10px 14px", borderRadius: 10, fontSize: 13.5, background: "var(--surface-2)", color: "var(--text-soft)" }}>
          📁 파일 분석: <b>{fileName}</b> · 길이 {fileDuration.toFixed(1)}초 · 음도/강도 시계열을 오프라인으로 산출했어요.
        </div>
      )}
      {!isRecording && samples.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
          <button className="btn btn-primary" onClick={downloadPitchReport}>📄 리포트 다운로드</button>
          <span style={{ fontSize: 12, color: "var(--text-mute)" }}>HTML 리포트로 저장 → 열어서 인쇄/PDF 가능</span>
        </div>
      )}

      {!isRecording && samples.length > 0 && (
        <ToolMonitor
          module="loudness"
          getMetrics={() =>
            pitchStats.total
              ? { meanF0: Number(pitchStats.mean.toFixed(1)), meanDb: Number(dbStats.mean.toFixed(1)), rangeSt: Number(pitchStats.rangeSemitones.toFixed(1)) }
              : null
          }
          renderSummary={(m) => `평균 ${m.meanF0 ?? "-"}Hz · ${m.meanDb ?? "-"}dB · 음역 ${m.rangeSt ?? "-"}st`}
          trend={{ key: "meanF0", label: "평균 음도", unit: "Hz" }}
          onContext={setSubj}
        />
      )}
    </div>
  );
}

function DualTrackChart({
  height, mobile, showPitch, showDb, duration, elapsed, isRecording, pitchScale, dbScale, pitchGrid, dbGrid, gridTimes,
  pitchPath, dbPath, currentF0, currentDb, pitchLower, pitchUpper, dbLower, dbUpper,
  dragging, onDragStart, onDragValue, onDragEnd,
}: {
  height: number; mobile: boolean; showPitch: boolean; showDb: boolean;
  duration: number; elapsed: number; isRecording: boolean;
  pitchScale: Scale; dbScale: Scale; pitchGrid: number[]; dbGrid: number[]; gridTimes: number[];
  pitchPath: string; dbPath: string; currentF0: number | null; currentDb: number | null;
  pitchLower: number; pitchUpper: number; dbLower: number; dbUpper: number;
  dragging: { chart: "pitch" | "intensity"; bound: "low" | "high" } | null;
  onDragStart: (chart: "pitch" | "intensity", bound: "low" | "high") => void;
  onDragValue: (v: number) => void; onDragEnd: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const innerW = CHART_WIDTH - PADDING.left - PADDING.right;
  const plotBottom = height - PADDING.bottom;

  const moveFromClientY = useCallback((clientY: number) => {
    if (!dragging || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleY = height / rect.height;
    const localY = (clientY - rect.top) * scaleY;
    const scale = dragging.chart === "pitch" ? pitchScale : dbScale;
    onDragValue(scale.toVal(localY));
  }, [dragging, height, pitchScale, dbScale, onDragValue]);

  const pUpperY = pitchScale.toY(pitchUpper);
  const pLowerY = pitchScale.toY(pitchLower);
  const dUpperY = dbScale.toY(dbUpper);
  const dLowerY = dbScale.toY(dbLower);

  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <div className="card-body">
        <div style={{ marginBottom: 8, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 20px", fontSize: 12 }}>
          {showPitch && (
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: PITCH_COLOR }}>
              <span style={{ display: "inline-block", height: 10, width: 16, borderRadius: 3, background: PITCH_COLOR }} /> 음도 F0 (Hz · 좌축)
            </span>
          )}
          {showDb && (
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: DB_COLOR }}>
              <span style={{ display: "inline-block", height: 10, width: 16, borderRadius: 3, background: DB_COLOR }} /> 강도 (dB · 우축)
            </span>
          )}
          <span style={{ color: "var(--text-mute)" }}>
            막대를 끌어 목표 구간 설정{showPitch && showDb ? " (좌=음역, 우=강도)" : ""}
          </span>
        </div>
        <div style={{ minWidth: mobile ? 480 : 680 }}>
          <svg ref={svgRef} viewBox={`0 0 ${CHART_WIDTH} ${height}`} style={{ width: "100%", touchAction: "none", userSelect: "none" }}
            onMouseMove={(e) => moveFromClientY(e.clientY)} onMouseUp={onDragEnd} onMouseLeave={onDragEnd}
            onTouchMove={(e) => { if (!dragging) return; e.preventDefault(); const t = e.touches[0]; if (t) moveFromClientY(t.clientY); }}
            onTouchEnd={onDragEnd} onTouchCancel={onDragEnd}>
            <rect x={PADDING.left} y={PADDING.top} width={innerW} height={plotBottom - PADDING.top} fill="#FBF8F1" />
            {showPitch && <rect x={PADDING.left} y={pUpperY} width={innerW} height={Math.max(0, pLowerY - pUpperY)} fill={PITCH_COLOR} opacity={0.08} />}
            {showDb && <rect x={PADDING.left} y={dUpperY} width={innerW} height={Math.max(0, dLowerY - dUpperY)} fill={DB_COLOR} opacity={0.08} />}
            {showPitch && pitchGrid.map((v) => {
              const y = pitchScale.toY(v);
              return (
                <g key={`hz-${v}`}>
                  <line x1={PADDING.left} x2={CHART_WIDTH - PADDING.right} y1={y} y2={y} stroke="#EBE5D6" strokeDasharray="3 3" />
                  <text x={PADDING.left - 10} y={y + 4} textAnchor="end" fontSize={12} fill={PITCH_COLOR} fontWeight={500}>{v}</text>
                </g>
              );
            })}
            {showDb && dbGrid.map((v) => {
              const y = dbScale.toY(v);
              return (
                <g key={`db-${v}`}>
                  <line x1={CHART_WIDTH - PADDING.right} x2={CHART_WIDTH - PADDING.right + 5} y1={y} y2={y} stroke={DB_COLOR} />
                  <text x={CHART_WIDTH - PADDING.right + 10} y={y + 4} textAnchor="start" fontSize={12} fill={DB_COLOR} fontWeight={500}>{v}</text>
                </g>
              );
            })}
            {gridTimes.map((t) => {
              const x = timeToX(t, duration);
              return (
                <g key={`vt-${t}`}>
                  <line x1={x} x2={x} y1={PADDING.top} y2={plotBottom} stroke="#EBE5D6" strokeDasharray="3 3" />
                  <text x={x} y={plotBottom + 18} textAnchor="middle" fontSize={13} fill="#5A5E4E" fontWeight={500}>{t}s</text>
                </g>
              );
            })}
            {showPitch && <line x1={PADDING.left} x2={PADDING.left} y1={PADDING.top} y2={plotBottom} stroke={PITCH_COLOR} strokeOpacity={0.5} />}
            {showDb && <line x1={CHART_WIDTH - PADDING.right} x2={CHART_WIDTH - PADDING.right} y1={PADDING.top} y2={plotBottom} stroke={DB_COLOR} strokeOpacity={0.5} />}
            <line x1={PADDING.left} x2={CHART_WIDTH - PADDING.right} y1={plotBottom} y2={plotBottom} stroke="#C9BC9C" />
            {showPitch && <text x={22} y={height / 2} textAnchor="middle" fontSize={13} fill={PITCH_COLOR} fontWeight={600} transform={`rotate(-90 22 ${height / 2})`}>음도 (Hz)</text>}
            {showDb && <text x={CHART_WIDTH - 18} y={height / 2} textAnchor="middle" fontSize={13} fill={DB_COLOR} fontWeight={600} transform={`rotate(90 ${CHART_WIDTH - 18} ${height / 2})`}>강도 (dB)</text>}
            <text x={CHART_WIDTH / 2} y={height - 6} textAnchor="middle" fontSize={13} fill="#3D4A2A" fontWeight={500}>시간 (초)</text>
            {showDb && dbPath && <path d={dbPath} fill="none" stroke={DB_COLOR} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />}
            {showPitch && pitchPath && <path d={pitchPath} fill="none" stroke={PITCH_COLOR} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
            {isRecording && (
              <line x1={timeToX(elapsed, duration)} x2={timeToX(elapsed, duration)} y1={PADDING.top} y2={plotBottom} stroke="#94A38B" strokeWidth={1} />
            )}
            {showDb && currentDb !== null && isRecording && (
              <circle cx={timeToX(elapsed, duration)} cy={dbScale.toY(currentDb)} r={5.5} fill={DB_COLOR} stroke="white" strokeWidth={2} />
            )}
            {showPitch && currentF0 !== null && isRecording && (
              <circle cx={timeToX(elapsed, duration)} cy={pitchScale.toY(currentF0)} r={5.5} fill={PITCH_COLOR} stroke="white" strokeWidth={2} />
            )}
            {showPitch && <DualHandle y={pUpperY} value={pitchUpper} unit="Hz" color={PITCH_COLOR} side="left" onStart={() => onDragStart("pitch", "high")} />}
            {showPitch && <DualHandle y={pLowerY} value={pitchLower} unit="Hz" color={PITCH_COLOR} side="left" onStart={() => onDragStart("pitch", "low")} />}
            {showDb && <DualHandle y={dUpperY} value={dbUpper} unit="dB" color={DB_COLOR} side="right" onStart={() => onDragStart("intensity", "high")} />}
            {showDb && <DualHandle y={dLowerY} value={dbLower} unit="dB" color={DB_COLOR} side="right" onStart={() => onDragStart("intensity", "low")} />}
          </svg>
        </div>
      </div>
    </div>
  );
}

function DualHandle({ y, value, unit, color, side, onStart }: {
  y: number; value: number; unit: string; color: string; side: "left" | "right"; onStart: () => void;
}) {
  const boxW = 60;
  const boxX = side === "left" ? PADDING.left - boxW - 4 : CHART_WIDTH - PADDING.right + 4;
  const textX = boxX + boxW / 2;
  return (
    <g>
      <line x1={PADDING.left} x2={CHART_WIDTH - PADDING.right} y1={y} y2={y} stroke={color} strokeWidth={1.5} strokeDasharray="6 4" pointerEvents="none" />
      <g style={{ cursor: "ns-resize" }}
        onMouseDown={(e) => { e.preventDefault(); onStart(); }}
        onTouchStart={(e) => { e.preventDefault(); onStart(); }}>
        <rect x={boxX} y={y - 11} width={boxW} height={22} fill={color} rx={5} />
        <text x={textX} y={y + 4} textAnchor="middle" fontSize={12} fill="white" fontWeight={700}>{value.toFixed(0)} {unit}</text>
      </g>
    </g>
  );
}

function StatBox({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div style={{ borderRadius: 12, border: "1px solid var(--border)", background: accent ? "var(--primary-soft)" : "var(--surface-2)", padding: "12px 14px" }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "var(--text-mute)" }}>{label}</p>
      <p style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 800, color: accent ? "var(--primary)" : "var(--text)" }}>{value}</p>
      {sub && <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-soft)" }}>{sub}</p>}
    </div>
  );
}
