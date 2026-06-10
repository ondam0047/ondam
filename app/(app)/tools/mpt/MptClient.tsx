"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { decodeAudioFile } from "@/lib/voice/audioFile";
import { yinPitch } from "@/lib/voice/yin";
import { freqToNoteName } from "@/lib/voice/noteUtils";
import { downloadReport } from "@/lib/voice/report";
import ToolMonitor from "../ToolMonitor";

const WAVE_CAPACITY = 260;
const VOICE_THRESHOLD = 0.008;
const END_SILENCE_MS = 500;
const MIN_PHONATION_SEC = 1.0;
const MAX_PHONATION_SEC = 60.0;
const MAX_TRIALS = 3;

// 디코드 버퍼에서 최장 지속발성 구간(내부 묵음 < END_SILENCE_MS 허용) 길이 산출
function mptFromBuffer(data: Float32Array, sr: number): number {
  const win = Math.round(sr * 0.02);
  if (win <= 0) return 0;
  const gapFrames = Math.ceil(((END_SILENCE_MS / 1000) * sr) / win);
  let best = 0;
  let runStart = -1;
  let lastVoiced = -1;
  let i = 0;
  for (let start = 0; start + win <= data.length; start += win, i++) {
    let sumSq = 0;
    for (let j = 0; j < win; j++) sumSq += data[start + j] * data[start + j];
    const rms = Math.sqrt(sumSq / win);
    if (rms > VOICE_THRESHOLD) {
      if (runStart < 0) runStart = i;
      lastVoiced = i;
    } else if (runStart >= 0 && i - lastVoiced > gapFrames) {
      best = Math.max(best, ((lastVoiced - runStart + 1) * win) / sr);
      runStart = -1;
    }
  }
  if (runStart >= 0) best = Math.max(best, ((lastVoiced - runStart + 1) * win) / sr);
  return Math.min(MAX_PHONATION_SEC, best);
}

type Trial = { duration: number; timestamp: number };
type Phase = "idle" | "waiting" | "phonating" | "done";

const PRIMARY = "var(--primary)";

