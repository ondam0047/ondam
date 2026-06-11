"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyzeSibilantSpectrum } from "@/lib/voice/spectralMoments";
import { downloadReport } from "@/lib/voice/report";
import ToolMonitor from "../ToolMonitor";

// 스펙트럼 중심 구간·조음 정보
// 근거: Jongman/Wayland/Wong (2000) JASA, Shadle (1991), Kong & Edwards (2016), Park (2008)
type TargetId = "sh" | "palatalized" | "s";
type TargetInfo = {
  id: TargetId; label: string; min: number; max: number; color: string;
  description: string; tip: string;
};

const TARGETS: Record<TargetId, TargetInfo> = {
  sh: {
    id: "sh", label: "왜곡 /ʃ/", min: 2800, max: 4500, color: "#D98E2B",
    description: "한국어에는 없는 음소. 아동이 ㅅ을 경구개에 접근시켜 자주 왜곡해요.",
    tip: "혀를 더 앞(치조)으로 옮기고 입술 둥글림을 풀어 /s/ 쪽으로 이동을 유도하세요.",
  },
  palatalized: {
    id: "palatalized", label: "구개음화 /ɕ/", min: 4500, max: 5500, color: "#9A6FB0",
    description: "ㅅ + ㅣ/ㅑ/ㅕ 조합에서 자연스러운 구개음화 변이예요(‘시’, ‘쉬’ 등).",
    tip: "모음이 i/y 계열일 때는 정상 변이예요. 그 외 모음 앞에서는 /s/ 영역으로 유도하세요.",
  },
  s: {
    id: "s", label: "표준 /s/", min: 5500, max: 8500, color: "#5A6E3D",
    description: "평음 치조마찰음. 아동 조음 학습에서 가장 흔한 목표 음소예요.",
    tip: "혀끝을 윗잇몸 아래에, 혀 양쪽은 윗어금니에 접촉. 입술을 옆으로 펴면 중심 주파수가 더 높아져요.",
  },
};

const GAUGE_MIN = 2000;
const GAUGE_MAX = 9500;
const EMA_ALPHA = 0.55;
const HIST_BUCKETS = 30;
const HIST_MIN = 2000;
const HIST_MAX = 9500;
const HIST_BUCKET_WIDTH = (HIST_MAX - HIST_MIN) / HIST_BUCKETS;

type Stats = { samples: number; inS: number; inSh: number; inPal: number; centroidSum: number; centroidSqSum: number; histogram: number[]; };

function freqToX(f: number, w: number, padL: number, padR: number): number {
  const inner = w - padL - padR;
  const ratio = (Math.min(GAUGE_MAX, Math.max(GAUGE_MIN, f)) - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN);
  return padL + inner * ratio;
}
function emptyStats(): Stats {
  return { samples: 0, inS: 0, inSh: 0, inPal: 0, centroidSum: 0, centroidSqSum: 0, histogram: new Array(HIST_BUCKETS).fill(0) };
}

