"use client";

import { useEffect, useRef, useState } from "react";
import { openMic, micSupported, rmsOf, rmsToLevel, type MicHandle } from "@/lib/voice/audio";
import { autoCorrelate, freqToNote } from "@/lib/voice/pitch";

// 말하기 음도 표시 범위(Hz) — 로그 스케일.
const F_MIN = 70;
const F_MAX = 400;
function pitchPercent(freq: number): number {
  if (freq <= 0) return 0;
  const p = (Math.log2(freq / F_MIN) / Math.log2(F_MAX / F_MIN)) * 100;
  return Math.max(0, Math.min(100, p));
}
function levelColor(level: number): string {
  if (level >= 80) return "#C0492F"; // 너무 큼
  if (level >= 30) return "var(--primary)";
  return "var(--border-strong)"; // 작음
}

export default function LoudnessClient() {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const micRef = useRef<MicHandle | null>(null);
  const rafRef = useRef<number | null>(null);
  const bufRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  // 실시간 갱신은 리렌더 없이 DOM 직접 조작.
  const levelBarRef = useRef<HTMLDivElement | null>(null);
  const levelNumRef = useRef<HTMLSpanElement | null>(null);
  const pitchNeedleRef = useRef<HTMLDivElement | null>(null);
  const pitchHzRef = useRef<HTMLSpanElement | null>(null);
  const pitchNoteRef = useRef<HTMLSpanElement | null>(null);

  function stop() {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    micRef.current?.close();
    micRef.current = null;
    setRunning(false);
  }

  async function start() {
    setError(null);
    if (!micSupported()) {
      setError("이 브라우저에서는 마이크를 사용할 수 없어요. 크롬·엣지 최신 버전을 권장해요.");
      return;
    }
    try {
      const mic = await openMic(2048);
      micRef.current = mic;
      bufRef.current = new Float32Array(mic.analyser.fftSize);
      setRunning(true);

      const loop = () => {
        const m = micRef.current;
        const buf = bufRef.current;
        if (!m || !buf) return;
        m.analyser.getFloatTimeDomainData(buf);

        // 강도
        const level = rmsToLevel(rmsOf(buf));
        if (levelBarRef.current) {
          levelBarRef.current.style.width = `${level}%`;
          levelBarRef.current.style.background = levelColor(level);
        }
        if (levelNumRef.current) levelNumRef.current.textContent = String(level);

        // 음도
        const freq = autoCorrelate(buf, m.ctx.sampleRate);
        if (freq > 0) {
          if (pitchNeedleRef.current) pitchNeedleRef.current.style.left = `${pitchPercent(freq)}%`;
          if (pitchHzRef.current) pitchHzRef.current.textContent = `${Math.round(freq)} Hz`;
          if (pitchNoteRef.current) pitchNoteRef.current.textContent = freqToNote(freq);
        } else {
          if (pitchHzRef.current) pitchHzRef.current.textContent = "— Hz";
          if (pitchNoteRef.current) pitchNoteRef.current.textContent = "—";
        }

        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        setError("마이크 권한이 거부됐어요. 브라우저 주소창의 마이크 아이콘에서 허용해 주세요.");
      } else if (name === "NotFoundError") {
        setError("마이크 장치를 찾을 수 없어요. 연결 상태를 확인해 주세요.");
      } else {
        setError("마이크를 여는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.");
      }
      setRunning(false);
    }
  }

  // 언마운트 시 정리.
  useEffect(() => () => stop(), []);

  return (
    <div className="card">
      <div className="card-body" style={{ display: "grid", gap: 24 }}>
        {/* 컨트롤 */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {!running ? (
            <button className="btn btn-primary" onClick={start}>마이크 시작</button>
          ) : (
            <button className="btn" onClick={stop}>중지</button>
          )}
          <span style={{ fontSize: 13, color: "var(--text-mute)" }}>
            {running ? "측정 중 — 말하거나 소리를 내보세요." : "버튼을 누르면 마이크 권한을 요청해요."}
          </span>
        </div>

        {error && (
          <div style={{
            padding: "10px 14px", borderRadius: 10, fontSize: 13.5, lineHeight: 1.6,
            background: "#F6E4DE", color: "#8A2F1C", border: "1px solid #E6C3B8",
          }}>
            {error}
          </div>
        )}

        {/* 강도 */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>강도 (소리 크기)</span>
            <span style={{ fontSize: 13, color: "var(--text-mute)" }}>
              <span ref={levelNumRef} style={{ fontWeight: 800, color: "var(--text)", fontSize: 16 }}>0</span> / 100
            </span>
          </div>
          <div style={{ position: "relative", height: 22, borderRadius: 11, background: "var(--surface-2)", overflow: "hidden" }}>
            <div ref={levelBarRef} style={{ height: "100%", width: "0%", background: "var(--border-strong)", borderRadius: 11, transition: "width 60ms linear" }} />
            {/* 적정 구간 가이드(30~80) */}
            <div style={{ position: "absolute", top: 0, bottom: 0, left: "80%", width: 2, background: "rgba(192,73,47,0.5)" }} />
          </div>
          <div style={{ fontSize: 12, color: "var(--text-mute)", marginTop: 6 }}>
            너무 작으면 회색, 적당하면 초록, 80을 넘으면 빨강으로 표시돼요.
          </div>
        </div>

        {/* 음도 */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>음도 (소리 높낮이)</span>
            <span style={{ fontSize: 13, color: "var(--text-mute)" }}>
              <span ref={pitchHzRef} style={{ fontWeight: 800, color: "var(--text)", fontSize: 16 }}>— Hz</span>
              {" · "}
              <span ref={pitchNoteRef} style={{ fontWeight: 700, color: "var(--primary)" }}>—</span>
            </span>
          </div>
          <div style={{ position: "relative", height: 40, borderRadius: 10, background: "linear-gradient(90deg, var(--surface-2), var(--primary-soft))", overflow: "hidden" }}>
            <div ref={pitchNeedleRef} style={{
              position: "absolute", top: 4, bottom: 4, left: "0%", width: 4,
              borderRadius: 2, background: "var(--primary)", transition: "left 60ms linear",
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-mute)", marginTop: 6 }}>
            <span>낮음 ({F_MIN}Hz)</span>
            <span>높음 ({F_MAX}Hz)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
