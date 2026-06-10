"use client";

import { useEffect, useRef, useState } from "react";
import { openMic, micSupported, rmsOf, rmsToLevel, type MicHandle } from "@/lib/voice/audio";

export default function DafClient() {
  const [running, setRunning] = useState(false);
  const [delayMs, setDelayMs] = useState(180);
  const [volume, setVolume] = useState(0.9);
  const [error, setError] = useState<string | null>(null);

  const micRef = useRef<MicHandle | null>(null);
  const delayRef = useRef<DelayNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const bufRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const levelBarRef = useRef<HTMLDivElement | null>(null);

  function stop() {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    try { delayRef.current?.disconnect(); } catch { /* noop */ }
    try { gainRef.current?.disconnect(); } catch { /* noop */ }
    delayRef.current = null;
    gainRef.current = null;
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
      const mic = await openMic(1024);
      micRef.current = mic;

      const delay = mic.ctx.createDelay(1.0);
      delay.delayTime.value = delayMs / 1000;
      const gain = mic.ctx.createGain();
      gain.gain.value = volume;
      // 원음 → 지연 → 볼륨 → 출력
      mic.source.connect(delay);
      delay.connect(gain);
      gain.connect(mic.ctx.destination);
      delayRef.current = delay;
      gainRef.current = gain;

      bufRef.current = new Float32Array(mic.analyser.fftSize);
      setRunning(true);

      const loop = () => {
        const m = micRef.current;
        const buf = bufRef.current;
        if (!m || !buf) return;
        m.analyser.getFloatTimeDomainData(buf);
        if (levelBarRef.current) levelBarRef.current.style.width = `${rmsToLevel(rmsOf(buf))}%`;
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
      stop();
    }
  }

  function onDelayChange(v: number) {
    setDelayMs(v);
    if (delayRef.current && micRef.current) {
      delayRef.current.delayTime.setValueAtTime(v / 1000, micRef.current.ctx.currentTime);
    }
  }
  function onVolumeChange(v: number) {
    setVolume(v);
    if (gainRef.current) gainRef.current.gain.value = v;
  }

  useEffect(() => () => stop(), []);

  return (
    <div className="card">
      <div className="card-body" style={{ display: "grid", gap: 18 }}>
        {/* 이어폰 경고 */}
        <div style={{ padding: "10px 14px", borderRadius: 10, fontSize: 13, lineHeight: 1.6, background: "#F4E4C8", color: "#8A6422", border: "1px solid #E8D097" }}>
          ⚠ 반드시 <b>이어폰·헤드셋</b>을 착용하세요. 스피커로 들으면 소리가 다시 마이크로 들어가 howling(삐― 울림)이 생길 수 있어요.
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {!running ? (
            <button className="btn btn-primary" onClick={start}>시작</button>
          ) : (
            <button className="btn" onClick={stop}>중지</button>
          )}
          <span style={{ fontSize: 13, color: "var(--text-mute)" }}>
            {running ? "이어폰으로 약간 늦게 들리는 자기 목소리에 맞춰 말해 보세요." : "버튼을 누르면 마이크 권한을 요청해요."}
          </span>
        </div>

        {error && (
          <div style={{ padding: "10px 14px", borderRadius: 10, fontSize: 13.5, lineHeight: 1.6, background: "#F6E4DE", color: "#8A2F1C", border: "1px solid #E6C3B8" }}>
            {error}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 18 }}>
          <div className="field">
            <label>지연 시간 — {delayMs} ms</label>
            <input type="range" min={50} max={500} step={10} value={delayMs}
              onChange={(e) => onDelayChange(Number(e.target.value))} />
            <span style={{ fontSize: 12, color: "var(--text-mute)" }}>보통 150–200ms에서 효과가 큽니다.</span>
          </div>
          <div className="field">
            <label>출력 볼륨 — {Math.round(volume * 100)}%</label>
            <input type="range" min={0} max={1} step={0.05} value={volume}
              onChange={(e) => onVolumeChange(Number(e.target.value))} />
          </div>
        </div>

        <div>
          <div style={{ fontSize: 13, color: "var(--text-mute)", marginBottom: 6 }}>마이크 입력</div>
          <div style={{ height: 14, borderRadius: 7, background: "var(--surface-2)", overflow: "hidden" }}>
            <div ref={levelBarRef} style={{ height: "100%", width: "0%", background: "var(--primary)", borderRadius: 7, transition: "width 60ms linear" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
