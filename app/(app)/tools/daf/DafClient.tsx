"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MIN_DELAY_MS = 50;
const MAX_DELAY_MS = 500;
const DEFAULT_DELAY_MS = 200;
const PRESET_DELAYS = [50, 100, 150, 200, 250] as const;

export default function DafClient() {
  const [isActive, setIsActive] = useState(false);
  const [delayMs, setDelayMs] = useState(DEFAULT_DELAY_MS);
  const [volume, setVolume] = useState(0.7);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const delayNodeRef = useRef<DelayNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const startTimeRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current !== null) { clearInterval(timerRef.current); timerRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => undefined); audioCtxRef.current = null; }
    sourceRef.current = null;
    delayNodeRef.current = null;
    gainNodeRef.current = null;
    setIsActive(false);
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
      sourceRef.current = source;
      const delay = ctx.createDelay(1.0);
      delay.delayTime.value = delayMs / 1000;
      delayNodeRef.current = delay;
      const gain = ctx.createGain();
      gain.gain.value = volume;
      gainNodeRef.current = gain;
      source.connect(delay);
      delay.connect(gain);
      gain.connect(ctx.destination);
      startTimeRef.current = performance.now();
      setElapsedSec(0);
      timerRef.current = window.setInterval(() => {
        setElapsedSec((performance.now() - startTimeRef.current) / 1000);
      }, 100);
      setIsActive(true);
    } catch (err) {
      console.error(err);
      setErrorMsg("마이크 접근에 실패했어요. 브라우저 주소창의 마이크 권한을 확인해 주세요.");
    }
  }, [delayMs, volume]);

  useEffect(() => {
    if (delayNodeRef.current && audioCtxRef.current) {
      delayNodeRef.current.delayTime.setValueAtTime(delayMs / 1000, audioCtxRef.current.currentTime);
    }
  }, [delayMs]);
  useEffect(() => {
    if (gainNodeRef.current && audioCtxRef.current) {
      gainNodeRef.current.gain.setValueAtTime(volume, audioCtxRef.current.currentTime);
    }
  }, [volume]);
  useEffect(() => () => stop(), [stop]);

  const mm = Math.floor(elapsedSec / 60);
  const ss = Math.floor(elapsedSec % 60);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* 헤드폰 경고 */}
      <div style={{ borderRadius: 14, border: "2px solid #E8C45B", background: "#F4E4C8", padding: 18 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <span style={{ fontSize: 22 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#8A6422" }}>필독: 이어폰·헤드셋 사용 경고</h3>
            <ul style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 13.5, color: "#8A6422", lineHeight: 1.7 }}>
              <li>반드시 이어폰 또는 헤드셋을 착용하세요</li>
              <li>스피커로 들으면 소리가 다시 마이크로 들어가 강한 하울링(삐― 울림)이 생깁니다</li>
              <li>처음에는 볼륨을 낮게 설정하고 점차 올리세요</li>
            </ul>
            <label style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600, color: "#8A6422", cursor: "pointer" }}>
              <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} style={{ width: 16, height: 16 }} />
              이어폰을 착용했으며 경고를 이해했습니다
            </label>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div style={{ padding: "10px 14px", borderRadius: 10, fontSize: 13.5, lineHeight: 1.6, background: "#F6E4DE", color: "#8A2F1C", border: "1px solid #E6C3B8" }}>{errorMsg}</div>
      )}

      <div className="card">
        <div className="card-body">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>지연 설정</h2>
            {isActive && <span style={{ borderRadius: 999, background: "var(--primary-soft)", color: "var(--primary)", padding: "4px 12px", fontSize: 12, fontWeight: 700 }}>● 활성</span>}
          </div>

          <div style={{ textAlign: "center", margin: "8px 0 24px" }}>
            <div style={{ fontSize: 56, fontWeight: 800, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
              {delayMs}<span style={{ marginLeft: 8, fontSize: 22, color: "var(--text-mute)" }}>ms</span>
            </div>
          </div>

          <div className="field" style={{ marginBottom: 16 }}>
            <label>지연 시간</label>
            <input type="range" min={MIN_DELAY_MS} max={MAX_DELAY_MS} step={10} value={delayMs} onChange={(e) => setDelayMs(Number(e.target.value))} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-mute)", marginTop: 4 }}>
              <span>{MIN_DELAY_MS}ms (아주 짧게)</span><span>{MAX_DELAY_MS}ms (긴 지연)</span>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--text-soft)" }}>프리셋</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {PRESET_DELAYS.map((d) => {
                const on = d === delayMs;
                return (
                  <button key={d} onClick={() => setDelayMs(d)} style={{
                    borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                    border: on ? "1px solid var(--primary)" : "1px solid var(--border)",
                    background: on ? "var(--primary-soft)" : "var(--surface)",
                    color: on ? "var(--primary)" : "var(--text-soft)",
                  }}>{d}ms</button>
                );
              })}
            </div>
          </div>

          <div className="field" style={{ marginBottom: 20 }}>
            <label>볼륨: {Math.round(volume * 100)}%</label>
            <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            {!isActive ? (
              <button onClick={start} disabled={!acknowledged} className="btn btn-primary" style={{ flex: 1, padding: "14px", fontSize: 16, opacity: acknowledged ? 1 : 0.4, cursor: acknowledged ? "pointer" : "not-allowed" }}>
                DAF 시작
              </button>
            ) : (
              <button onClick={stop} className="btn" style={{ flex: 1, padding: "14px", fontSize: 16 }}>정지</button>
            )}
          </div>

          {isActive && (
            <div style={{ marginTop: 20, borderRadius: 12, border: "1px solid var(--primary)", background: "var(--primary-soft)", padding: 16, textAlign: "center" }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", color: "var(--primary)", textTransform: "uppercase" }}>경과 시간</p>
              <p style={{ margin: "4px 0 0", fontSize: 28, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: "var(--primary)" }}>
                {mm.toString().padStart(2, "0")}:{ss.toString().padStart(2, "0")}
              </p>
            </div>
          )}
        </div>
      </div>

      <details className="card" style={{ padding: 0 }}>
        <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600, color: "var(--text-soft)", padding: "14px 18px" }}>사용 팁</summary>
        <div style={{ padding: "0 18px 16px", fontSize: 14, color: "var(--text-soft)" }}>
          <ol style={{ paddingLeft: 20, margin: 0, lineHeight: 1.8 }}>
            <li>이어폰·헤드셋을 착용합니다 (필수)</li>
            <li>볼륨을 30% 정도로 낮게 시작합니다</li>
            <li>경고를 확인·체크하고 DAF를 시작합니다</li>
            <li>편안한 수준으로 볼륨을 조절합니다</li>
            <li>지연 시간(보통 150–200ms)을 반응에 맞게 조절합니다</li>
            <li>15–20분 단위로 나눠 연습합니다</li>
          </ol>
        </div>
      </details>
    </div>
  );
}
