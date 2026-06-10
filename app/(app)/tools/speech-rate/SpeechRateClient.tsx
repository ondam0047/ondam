"use client";

import { useEffect, useRef, useState } from "react";
import { micSupported } from "@/lib/voice/audio";
import { countKoreanSyllables, getRateFeedback, type RateFeedback } from "@/lib/voice/syllables";

const DEFAULT_TEXT = "오늘은 아침에 일어나서 세수를 하고 밥을 먹었어요.";

type Result = {
  syllables: number;
  sec: number;
  sps: number;
  feedback: RateFeedback;
  targetSps: number;
  at: string; // 표시용 시각
};

const FEEDBACK_STYLE: Record<RateFeedback, { bg: string; fg: string; label: string }> = {
  빠름: { bg: "#F6E4DE", fg: "#8A2F1C", label: "목표보다 빠름" },
  느림: { bg: "#E1ECF4", fg: "#1F4E79", label: "목표보다 느림" },
  적절: { bg: "#DDEBD3", fg: "#3F6132", label: "목표에 적절" },
};

export default function SpeechRateClient() {
  const [name, setName] = useState("");
  const [text, setText] = useState(DEFAULT_TEXT);
  const [targetSps, setTargetSps] = useState(3.0);

  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);

  function stopTracks() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function startRec() {
    setError(null);
    setResult(null);
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null); }
    if (!micSupported() || typeof MediaRecorder === "undefined") {
      setError("이 브라우저에서는 녹음을 사용할 수 없어요. 크롬·엣지 최신 버전을 권장해요.");
      return;
    }
    if (!text.trim()) {
      setError("측정할 문장을 먼저 입력해 주세요.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (ev) => { if (ev.data.size > 0) chunksRef.current.push(ev.data); };
      recorder.onstop = () => {
        const sec = (performance.now() - startRef.current) / 1000;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setAudioUrl(URL.createObjectURL(blob));

        const syllables = countKoreanSyllables(text);
        const sps = sec > 0 ? syllables / sec : 0;
        setResult({
          syllables,
          sec: Number(sec.toFixed(2)),
          sps: Number(sps.toFixed(2)),
          feedback: getRateFeedback(sps, targetSps),
          targetSps,
          at: new Date().toLocaleString("ko-KR"),
        });
        stopTracks();
      };

      startRef.current = performance.now();
      recorder.start();
      setRecording(true);
      setElapsed(0);
      tickRef.current = window.setInterval(() => {
        setElapsed((performance.now() - startRef.current) / 1000);
      }, 100);
    } catch (e) {
      const n = (e as DOMException)?.name;
      setError(
        n === "NotAllowedError" || n === "SecurityError"
          ? "마이크 권한이 거부됐어요. 주소창의 마이크 아이콘에서 허용해 주세요."
          : n === "NotFoundError"
          ? "마이크 장치를 찾을 수 없어요."
          : "녹음을 시작하지 못했어요. 잠시 후 다시 시도해 주세요."
      );
      setRecording(false);
    }
  }

  function stopRec() {
    if (tickRef.current != null) { window.clearInterval(tickRef.current); tickRef.current = null; }
    recorderRef.current?.stop();
    setRecording(false);
  }

  function downloadReport() {
    if (!result) return;
    const lines = [
      "말속도 측정 결과",
      "──────────────────────",
      name.trim() ? `대상자: ${name.trim()}` : null,
      `측정 시각: ${result.at}`,
      "",
      `읽은 문장: ${text.trim()}`,
      `음절 수: ${result.syllables} 음절`,
      `소요 시간: ${result.sec} 초`,
      `측정 말속도: ${result.sps} 음절/초`,
      `목표 말속도: ${result.targetSps.toFixed(1)} 음절/초`,
      `결과: ${FEEDBACK_STYLE[result.feedback].label}`,
      "",
      "※ 본 자료는 의료 진단·치료를 제공·대체하지 않는 학습·연습·시각화 보조 자료입니다.",
    ].filter(Boolean);
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = result.at.replace(/[^0-9]/g, "").slice(0, 12);
    a.download = `말속도측정_${name.trim() || "결과"}_${stamp}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => () => {
    if (tickRef.current != null) window.clearInterval(tickRef.current);
    stopTracks();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <div className="card-body" style={{ display: "grid", gap: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
            <div className="field">
              <label>대상자 (선택 — 보고서 표기용)</label>
              <input value={name} disabled={recording} onChange={(e) => setName(e.target.value)}
                placeholder="예: 홍길동"
                style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 14, color: "var(--text)" }} />
            </div>
            <div className="field">
              <label>목표 말속도 — {targetSps.toFixed(1)} 음절/초</label>
              <input type="range" min={1} max={6} step={0.1} value={targetSps}
                disabled={recording} onChange={(e) => setTargetSps(Number(e.target.value))} />
            </div>
          </div>

          <div className="field">
            <label>측정할 문장 (녹음하는 동안 이 문장을 읽어 주세요)</label>
            <textarea value={text} disabled={recording} onChange={(e) => setText(e.target.value)} rows={3}
              style={{ resize: "vertical", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 15, lineHeight: 1.6, color: "var(--text)", fontFamily: "inherit" }} />
            <span style={{ fontSize: 12, color: "var(--text-mute)" }}>이 문장의 한글 음절 수: {countKoreanSyllables(text)} 음절</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {!recording ? (
              <button className="btn btn-primary" onClick={startRec}>녹음 시작</button>
            ) : (
              <button className="btn" onClick={stopRec}>녹음 정지</button>
            )}
            {recording && (
              <span style={{ fontSize: 14, color: "var(--primary)", fontWeight: 700 }}>
                ● 녹음 중 — {elapsed.toFixed(1)}초
              </span>
            )}
          </div>

          {error && (
            <div style={{ padding: "10px 14px", borderRadius: 10, fontSize: 13.5, lineHeight: 1.6, background: "#F6E4DE", color: "#8A2F1C", border: "1px solid #E6C3B8" }}>
              {error}
            </div>
          )}
        </div>
      </div>

      {result && (
        <div className="card">
          <div className="card-body" style={{ display: "grid", gap: 18 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 13, color: "var(--text-mute)" }}>측정 말속도</div>
                <div style={{ fontSize: 34, fontWeight: 800, color: "var(--primary)", lineHeight: 1.1 }}>
                  {result.sps}<span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-mute)" }}> 음절/초</span>
                </div>
              </div>
              <span className="badge" style={{ background: FEEDBACK_STYLE[result.feedback].bg, color: FEEDBACK_STYLE[result.feedback].fg, borderColor: "transparent", fontSize: 13, padding: "5px 12px" }}>
                {FEEDBACK_STYLE[result.feedback].label}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, fontSize: 14 }}>
              {[
                ["음절 수", `${result.syllables} 음절`],
                ["소요 시간", `${result.sec} 초`],
                ["목표 속도", `${result.targetSps.toFixed(1)} 음절/초`],
              ].map(([k, v]) => (
                <div key={k} style={{ padding: "10px 14px", borderRadius: 10, background: "var(--surface-2)" }}>
                  <div style={{ fontSize: 12, color: "var(--text-mute)" }}>{k}</div>
                  <div style={{ fontWeight: 700 }}>{v}</div>
                </div>
              ))}
            </div>

            {audioUrl && (
              <audio controls src={audioUrl} style={{ width: "100%" }} />
            )}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={downloadReport}>결과 보고서 (.txt) 다운로드</button>
              {audioUrl && (
                <a className="btn" href={audioUrl} download={`말속도녹음_${name.trim() || "결과"}.webm`}>녹음 파일 다운로드</a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
