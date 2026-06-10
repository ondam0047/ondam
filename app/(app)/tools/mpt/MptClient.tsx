"use client";

import { useEffect, useRef, useState } from "react";
import { openMic, micSupported, rmsOf, rmsToLevel, type MicHandle } from "@/lib/voice/audio";

const ONSET = 0.02;      // 발성 시작 임계(RMS)
const OFFSET = 0.014;    // 발성 종료 임계(RMS)
const HANGOVER_MS = 500; // 이 시간 이상 조용하면 발성 끝으로 판단
const MIN_TRIAL = 0.3;   // 이보다 짧으면 오작동으로 무시(초)

type Phase = "idle" | "armed" | "phonating";

export default function MptClient() {
  const [name, setName] = useState("");
  const [micOn, setMicOn] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [trials, setTrials] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const micRef = useRef<MicHandle | null>(null);
  const rafRef = useRef<number | null>(null);
  const bufRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  const phaseRef = useRef<Phase>("idle");
  const onsetRef = useRef(0);
  const lastVoiceRef = useRef(0);

  const levelBarRef = useRef<HTMLDivElement | null>(null);
  const elapsedRef = useRef<HTMLSpanElement | null>(null);

  function setPhaseBoth(p: Phase) { phaseRef.current = p; setPhase(p); }

  function stopMic() {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    micRef.current?.close();
    micRef.current = null;
    setMicOn(false);
    setPhaseBoth("idle");
  }

  function finishTrial(dur: number) {
    setPhaseBoth("idle");
    if (elapsedRef.current) elapsedRef.current.textContent = "0.0";
    if (dur >= MIN_TRIAL) setTrials((t) => [...t, Number(dur.toFixed(1))]);
  }

  async function startMic() {
    setError(null);
    if (!micSupported()) {
      setError("이 브라우저에서는 마이크를 사용할 수 없어요. 크롬·엣지 최신 버전을 권장해요.");
      return;
    }
    try {
      const mic = await openMic(2048);
      micRef.current = mic;
      bufRef.current = new Float32Array(mic.analyser.fftSize);
      setMicOn(true);
      setPhaseBoth("idle");

      const loop = () => {
        const m = micRef.current;
        const buf = bufRef.current;
        if (!m || !buf) return;
        m.analyser.getFloatTimeDomainData(buf);
        const rms = rmsOf(buf);
        if (levelBarRef.current) levelBarRef.current.style.width = `${rmsToLevel(rms)}%`;

        const now = performance.now();
        if (phaseRef.current === "armed") {
          if (rms > ONSET) {
            onsetRef.current = now;
            lastVoiceRef.current = now;
            setPhaseBoth("phonating");
          }
        } else if (phaseRef.current === "phonating") {
          if (rms > OFFSET) lastVoiceRef.current = now;
          if (elapsedRef.current) {
            elapsedRef.current.textContent = ((now - onsetRef.current) / 1000).toFixed(1);
          }
          if (now - lastVoiceRef.current > HANGOVER_MS) {
            finishTrial((lastVoiceRef.current - onsetRef.current) / 1000);
          }
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      const n = (e as DOMException)?.name;
      setError(
        n === "NotAllowedError" || n === "SecurityError"
          ? "마이크 권한이 거부됐어요. 주소창의 마이크 아이콘에서 허용해 주세요."
          : n === "NotFoundError" ? "마이크 장치를 찾을 수 없어요."
          : "마이크를 여는 중 문제가 생겼어요."
      );
      stopMic();
    }
  }

  function arm() { setPhaseBoth("armed"); }
  function manualStop() {
    if (phaseRef.current === "phonating") {
      finishTrial((performance.now() - onsetRef.current) / 1000);
    } else {
      setPhaseBoth("idle");
    }
  }
  function reset() { setTrials([]); }

  function downloadReport() {
    if (!trials.length) return;
    const best = Math.max(...trials);
    const avg = trials.reduce((a, b) => a + b, 0) / trials.length;
    const now = new Date().toLocaleString("ko-KR");
    const lines = [
      "MPT(최대발성지속시간) 측정 결과",
      "──────────────────────",
      name.trim() ? `대상자: ${name.trim()}` : null,
      `측정 시각: ${now}`,
      "",
      ...trials.map((t, i) => `${i + 1}회: ${t.toFixed(1)} 초`),
      "",
      `최고: ${best.toFixed(1)} 초`,
      `평균: ${avg.toFixed(1)} 초`,
      "",
      "※ 본 자료는 의료 진단·치료를 제공·대체하지 않는 학습·연습·시각화 보조 자료입니다.",
    ].filter(Boolean);
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `MPT측정_${name.trim() || "결과"}_${now.replace(/[^0-9]/g, "").slice(0, 12)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => () => stopMic(), []);

  const best = trials.length ? Math.max(...trials) : 0;
  const avg = trials.length ? trials.reduce((a, b) => a + b, 0) / trials.length : 0;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <div className="card-body" style={{ display: "grid", gap: 18 }}>
          <div className="field" style={{ maxWidth: 320 }}>
            <label>대상자 (선택 — 보고서 표기용)</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 홍길동"
              style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 14, color: "var(--text)" }} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {!micOn ? (
              <button className="btn btn-primary" onClick={startMic}>마이크 시작</button>
            ) : (
              <>
                {phase === "idle" && <button className="btn btn-primary" onClick={arm}>측정 시작</button>}
                {phase === "armed" && <button className="btn" onClick={manualStop}>취소</button>}
                {phase === "phonating" && <button className="btn" onClick={manualStop}>수동 종료</button>}
                <button className="btn" onClick={stopMic}>마이크 중지</button>
              </>
            )}
          </div>

          {error && (
            <div style={{ padding: "10px 14px", borderRadius: 10, fontSize: 13.5, lineHeight: 1.6, background: "#F6E4DE", color: "#8A2F1C", border: "1px solid #E6C3B8" }}>
              {error}
            </div>
          )}

          {micOn && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>
                  {phase === "armed" ? "대기 중 — 소리를 길게 내보세요" : phase === "phonating" ? "측정 중…" : "마이크 입력"}
                </span>
                <span style={{ fontSize: 13, color: "var(--text-mute)" }}>
                  <span ref={elapsedRef} style={{ fontWeight: 800, color: "var(--primary)", fontSize: 22 }}>0.0</span> 초
                </span>
              </div>
              <div style={{ height: 16, borderRadius: 8, background: "var(--surface-2)", overflow: "hidden" }}>
                <div ref={levelBarRef} style={{ height: "100%", width: "0%", background: "var(--primary)", borderRadius: 8, transition: "width 60ms linear" }} />
              </div>
              <div style={{ fontSize: 12, color: "var(--text-mute)", marginTop: 6 }}>
                “측정 시작”을 누른 뒤 소리를 내면 자동으로 시간이 재지고, 소리가 멈추면 자동 종료돼요.
              </div>
            </div>
          )}
        </div>
      </div>

      {trials.length > 0 && (
        <div className="card">
          <div className="card-body" style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 13, color: "var(--text-mute)" }}>최고 기록</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: "var(--primary)", lineHeight: 1.1 }}>
                  {best.toFixed(1)}<span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-mute)" }}> 초</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: "var(--text-mute)" }}>평균 ({trials.length}회)</div>
                <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.1 }}>
                  {avg.toFixed(1)}<span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-mute)" }}> 초</span>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {trials.map((t, i) => (
                <span key={i} className="badge badge-mute" style={{ fontSize: 13, padding: "6px 12px" }}>
                  {i + 1}회 · {t.toFixed(1)}초
                </span>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={downloadReport}>결과 보고서 (.txt) 다운로드</button>
              <button className="btn" onClick={reset}>기록 초기화</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
