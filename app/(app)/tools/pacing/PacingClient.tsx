"use client";

import { useEffect, useRef, useState } from "react";
import { countKoreanSyllables, splitIntoChunks, type ChunkMode } from "@/lib/voice/syllables";

const CHUNK_MODES: ChunkMode[] = ["1어절씩", "2어절씩", "3어절씩", "4어절씩", "전체 문장"];
const DEFAULT_TEXT = "오늘은 날씨가 참 좋아요. 우리 같이 천천히 또박또박 말해 봐요.";

export default function PacingClient() {
  const [text, setText] = useState(DEFAULT_TEXT);
  const [targetSps, setTargetSps] = useState(3.0);
  const [chunkMode, setChunkMode] = useState<ChunkMode>("2어절씩");
  const [pauseSec, setPauseSec] = useState(0.6);

  const [running, setRunning] = useState(false);
  const [runChunks, setRunChunks] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  const timeoutsRef = useRef<number[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);
  const ballRef = useRef<HTMLDivElement | null>(null);

  function clearTimers() {
    timeoutsRef.current.forEach((id) => window.clearTimeout(id));
    timeoutsRef.current = [];
  }

  function playCue() {
    try {
      if (!ctxRef.current) {
        const Ctx: typeof AudioContext =
          window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctxRef.current = new Ctx();
      }
      const ctx = ctxRef.current;
      if (ctx.state === "suspended") void ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      osc.start(now);
      osc.stop(now + 0.12);
    } catch { /* noop */ }
  }

  function setBall(pct: number) {
    if (ballRef.current) ballRef.current.style.width = `${Math.min(100, pct)}%`;
  }

  function stop() {
    clearTimers();
    setRunning(false);
    setActiveIndex(-1);
    setBall(0);
  }

  function start() {
    const chunks = splitIntoChunks(text, chunkMode);
    if (!chunks.length) return;
    clearTimers();
    setRunChunks(chunks);
    setActiveIndex(-1);
    setBall(0);
    setRunning(true);
    // 첫 큐를 위해 오디오 컨텍스트 미리 깨움(사용자 제스처 내).
    playCue();

    const durations = chunks.map((c) => (Math.max(countKoreanSyllables(c), 1) / targetSps) * 1000);
    const total = durations.reduce((a, b) => a + b, 0) + Math.max(chunks.length - 1, 0) * pauseSec * 1000;

    let acc = 0;
    chunks.forEach((_, i) => {
      const startMs = acc;
      const endMs = startMs + durations[i];
      timeoutsRef.current.push(window.setTimeout(() => {
        setActiveIndex(i);
        if (i > 0) playCue(); // 0번은 위에서 이미 울림
      }, startMs));
      timeoutsRef.current.push(window.setTimeout(() => {
        setBall((endMs / total) * 100);
      }, endMs));
      acc = endMs;
      if (i < chunks.length - 1) acc += pauseSec * 1000;
    });

    timeoutsRef.current.push(window.setTimeout(() => {
      setRunning(false);
      setActiveIndex(-1);
    }, total));
  }

  useEffect(() => () => {
    clearTimers();
    try { void ctxRef.current?.close(); } catch { /* noop */ }
  }, []);

  const previewChunks = running ? runChunks : splitIntoChunks(text, chunkMode);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* 설정 */}
      <div className="card">
        <div className="card-body" style={{ display: "grid", gap: 18 }}>
          <div className="field">
            <label>연습 문장</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={running}
              rows={3}
              style={{
                resize: "vertical", padding: "10px 12px", borderRadius: 10,
                border: "1px solid var(--border)", background: "var(--surface)",
                fontSize: 15, lineHeight: 1.6, color: "var(--text)", fontFamily: "inherit",
              }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
            <div className="field">
              <label>목표 말속도 — {targetSps.toFixed(1)} 음절/초</label>
              <input type="range" min={1} max={6} step={0.1} value={targetSps}
                disabled={running} onChange={(e) => setTargetSps(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>끊어 읽기</label>
              <select value={chunkMode} disabled={running}
                onChange={(e) => setChunkMode(e.target.value as ChunkMode)}
                style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 14, color: "var(--text)" }}>
                {CHUNK_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="field">
              <label>묶음 간 쉼 — {pauseSec.toFixed(1)}초</label>
              <input type="range" min={0} max={2} step={0.1} value={pauseSec}
                disabled={running} onChange={(e) => setPauseSec(Number(e.target.value))} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            {!running ? (
              <button className="btn btn-primary" onClick={start} disabled={!text.trim()}>시작</button>
            ) : (
              <button className="btn" onClick={stop}>중지</button>
            )}
          </div>
        </div>
      </div>

      {/* 진행 막대 + 문장 */}
      <div className="card">
        <div className="card-body" style={{ display: "grid", gap: 18 }}>
          <div style={{ height: 14, borderRadius: 7, background: "var(--surface-2)", overflow: "hidden" }}>
            <div ref={ballRef} style={{ height: "100%", width: "0%", background: "var(--primary)", borderRadius: 7, transition: "width 80ms linear" }} />
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 20, lineHeight: 1.8, minHeight: 60 }}>
            {previewChunks.length === 0 ? (
              <span style={{ fontSize: 14, color: "var(--text-mute)" }}>연습 문장을 입력하세요.</span>
            ) : (
              previewChunks.map((c, i) => (
                <span key={i} style={{
                  padding: "2px 10px", borderRadius: 8,
                  background: i === activeIndex ? "var(--primary-soft)" : "transparent",
                  color: i === activeIndex ? "var(--primary)" : (running ? "var(--text-mute)" : "var(--text)"),
                  fontWeight: i === activeIndex ? 800 : 500,
                  transition: "background 80ms, color 80ms",
                }}>
                  {c}
                </span>
              ))
            )}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text-mute)" }}>
            &quot;삐&quot; 소리에 맞춰 묶음을 하나씩 읽어요. 강조된 묶음을 목표 속도로 말하면 됩니다.
          </div>
        </div>
      </div>
    </div>
  );
}