export default function MptClient() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [currentSec, setCurrentSec] = useState(0);
  const [currentLevel, setCurrentLevel] = useState(0);
  const [liveF0, setLiveF0] = useState<number | null>(null);
  const [trials, setTrials] = useState<Trial[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const phaseRef = useRef<Phase>("idle");
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const phonationStartRef = useRef<number>(0);
  const lastVoicedRef = useRef<number>(0);
  const levelHistRef = useRef<number[]>([]);
  const voicedHistRef = useRef<boolean[]>([]);
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const drawWave = useCallback(() => {
    const c = waveCanvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const W = c.width;
    const H = c.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#FBF8F1";
    ctx.fillRect(0, 0, W, H);
    const mid = H / 2;
    ctx.strokeStyle = "#E4DAC4";
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(W, mid);
    ctx.stroke();
    const hist = levelHistRef.current;
    const vh = voicedHistRef.current;
    const maxLevel = 0.12;
    const barW = W / WAVE_CAPACITY;
    for (let i = 0; i < hist.length; i++) {
      const lvl = Math.min(1, hist[i] / maxLevel);
      const barH = Math.max(1, lvl * H * 0.92);
      ctx.fillStyle = vh[i] ? "#5A6E3D" : "#C9BC9C";
      ctx.fillRect(i * barW, mid - barH / 2, Math.max(1, barW - 0.5), barH);
    }
  }, []);

  const stopMic = useCallback(() => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => undefined); audioCtxRef.current = null; }
    analyserRef.current = null;
  }, []);

  const tick = useCallback(() => {
    const a = analyserRef.current;
    if (!a) return;
    const buf = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const r = Math.sqrt(sum / buf.length);
    setCurrentLevel(r);
    const isVoiced = r > VOICE_THRESHOLD;
    const now = performance.now();

    const hist = levelHistRef.current;
    const vh = voicedHistRef.current;
    hist.push(r);
    vh.push(isVoiced);
    if (hist.length > WAVE_CAPACITY) { hist.shift(); vh.shift(); }
    drawWave();
    if (isVoiced) {
      const sr = audioCtxRef.current?.sampleRate ?? 44100;
      const f0 = yinPitch(buf, sr);
      setLiveF0(f0 > 50 && f0 < 500 && isFinite(f0) ? f0 : null);
    } else {
      setLiveF0(null);
    }

    if (phaseRef.current === "waiting") {
      if (isVoiced) {
        phonationStartRef.current = now;
        lastVoicedRef.current = now;
        phaseRef.current = "phonating";
        setPhase("phonating");
      }
    } else if (phaseRef.current === "phonating") {
      if (isVoiced) lastVoicedRef.current = now;
      const elapsed = (lastVoicedRef.current - phonationStartRef.current) / 1000;
      const silenceMs = now - lastVoicedRef.current;
      setCurrentSec(elapsed);
      if (silenceMs >= END_SILENCE_MS && elapsed >= MIN_PHONATION_SEC) {
        setTrials((prev) => [...prev, { duration: elapsed, timestamp: Date.now() }]);
        phaseRef.current = "done";
        setPhase("done");
        stopMic();
        return;
      }
      if (elapsed >= MAX_PHONATION_SEC) {
        setTrials((prev) => [...prev, { duration: elapsed, timestamp: Date.now() }]);
        phaseRef.current = "done";
        setPhase("done");
        stopMic();
        return;
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [stopMic, drawWave]);

  const start = useCallback(async () => {
    setErrorMsg(null);
    setCurrentSec(0);
    setLiveF0(null);
    levelHistRef.current = [];
    voicedHistRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const a = ctx.createAnalyser();
      a.fftSize = 2048;
      a.smoothingTimeConstant = 0;
      analyserRef.current = a;
      src.connect(a);
      phonationStartRef.current = 0;
      lastVoicedRef.current = 0;
      phaseRef.current = "waiting";
      setPhase("waiting");
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      console.error(err);
      setErrorMsg("마이크 접근에 실패했어요. 브라우저 주소창의 마이크 권한을 확인해 주세요.");
    }
  }, [tick]);

  const cancel = useCallback(() => {
    stopMic();
    phaseRef.current = "idle";
    setPhase("idle");
    setCurrentSec(0);
  }, [stopMic]);

  const analyzeFile = useCallback(async (file: File) => {
    setErrorMsg(null);
    try {
      const { data, sampleRate } = await decodeAudioFile(file);
      const dur = mptFromBuffer(data, sampleRate);
      if (dur < MIN_PHONATION_SEC) {
        setErrorMsg(`발성 구간(≥${MIN_PHONATION_SEC}초)을 찾지 못했어요. 지속 모음 발성이 담긴 파일을 사용하세요.`);
        return;
      }
      setTrials((prev) => [...prev, { duration: dur, timestamp: Date.now() }]);
      setCurrentSec(dur);
      phaseRef.current = "done";
      setPhase("done");
    } catch (err) {
      console.error(err);
      setErrorMsg("오디오 파일을 분석할 수 없어요. 다른 파일을 시도하세요.");
    }
  }, []);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file && trials.length < MAX_TRIALS) analyzeFile(file);
  }, [analyzeFile, trials.length]);

  const removeTrial = useCallback((idx: number) => {
    setTrials((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const downloadMptReport = useCallback(() => {
    if (trials.length === 0) return;
    const m = trials.reduce((a, b) => a + b.duration, 0) / trials.length;
    const mx = Math.max(...trials.map((t) => t.duration));
    const mn = Math.min(...trials.map((t) => t.duration));
    const s = trials.length > 1
      ? Math.sqrt(trials.reduce((acc, t) => acc + (t.duration - m) ** 2, 0) / (trials.length - 1))
      : 0;
    downloadReport({
      title: "MPT — 최대발성지속시간 리포트",
      subtitle: `${trials.length}회 측정`,
      sections: [
        { heading: "측정 요약", rows: [
          { label: "평균 MPT", value: `${m.toFixed(2)} 초` },
          { label: "최대", value: `${mx.toFixed(2)} 초` },
          { label: "최소", value: `${mn.toFixed(2)} 초` },
          { label: "표준편차", value: `${s.toFixed(2)} 초` },
        ] },
        { heading: "시도별 기록", rows: trials.map((t, i) => ({ label: `${i + 1}회차`, value: `${t.duration.toFixed(2)} 초` })) },
      ],
      footnote: "참고 정상범위 — 성인 남 25–35초, 성인 여 15–25초 (Hirano 1981; 보은아 외 2023). 발성을 멈추면 0.5초 후 자동 종료되며 최댓값을 지표로 사용합니다.",
    }, "MPT");
  }, [trials]);

  const resetAll = useCallback(() => {
    stopMic();
    setTrials([]);
    setCurrentSec(0);
    phaseRef.current = "idle";
    setPhase("idle");
  }, [stopMic]);

  useEffect(() => () => stopMic(), [stopMic]);

  const mean = trials.length > 0 ? trials.reduce((a, b) => a + b.duration, 0) / trials.length : 0;
  const maxVal = trials.length > 0 ? Math.max(...trials.map((t) => t.duration)) : 0;
  const minVal = trials.length > 0 ? Math.min(...trials.map((t) => t.duration)) : 0;
  const sd = trials.length > 1
    ? Math.sqrt(trials.reduce((acc, t) => acc + (t.duration - mean) * (t.duration - mean), 0) / (trials.length - 1))
    : 0;
  const levelPercent = Math.min(100, (currentLevel / 0.1) * 100);

  const phaseBadge = (() => {
    if (phase === "idle") return { bg: "var(--surface-2)", fg: "var(--text-mute)", t: "대기" };
    if (phase === "waiting") return { bg: "#F4E4C8", fg: "#8A6422", t: "발성 대기" };
    if (phase === "phonating") return { bg: "var(--primary-soft)", fg: "var(--primary)", t: "● 측정 중" };
    return { bg: "#E1ECF4", fg: "#1F4E79", t: "완료" };
  })();

  const bigBtn: React.CSSProperties = {
    width: "100%", borderRadius: 14, padding: "16px 24px", fontSize: 17, fontWeight: 700,
    border: "none", background: PRIMARY, color: "#fff", cursor: "pointer",
  };
  const subBtn: React.CSSProperties = {
    width: "100%", borderRadius: 14, padding: "12px 24px", fontSize: 14, fontWeight: 600,
    border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-soft)", cursor: "pointer",
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {errorMsg && (
        <div style={{ padding: "10px 14px", borderRadius: 10, fontSize: 13.5, lineHeight: 1.6, background: "#F6E4DE", color: "#8A2F1C", border: "1px solid #E6C3B8" }}>{errorMsg}</div>
      )}

      <div className="card">
        <div className="card-body">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>측정 {Math.min(trials.length + 1, MAX_TRIALS)} / {MAX_TRIALS}</h2>
            <span style={{ borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 700, background: phaseBadge.bg, color: phaseBadge.fg }}>{phaseBadge.t}</span>
          </div>

          <div style={{ margin: "28px 0", textAlign: "center" }}>
            <div style={{ fontSize: 72, fontWeight: 800, color: "var(--text)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{currentSec.toFixed(1)}</div>
            <div style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 16, fontSize: 18, color: "var(--text-mute)" }}>
              <span>초</span>
              {(phase === "waiting" || phase === "phonating") && (
                <span style={{ fontSize: 15, fontWeight: 700, color: "var(--primary)", fontVariantNumeric: "tabular-nums" }}>
                  음도 {liveF0 ? `${liveF0.toFixed(0)} Hz · ${freqToNoteName(liveF0)}` : "—"}
                </span>
              )}
            </div>
          </div>

          {(phase === "waiting" || phase === "phonating") && (
            <div style={{ display: "grid", gap: 12, marginBottom: 20 }}>
              <div>
                <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--text-mute)" }}>실시간 파형 (초록 = 발성 감지)</p>
                <canvas ref={waveCanvasRef} width={600} height={110} style={{ width: "100%", borderRadius: 10, border: "1px solid var(--border)" }} />
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-mute)", marginBottom: 4 }}>
                  <span>마이크 입력 레벨</span><span>{(currentLevel * 1000).toFixed(0)}</span>
                </div>
                <div style={{ position: "relative", height: 12, overflow: "hidden", borderRadius: 999, background: "var(--surface-2)" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, height: "100%", transition: "width 60ms", background: currentLevel > VOICE_THRESHOLD ? PRIMARY : "var(--border-strong)", width: `${levelPercent}%` }} />
                  <div style={{ position: "absolute", top: 0, height: "100%", width: 1, background: "#C0492F", left: `${(VOICE_THRESHOLD / 0.1) * 100}%` }} title="발성 감지 임계값" />
                </div>
              </div>
            </div>
          )}

          {phase === "idle" && (
            <div style={{ display: "grid", gap: 12 }}>
              <button onClick={start} disabled={trials.length >= MAX_TRIALS} style={{ ...bigBtn, opacity: trials.length >= MAX_TRIALS ? 0.5 : 1 }}>
                {trials.length === 0 ? "측정 시작" : trials.length >= MAX_TRIALS ? "3회 측정 완료" : `${trials.length + 1}회 측정 시작`}
              </button>
              {trials.length < MAX_TRIALS && (
                <label style={{ display: "flex", cursor: "pointer", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, border: "2px dashed var(--border-strong)", background: "var(--surface-2)", padding: "12px 24px", fontSize: 14, fontWeight: 500, color: "var(--text-soft)" }}>
                  📁 또는 발성 녹음 파일 업로드 (최장 지속발성 자동 측정)
                  <input type="file" accept="audio/*" onChange={onFileChange} style={{ display: "none" }} />
                </label>
              )}
            </div>
          )}
          {phase === "waiting" && (
            <div style={{ display: "grid", gap: 12 }}>
              <p style={{ textAlign: "center", fontSize: 14, fontWeight: 600, color: "#8A6422", margin: 0 }}>&quot;아—&quot; 발성을 시작하세요 (자동 감지)</p>
              <button onClick={cancel} style={subBtn}>취소</button>
            </div>
          )}
          {phase === "phonating" && (
            <div style={{ display: "grid", gap: 12 }}>
              <p style={{ textAlign: "center", fontSize: 14, fontWeight: 600, color: "var(--primary)", margin: 0 }}>● 측정 중 — 계속 발성하세요</p>
              <button onClick={cancel} style={subBtn}>취소</button>
            </div>
          )}
          {phase === "done" && (
            <div style={{ display: "grid", gap: 12 }}>
              <p style={{ textAlign: "center", fontSize: 14, fontWeight: 600, color: "#1F4E79", margin: 0 }}>✓ 이번 회기: {currentSec.toFixed(2)}초</p>
              {trials.length < MAX_TRIALS && (
                <button onClick={start} style={bigBtn}>다음 측정 ({trials.length + 1}/{MAX_TRIALS})</button>
              )}
              {trials.length < MAX_TRIALS && (
                <label style={{ display: "flex", cursor: "pointer", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface)", padding: "12px 24px", fontSize: 14, fontWeight: 500, color: "var(--text-soft)" }}>
                  📁 파일 업로드로 다음 측정
                  <input type="file" accept="audio/*" onChange={onFileChange} style={{ display: "none" }} />
                </label>
              )}
              {trials.length >= MAX_TRIALS && (
                <button onClick={() => { phaseRef.current = "idle"; setPhase("idle"); }} style={subBtn}>결과 확인</button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>시도 기록</h2>
            {trials.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button onClick={downloadMptReport} className="btn btn-primary btn-sm">📄 리포트 다운로드</button>
                <button onClick={resetAll} style={{ background: "none", border: "none", fontSize: 12, color: "var(--text-mute)", cursor: "pointer" }}>전체 초기화</button>
              </div>
            )}
          </div>
          {trials.length === 0 ? (
            <p style={{ fontSize: 14, color: "var(--text-mute)", margin: 0 }}>아직 측정된 기록이 없어요.</p>
          ) : (
            <>
              <div style={{ display: "grid", gap: 8 }}>
                {trials.map((t, i) => (
                  <div key={t.timestamp} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                      <span style={{ fontWeight: 700, color: "var(--text-soft)" }}>{i + 1}회차</span>
                      <span style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: "var(--primary)" }}>{t.duration.toFixed(2)} 초</span>
                    </div>
                    <button onClick={() => removeTrial(i)} style={{ background: "none", border: "none", fontSize: 12, color: "var(--text-mute)", cursor: "pointer" }}>제거</button>
                  </div>
                ))}
              </div>
              {trials.length >= MAX_TRIALS && (
                <div style={{ marginTop: 16, borderRadius: 12, border: "1px solid var(--primary)", background: "var(--primary-soft)", padding: 16 }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "var(--primary)" }}>종합 결과</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 12 }}>
                    <Stat label="평균" value={`${mean.toFixed(2)} 초`} highlight />
                    <Stat label="최대" value={`${maxVal.toFixed(2)} 초`} />
                    <Stat label="최소" value={`${minVal.toFixed(2)} 초`} />
                    <Stat label="표준편차" value={`${sd.toFixed(2)} 초`} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ToolMonitor
        module="mpt"
        getMetrics={() => (trials.length ? { best: Number(maxVal.toFixed(2)), avg: Number(mean.toFixed(2)), count: trials.length } : null)}
        renderSummary={(m) => `평균 ${m.avg ?? "-"}초 · 최고 ${m.best ?? "-"}초 (${m.count ?? "-"}회)`}
      />

      <details className="card" style={{ padding: 0 }}>
        <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600, color: "var(--text-soft)", padding: "14px 18px" }}>참고 정상 범위 + 근거</summary>
        <div style={{ padding: "0 18px 16px", fontSize: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", columnGap: 24, rowGap: 4, color: "var(--text-soft)" }}>
            <div>아동 7세 남자</div><div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>9 – 16 초</div>
            <div>아동 7세 여자</div><div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>8 – 14 초</div>
            <div>성인 남자</div><div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>25 – 35 초</div>
            <div>성인 여자</div><div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>15 – 25 초</div>
          </div>
          <p style={{ marginTop: 12, fontSize: 12, color: "var(--text-mute)" }}>근거: 보은아 외 (2023) 『음성 평가』 / Hirano (1981) Clinical Examination of Voice</p>
        </div>
      </details>

      <details className="card" style={{ padding: 0 }}>
        <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600, color: "var(--text-soft)", padding: "14px 18px" }}>측정 방법 안내</summary>
        <div style={{ padding: "0 18px 16px", fontSize: 14, color: "var(--text-soft)" }}>
          <ol style={{ paddingLeft: 20, margin: 0, lineHeight: 1.8 }}>
            <li>편안한 자세로 앉아 등을 곧게 세웁니다</li>
            <li>&quot;측정 시작&quot; 버튼을 누릅니다</li>
            <li>깊게 숨을 들이마시고 &quot;아—&quot;를 최대한 길게 발성합니다</li>
            <li>발성이 멈추면 0.5초 후 자동 종료됩니다</li>
            <li>3회 반복합니다 (각 회기 사이 30초 이상 휴식 권장)</li>
          </ol>
          <p style={{ marginTop: 8, fontSize: 12, color: "var(--text-mute)" }}>⚠ 주변 소음이 큰 환경에서는 자동 감지 정확도가 떨어질 수 있어요. 조용한 곳에서 측정하세요.</p>
        </div>
      </details>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ borderRadius: 10, border: highlight ? "1px solid var(--primary)" : "1px solid var(--border)", background: "var(--surface)", padding: "8px 12px" }}>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: "var(--text-mute)" }}>{label}</p>
      <p style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: highlight ? "var(--primary)" : "var(--text)" }}>{value}</p>
    </div>
  );
}