export default function SpectrogramClient() {
  const [isRecording, setIsRecording] = useState(false);
  const [centroid, setCentroid] = useState<number | null>(null);
  const [isFricative, setIsFricative] = useState(false);
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<TargetId>("s");
  const [subj, setSubj] = useState<{ subject: string | null; clinician: string }>({ subject: null, clinician: "" });

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const smoothRef = useRef<number | null>(null);
  const statsRef = useRef<Stats>(emptyStats());

  const stop = useCallback(() => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => undefined); audioCtxRef.current = null; }
    analyserRef.current = null;
    smoothRef.current = null;
    setIsRecording(false);
  }, []);

  const tick = useCallback(() => {
    const a = analyserRef.current;
    const ctx = audioCtxRef.current;
    if (!a || !ctx) return;
    const freq = new Float32Array(a.frequencyBinCount);
    a.getFloatFrequencyData(freq);
    const r = analyzeSibilantSpectrum(freq, ctx.sampleRate);
    if (r.isFricative) {
      const sm = smoothRef.current === null ? r.centroid : EMA_ALPHA * smoothRef.current + (1 - EMA_ALPHA) * r.centroid;
      smoothRef.current = sm;
      setCentroid(sm);
      setIsFricative(true);
      const s = statsRef.current;
      s.samples += 1;
      s.centroidSum += sm;
      s.centroidSqSum += sm * sm;
      if (sm >= TARGETS.s.min && sm <= TARGETS.s.max) s.inS += 1;
      else if (sm >= TARGETS.sh.min && sm <= TARGETS.sh.max) s.inSh += 1;
      else if (sm >= TARGETS.palatalized.min && sm <= TARGETS.palatalized.max) s.inPal += 1;
      if (sm >= HIST_MIN && sm < HIST_MAX) {
        const idx = Math.floor((sm - HIST_MIN) / HIST_BUCKET_WIDTH);
        s.histogram[idx] += 1;
      }
      setStats({ ...s, histogram: [...s.histogram] });
    } else {
      setIsFricative(false);
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

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
      const a = ctx.createAnalyser();
      a.fftSize = 4096;
      a.smoothingTimeConstant = 0.3;
      analyserRef.current = a;
      source.connect(a);
      smoothRef.current = null;
      statsRef.current = emptyStats();
      setStats(emptyStats());
      setIsRecording(true);
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      console.error(err);
      setErrorMsg("마이크 접근에 실패했어요. 브라우저 주소창의 마이크 권한을 확인해 주세요.");
    }
  }, [tick]);

  useEffect(() => () => stop(), [stop]);

  const reset = useCallback(() => {
    statsRef.current = emptyStats();
    setStats(emptyStats());
    smoothRef.current = null;
    setCentroid(null);
  }, []);

  const meanCentroid = stats.samples > 0 ? stats.centroidSum / stats.samples : 0;
  const sdCentroid = stats.samples > 1
    ? Math.sqrt(Math.max(0, stats.centroidSqSum / stats.samples - meanCentroid * meanCentroid))
    : 0;

  const target = TARGETS[targetId];
  const currentZone = useMemo<TargetId | null>(() => {
    if (centroid === null || !isFricative) return null;
    if (centroid >= TARGETS.s.min && centroid <= TARGETS.s.max) return "s";
    if (centroid >= TARGETS.sh.min && centroid <= TARGETS.sh.max) return "sh";
    if (centroid >= TARGETS.palatalized.min && centroid <= TARGETS.palatalized.max) return "palatalized";
    return null;
  }, [centroid, isFricative]);

  const feedback = useMemo(() => {
    if (!isFricative || centroid === null) return { msg: "마찰음을 길게 내보세요 (예: 스―)", tone: "neutral" as const };
    if (currentZone === targetId) return { msg: `✨ 좋아요! ${target.label} 구간입니다`, tone: "good" as const };
    if (currentZone === null) return { msg: "중간 영역 — 혀 위치를 조절해 보세요", tone: "warn" as const };
    return { msg: `다른 구간(${TARGETS[currentZone].label})에 있어요`, tone: "bad" as const };
  }, [isFricative, centroid, currentZone, targetId, target]);

  const downloadSibReport = useCallback(() => {
    if (stats.samples === 0) return;
    const pct = (n: number) => ((n / stats.samples) * 100).toFixed(1);
    downloadReport({
      title: "/s/ 스펙트럼 중심 분석 리포트",
      subtitle: `목표 음소: ${target.label} · 누적 ${stats.samples} 샘플`,
      meta: { subject: subj.subject ?? undefined, clinician: subj.clinician || undefined },
      sections: [
        { heading: "측정 요약", rows: [
          { label: "평균 스펙트럼 중심", value: `${meanCentroid.toFixed(0)} Hz` },
          { label: "표준편차", value: `± ${sdCentroid.toFixed(0)} Hz` },
          { label: "목표 구간 체류", value: `${pct(targetId === "s" ? stats.inS : targetId === "sh" ? stats.inSh : stats.inPal)} %` },
        ] },
        { heading: "구간별 분포", rows: [
          { label: "표준 /s/ (5500–8500Hz)", value: `${pct(stats.inS)} %` },
          { label: "구개음화 /ɕ/ (4500–5500Hz)", value: `${pct(stats.inPal)} %` },
          { label: "왜곡 /ʃ/ (2800–4500Hz)", value: `${pct(stats.inSh)} %` },
        ] },
      ],
      footnote: "스펙트럼 중심(centroid)이 높을수록 /s/에 가깝습니다. 근거: Jongman/Wayland/Wong (2000), Shadle (1991), Kong & Edwards (2016), Park (2008).",
    }, "스펙트럼중심");
  }, [stats, target, targetId, meanCentroid, sdCentroid, subj]);

  const W = 760, H = 220, PADL = 40, PADR = 40, PADT = 30, PADB = 100;
  const zoneXs = (t: TargetInfo) => ({ x1: freqToX(t.min, W, PADL, PADR), x2: freqToX(t.max, W, PADL, PADR) });
  const centroidX = centroid !== null ? freqToX(centroid, W, PADL, PADR) : null;
  const meanX = stats.samples > 5 ? freqToX(meanCentroid, W, PADL, PADR) : null;
  const histMax = Math.max(1, ...stats.histogram);

  const fbStyle = {
    good: { bg: "var(--primary-soft)", fg: "var(--primary)", bd: "var(--primary)" },
    warn: { bg: "#F4E4C8", fg: "#8A6422", bd: "#E8D097" },
    bad: { bg: "#F6E4DE", fg: "#8A2F1C", bd: "#E6C3B8" },
    neutral: { bg: "var(--surface-2)", fg: "var(--text-soft)", bd: "var(--border)" },
  }[feedback.tone];

  const segBtn = (active: boolean, color: string): React.CSSProperties => ({
    padding: "7px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none",
    background: active ? color : "var(--surface)", color: active ? "#fff" : "var(--text-soft)",
  });

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <div className="card-body" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-soft)" }}>목표 음소</span>
            <div style={{ display: "flex", overflow: "hidden", borderRadius: 8, border: "1px solid var(--border)" }}>
              {(Object.keys(TARGETS) as TargetId[]).map((id) => (
                <button key={id} onClick={() => setTargetId(id)} style={segBtn(id === targetId, TARGETS[id].color)}>{TARGETS[id].label}</button>
              ))}
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {!isRecording ? (
              <button className="btn btn-primary" onClick={start}>시작</button>
            ) : (
              <button className="btn" onClick={stop} style={{ borderColor: "#C0492F", color: "#C0492F" }}>정지</button>
            )}
            <button className="btn" onClick={reset} disabled={isRecording || stats.samples === 0}>세션 초기화</button>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div style={{ padding: "10px 14px", borderRadius: 10, fontSize: 13.5, lineHeight: 1.6, background: "#F6E4DE", color: "#8A2F1C", border: "1px solid #E6C3B8" }}>{errorMsg}</div>
      )}

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)" }}>
        <div style={{ display: "grid", gap: 16 }}>
          <div className="card" style={{ overflowX: "auto" }}>
            <div className="card-body" style={{ minWidth: 0 }}>
              <div style={{ minWidth: 560 }}>
                <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%" }}>
                  <rect x={PADL} y={PADT} width={W - PADL - PADR} height={H - PADT - PADB} fill="#FBF8F1" stroke="#C9BC9C" />
                  {(Object.keys(TARGETS) as TargetId[]).map((id) => {
                    const t = TARGETS[id];
                    const { x1, x2 } = zoneXs(t);
                    return (
                      <g key={id}>
                        <rect x={x1} y={PADT} width={x2 - x1} height={H - PADT - PADB} fill={t.color} opacity={id === targetId ? 0.35 : 0.16} />
                        <text x={(x1 + x2) / 2} y={PADT + 16} textAnchor="middle" fontSize={13} fontWeight={700} fill={t.color}>{t.label}</text>
                      </g>
                    );
                  })}
                  {[2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000].map((f) => {
                    const x = freqToX(f, W, PADL, PADR);
                    return (
                      <g key={f}>
                        <line x1={x} x2={x} y1={H - PADB} y2={H - PADB + 5} stroke="#94A38B" />
                        <text x={x} y={H - PADB + 20} textAnchor="middle" fontSize={12} fill="#5A5E4E">{f}</text>
                      </g>
                    );
                  })}
                  <text x={W / 2} y={H - PADB + 38} textAnchor="middle" fontSize={13} fill="#3D4A2A" fontWeight={500}>스펙트럼 중심 (Hz)</text>
                  {stats.histogram.map((count, i) => {
                    if (count === 0) return null;
                    const x = freqToX(HIST_MIN + i * HIST_BUCKET_WIDTH, W, PADL, PADR);
                    const xNext = freqToX(HIST_MIN + (i + 1) * HIST_BUCKET_WIDTH, W, PADL, PADR);
                    const bw = Math.max(1, xNext - x - 1);
                    const bh = (count / histMax) * 35;
                    return <rect key={`h-${i}`} x={x} y={H - PADB + 50} width={bw} height={bh} fill="#5A5E4E" opacity={0.7} />;
                  })}
                  {stats.samples > 0 && (
                    <text x={PADL} y={H - PADB + 60} fontSize={10} fill="#8C8D7B">세션 누적 분포 ({stats.samples} samples)</text>
                  )}
                  {meanX !== null && (
                    <g>
                      <line x1={meanX} x2={meanX} y1={PADT} y2={H - PADB} stroke="#5A5E4E" strokeDasharray="4 3" strokeWidth={1.5} />
                      <text x={meanX} y={PADT - 6} textAnchor="middle" fontSize={11} fill="#5A5E4E" fontWeight={600}>평균 {meanCentroid.toFixed(0)}</text>
                    </g>
                  )}
                  {centroidX !== null && isFricative && (
                    <g>
                      <line x1={centroidX} x2={centroidX} y1={PADT} y2={H - PADB} stroke="#1F2317" strokeWidth={2.5} />
                      <circle cx={centroidX} cy={(PADT + H - PADB) / 2} r={11} fill="#1F2317" stroke="white" strokeWidth={2.5} />
                      <text x={centroidX} y={H - PADB - 10} textAnchor="middle" fontSize={13} fontWeight={700} fill="#1F2317">{centroid !== null ? `${centroid.toFixed(0)} Hz` : ""}</text>
                    </g>
                  )}
                </svg>
              </div>
            </div>
          </div>

          <div style={{ borderRadius: 14, border: `1px solid ${fbStyle.bd}`, background: fbStyle.bg, color: fbStyle.fg, padding: "14px 20px", textAlign: "center", fontSize: 16, fontWeight: 700 }}>
            {feedback.msg}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
            <Box label="현재 중심" value={centroid !== null && isFricative ? `${centroid.toFixed(0)} Hz` : "-"} />
            <Box label="세션 평균" value={stats.samples > 5 ? `${meanCentroid.toFixed(0)} ± ${sdCentroid.toFixed(0)}` : "-"} />
            <Box label="목표 구간 체류" value={stats.samples > 0 ? `${(((targetId === "s" ? stats.inS : targetId === "sh" ? stats.inSh : stats.inPal) / stats.samples) * 100).toFixed(1)} %` : "-"} />
          </div>

          {stats.samples > 0 && (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <button className="btn btn-primary" onClick={downloadSibReport}>📄 리포트 다운로드</button>
              <span style={{ fontSize: 12, color: "var(--text-mute)" }}>HTML 리포트로 저장 → 열어서 인쇄/PDF 가능</span>
            </div>
          )}
        </div>

        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <div className="card">
            <div className="card-body" style={{ display: "grid", gap: 12 }}>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>목표 음소 — {target.label}</h4>
              <div>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--text-mute)" }}>설명</p>
                <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--text)", lineHeight: 1.6 }}>{target.description}</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--primary)" }}>유도 방법</p>
                <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--text)", lineHeight: 1.6 }}>{target.tip}</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--text-mute)" }}>참조 구간</p>
                <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--text)" }}>{target.min}–{target.max} Hz</p>
              </div>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 11.5, color: "var(--text-mute)", lineHeight: 1.6 }}>
            근거: Jongman/Wayland/Wong (2000), Shadle (1991), Kong &amp; Edwards (2016), Park (2008). 음소 수준이 가장 안정적이며, 단어·문장은 일부 애매할 수 있어요.
          </p>
        </div>
      </div>

      {stats.samples > 0 && (
        <ToolMonitor
          module="spectrogram"
          getMetrics={() => {
            const inTarget = targetId === "s" ? stats.inS : targetId === "sh" ? stats.inSh : stats.inPal;
            return { centroid: Math.round(meanCentroid), targetPct: Number(((inTarget / stats.samples) * 100).toFixed(1)), target: target.label };
          }}
          renderSummary={(m) => `중심 ${m.centroid ?? "-"}Hz · 목표 체류 ${m.targetPct ?? "-"}%`}
          trend={{ key: "centroid", label: "스펙트럼 중심", unit: "Hz" }}
          onSubject={(subject, clinician) => setSubj({ subject, clinician })}
        />
      )}
    </div>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface-2)", padding: "12px 14px" }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "var(--text-mute)" }}>{label}</p>
      <p style={{ margin: "4px 0 0", fontSize: 19, fontWeight: 800, color: "var(--text)" }}>{value}</p>
    </div>
  );
}
