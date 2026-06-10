"use client";

import { useEffect, useRef, useState } from "react";
import { openMic, micSupported, type MicHandle } from "@/lib/voice/audio";

const MAX_FREQ = 10000; // 표시 상한(Hz) — 말소리·마찰음 범위
const SBAND_LO = 4000;
const SBAND_HI = 8000;

// 에너지(0~255) → 색. 흰 배경 위에 초록(강함)으로.
function energyColor(v: number): string {
  const a = (v / 255) ** 1.4; // 약한 잡음 억제
  if (v > 200) return `rgba(183,146,104,${a})`; // 매우 강함 = 강조색
  return `rgba(90,110,61,${a})`;
}

export default function SpectrogramClient() {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const micRef = useRef<MicHandle | null>(null);
  const rafRef = useRef<number | null>(null);
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  function stop() {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    micRef.current?.close();
    micRef.current = null;
    setRunning(false);
  }

  function clearCanvas() {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cv.width, cv.height);
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
      const bins = mic.analyser.frequencyBinCount;
      freqRef.current = new Uint8Array(bins);
      clearCanvas();
      setRunning(true);

      const nyquist = mic.ctx.sampleRate / 2;
      const maxBin = Math.min(bins - 1, Math.floor((MAX_FREQ / nyquist) * bins));

      const draw = () => {
        const m = micRef.current;
        const cv = canvasRef.current;
        const freq = freqRef.current;
        if (!m || !cv || !freq) return;
        const ctx = cv.getContext("2d");
        if (!ctx) return;

        m.analyser.getByteFrequencyData(freq);

        const w = cv.width;
        const h = cv.height;
        // 기존 그림 1px 왼쪽으로 이동
        ctx.drawImage(cv, 1, 0, w - 1, h, 0, 0, w - 1, h);
        // 오른쪽 끝에 새 열
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(w - 1, 0, 1, h);
        for (let y = 0; y < h; y++) {
          const frac = 1 - y / h;            // 위=고주파
          const bin = Math.floor(frac * maxBin);
          const v = freq[bin];
          if (v > 8) {
            ctx.fillStyle = energyColor(v);
            ctx.fillRect(w - 1, y, 1, 1);
          }
        }
        rafRef.current = requestAnimationFrame(draw);
      };
      rafRef.current = requestAnimationFrame(draw);
    } catch (e) {
      const n = (e as DOMException)?.name;
      setError(
        n === "NotAllowedError" || n === "SecurityError"
          ? "마이크 권한이 거부됐어요. 주소창의 마이크 아이콘에서 허용해 주세요."
          : n === "NotFoundError"
          ? "마이크 장치를 찾을 수 없어요."
          : "마이크를 여는 중 문제가 생겼어요."
      );
      setRunning(false);
    }
  }

  useEffect(() => () => stop(), []);

  // /s/ 대역 안내선 위치(%) — 위=고주파 기준.
  const bandTop = (1 - SBAND_HI / MAX_FREQ) * 100;
  const bandBottom = (1 - SBAND_LO / MAX_FREQ) * 100;

  return (
    <div className="card">
      <div className="card-body" style={{ display: "grid", gap: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {!running ? (
            <button className="btn btn-primary" onClick={start}>시작</button>
          ) : (
            <button className="btn" onClick={stop}>중지</button>
          )}
          <button className="btn" onClick={clearCanvas} disabled={!running}>화면 지우기</button>
          <span style={{ fontSize: 13, color: "var(--text-mute)" }}>
            {running ? "“스―” 소리를 내보면 위쪽(고주파) 띠가 진해져요." : "버튼을 누르면 마이크 권한을 요청해요."}
          </span>
        </div>

        {error && (
          <div style={{ padding: "10px 14px", borderRadius: 10, fontSize: 13.5, lineHeight: 1.6, background: "#F6E4DE", color: "#8A2F1C", border: "1px solid #E6C3B8" }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          {/* Y축 눈금 */}
          <div style={{ position: "relative", width: 44, height: 260, flexShrink: 0, fontSize: 11, color: "var(--text-mute)" }}>
            {[0, 2, 4, 6, 8, 10].map((khz) => (
              <span key={khz} style={{ position: "absolute", right: 4, top: `calc(${(1 - khz / 10) * 100}% - 7px)` }}>
                {khz}k
              </span>
            ))}
          </div>
          <div style={{ position: "relative", flex: 1, height: 260, borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)" }}>
            <canvas
              ref={canvasRef}
              width={640}
              height={260}
              style={{ width: "100%", height: "100%", display: "block", background: "#fff" }}
            />
            {/* /s/ 대역 가이드 */}
            <div style={{ position: "absolute", left: 0, right: 0, top: `${bandTop}%`, height: `${bandBottom - bandTop}%`, border: "1px dashed rgba(183,146,104,0.7)", borderLeft: "none", borderRight: "none", pointerEvents: "none" }} />
            <span style={{ position: "absolute", left: 6, top: `${bandTop}%`, fontSize: 11, color: "var(--accent)", fontWeight: 700, transform: "translateY(2px)" }}>/s/ 대역 4–8kHz</span>
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--text-mute)" }}>
          가로축은 시간(왼쪽으로 흐름), 세로축은 주파수예요. 모음은 아래쪽(저주파)에, /s/·/ㅅ/ 같은 마찰음은 점선 표시한 4–8kHz 대역에 에너지가 모입니다.
        </div>
      </div>
    </div>
  );
}
