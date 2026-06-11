"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentSession } from "@/lib/voice/currentSessionStorage";
import { saveTrainingRecord, type ModuleType } from "@/lib/voice/trainingStorage";
import {
  countKoreanSyllables,
  splitIntoChunks,
  getRateFeedback,
  type ChunkMode,
} from "@/lib/voice/syllables";

/* ──────────────────────────────────────────────
   공용 상수 / 타입
   ────────────────────────────────────────────── */

type Mode = "visual" | "audio" | "mixed";

const CHUNK_MODES: ChunkMode[] = ["1어절씩", "2어절씩", "3어절씩", "4어절씩", "전체 문장"];

type CustomPreset = { id: string; label: string; text: string };

const DEFAULT_PRESETS: CustomPreset[] = [
  { id: "preset-greet", label: "인사", text: "안녕하세요. 오늘도 좋은 하루 보내세요." },
  { id: "preset-order", label: "주문", text: "따뜻한 아메리카노 한 잔 주세요." },
  { id: "preset-ask", label: "요청", text: "잠깐만요. 제가 천천히 다시 말해 볼게요." },
];

const MODE_DEFAULT_TEXT: Record<Mode, string> = {
  visual: "오늘은 천천히 또박또박 말해 볼게요.",
  audio: "잠깐만요. 제가 천천히 다시 말해 볼게요.",
  mixed: "말하기 전에 숨을 한 번 고르고 천천히 이어서 말해 볼게요.",
};

const DEFAULT_TARGET_SPS = 3.0;
const DEFAULT_CHUNK_MODE: ChunkMode = "2어절씩";
const DEFAULT_PAUSE_SEC = 0.5;
const DEFAULT_FONT_SIZE = 18;

// 미리 써두는 문장 목록 (오른쪽 칸) — 5개, localStorage 유지
const SENTENCE_SLOTS = 5;
const SENTENCE_LIST_KEY = "pd-pacing-sentence-list";

/* 측정 피드백 배지 색상 (baroilji 토큰 기반) */
function feedbackBadgeStyle(feedback: string): { bg: string; fg: string } {
  if (feedback === "빠름") return { bg: "#F6E4DE", fg: "#8A2F1C" };
  if (feedback === "느림") return { bg: "#E1ECF4", fg: "#1F4E79" };
  if (feedback === "적절") return { bg: "#DDEBD3", fg: "#3F6132" };
  return { bg: "var(--surface-2)", fg: "var(--text-mute)" };
}

function statusBadgeStyle(statusText: string): { bg: string; fg: string } {
  if (statusText === "진행 중") return { bg: "var(--primary-soft)", fg: "var(--primary)" };
  if (statusText === "완료") return { bg: "#DDEBD3", fg: "#3F6132" };
  if (statusText === "중지") return { bg: "#F4E4C8", fg: "#8A6422" };
  return { bg: "var(--surface-2)", fg: "var(--text-mute)" };
}

/* 입력 공통 스타일 */
const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  fontSize: 14,
  color: "var(--text)",
  width: "100%",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  fontSize: 15,
  lineHeight: 1.6,
  fontFamily: "inherit",
};

/* ──────────────────────────────────────────────
   공용 페이싱 훅 — 시각/청각/혼합이 공유하는 동작
   - withBall  : 시각 진행 막대(공) 사용
   - withCue   : 구 시작 청각 cue 사용
   ────────────────────────────────────────────── */

function usePacingTrainer(moduleType: ModuleType, opts: { withBall: boolean; withCue: boolean }) {
  const { withBall, withCue } = opts;

  const [clientName, setClientName] = useState("");
  const [sessionNote, setSessionNote] = useState("");

  const [practiceText, setPracticeText] = useState(MODE_DEFAULT_TEXT[moduleType]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [targetSps, setTargetSps] = useState(DEFAULT_TARGET_SPS);
  const [chunkMode, setChunkMode] = useState<ChunkMode>(DEFAULT_CHUNK_MODE);
  const [pauseSec, setPauseSec] = useState(DEFAULT_PAUSE_SEC);
  const [displayFontSize, setDisplayFontSize] = useState(DEFAULT_FONT_SIZE);

  const [presets, setPresets] = useState<CustomPreset[]>(DEFAULT_PRESETS);
  const [presetLabelInput, setPresetLabelInput] = useState("");
  const [presetTextInput, setPresetTextInput] = useState("");

  // 미리 써두는 문장 목록 (5개)
  const [sentenceList, setSentenceList] = useState<string[]>(() => Array(SENTENCE_SLOTS).fill(""));

  const [isRunning, setIsRunning] = useState(false);
  const [activeChunkIndex, setActiveChunkIndex] = useState(-1);
  const [ballProgress, setBallProgress] = useState(0);
  const [statusText, setStatusText] = useState("대기 중");

  const [measuredSps, setMeasuredSps] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [recordingSec, setRecordingSec] = useState<number | null>(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStartRef = useRef<number | null>(null);
  const timeoutsRef = useRef<number[]>([]);

  const chunks = useMemo(() => splitIntoChunks(practiceText, chunkMode), [practiceText, chunkMode]);
  const totalSyllables = useMemo(() => countKoreanSyllables(practiceText), [practiceText]);
  const targetTotalSec = useMemo(() => {
    if (targetSps <= 0) return 0;
    return totalSyllables / targetSps;
  }, [totalSyllables, targetSps]);

  /* 현재 세션(이름/메모) 읽기 — 표시용 */
  useEffect(() => {
    const sync = () => {
      const current = getCurrentSession();
      setClientName((current.clientName ?? "").trim());
      setSessionNote(current.sessionNote ?? "");
    };
    sync();
    window.addEventListener("pd-current-session-updated", sync);
    return () => window.removeEventListener("pd-current-session-updated", sync);
  }, []);

  /* 미리 써둔 문장 목록 — localStorage 로드/저장 */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SENTENCE_LIST_KEY);
      if (!raw) return;
      const arr: unknown = JSON.parse(raw);
      if (Array.isArray(arr)) {
        setSentenceList(
          Array.from({ length: SENTENCE_SLOTS }, (_, i) =>
            typeof arr[i] === "string" ? (arr[i] as string) : "",
          ),
        );
      }
    } catch {
      /* noop */
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(SENTENCE_LIST_KEY, JSON.stringify(sentenceList));
    } catch {
      /* noop */
    }
  }, [sentenceList]);

  function updateSentence(index: number, value: string) {
    setSentenceList((prev) => prev.map((s, i) => (i === index ? value : s)));
  }
  function applySentence(text: string) {
    if (isRunning) return;
    const v = text.trim();
    if (!v) return;
    setPracticeText(v);
    setSelectedPresetId(null);
  }

  /* 정리 */
  useEffect(() => {
    return () => {
      clearAllTimers();
      stopRecording(false);
      if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordedAudioUrl]);

  function clearAllTimers() {
    timeoutsRef.current.forEach((id) => window.clearTimeout(id));
    timeoutsRef.current = [];
  }

  function increaseFontSize() {
    setDisplayFontSize((prev) => Math.min(prev + 1, 36));
  }
  function decreaseFontSize() {
    setDisplayFontSize((prev) => Math.max(prev - 1, 12));
  }

  function resetSettingsToDefault() {
    if (isRunning) return;
    setPracticeText(MODE_DEFAULT_TEXT[moduleType]);
    setSelectedPresetId(null);
    setTargetSps(DEFAULT_TARGET_SPS);
    setChunkMode(DEFAULT_CHUNK_MODE);
    setPauseSec(DEFAULT_PAUSE_SEC);
    setDisplayFontSize(DEFAULT_FONT_SIZE);
  }

  /* 프리셋 동작 */
  function handleSelectPreset(preset: CustomPreset) {
    if (isRunning) return;
    setSelectedPresetId(preset.id);
    setPracticeText(preset.text);
    setPresetLabelInput(preset.label);
    setPresetTextInput(preset.text);
  }

  function handleNewPreset() {
    setSelectedPresetId(null);
    setPresetLabelInput("");
    setPresetTextInput(practiceText.trim() || "");
  }

  function handleSavePreset() {
    const nextLabel = presetLabelInput.trim();
    const nextText = presetTextInput.trim();
    if (!nextLabel || !nextText) {
      alert("문구 이름과 내용을 입력해주세요.");
      return;
    }
    const id = selectedPresetId ?? crypto.randomUUID();
    const nextPreset: CustomPreset = { id, label: nextLabel, text: nextText };
    setPresets((prev) => {
      const exists = prev.some((p) => p.id === id);
      return exists ? prev.map((p) => (p.id === id ? nextPreset : p)) : [...prev, nextPreset];
    });
    setSelectedPresetId(id);
    setPracticeText(nextText);
    setPresetLabelInput(nextLabel);
    setPresetTextInput(nextText);
  }

  function handleDeletePreset() {
    if (!selectedPresetId) {
      alert("삭제할 문구를 먼저 선택해주세요.");
      return;
    }
    if (!window.confirm("선택한 문구를 삭제할까요?")) return;
    setPresets((prev) => prev.filter((p) => p.id !== selectedPresetId));
    setSelectedPresetId(null);
    setPresetLabelInput("");
    setPresetTextInput("");
  }

  function handleResetPresets() {
    if (!window.confirm("저장된 문구를 기본값으로 되돌릴까요?")) return;
    setPresets(DEFAULT_PRESETS);
    setSelectedPresetId(null);
    setPresetLabelInput("");
    setPresetTextInput("");
  }

  /* 청각 cue — 880Hz sine, gain 0.08, 120ms */
  function playCue() {
    try {
      if (!audioContextRef.current) {
        const Ctx: typeof AudioContext =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioContextRef.current = new Ctx();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === "suspended") void ctx.resume();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gainNode.gain.value = 0.08;
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      const now = ctx.currentTime;
      oscillator.start(now);
      oscillator.stop(now + 0.12);
    } catch (error) {
      console.error("청각 cue 재생 실패:", error);
    }
  }

  async function startRecording() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        alert("이 브라우저에서는 녹음을 지원하지 않습니다.");
        return false;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      recordingStartRef.current = performance.now();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
        const url = URL.createObjectURL(blob);
        setRecordedAudioUrl(url);

        if (recordingStartRef.current !== null) {
          const sec = (performance.now() - recordingStartRef.current) / 1000;
          setRecordingSec(Number(sec.toFixed(2)));

          if (totalSyllables > 0 && sec > 0) {
            const actualSps = totalSyllables / sec;
            const resultFeedback = getRateFeedback(actualSps, targetSps);
            setMeasuredSps(Number(actualSps.toFixed(2)));
            setFeedback(resultFeedback);

            saveTrainingRecord({
              id: crypto.randomUUID(),
              savedAt: new Date().toISOString(),
              moduleType,
              clientName: clientName.trim(),
              sessionNote: sessionNote.trim(),
              practiceText: practiceText.trim(),
              targetSps,
              measuredSps: Number(actualSps.toFixed(2)),
              feedback: resultFeedback,
              chunkMode,
              recordingSec: Number(sec.toFixed(2)),
            });
          }
        }

        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
      };

      mediaRecorder.start();
      return true;
    } catch (error) {
      console.error(error);
      alert("마이크 권한을 허용해야 녹음할 수 있습니다.");
      return false;
    }
  }

  function stopRecording(shouldStopRecorder = true) {
    if (shouldStopRecorder && mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    } else {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }

  async function startTraining() {
    if (!practiceText.trim()) {
      alert("연습 문구를 입력해주세요.");
      return;
    }
    if (totalSyllables === 0) {
      alert("한글 문구를 포함해주세요.");
      return;
    }
    if (chunks.length === 0) {
      alert("문구를 확인해주세요.");
      return;
    }

    clearAllTimers();
    setMeasuredSps(null);
    setFeedback("");
    setRecordingSec(null);
    setBallProgress(0);
    setActiveChunkIndex(-1);
    setStatusText("녹음 준비 중");

    const ok = await startRecording();
    if (!ok) {
      setStatusText("대기 중");
      return;
    }

    setIsRunning(true);
    setStatusText("진행 중");

    const chunkDurations = chunks.map((chunk) => {
      const syllables = Math.max(countKoreanSyllables(chunk), 1);
      return (syllables / targetSps) * 1000;
    });

    const totalTimelineMs =
      chunkDurations.reduce((sum, ms) => sum + ms, 0) +
      Math.max(chunks.length - 1, 0) * pauseSec * 1000;

    let accumulatedMs = 0;

    chunks.forEach((_, index) => {
      const chunkMs = chunkDurations[index];
      const startMs = accumulatedMs;
      const endMs = startMs + chunkMs;

      const startTimeout = window.setTimeout(() => {
        if (withCue) playCue();
        setActiveChunkIndex(index);
      }, startMs);
      timeoutsRef.current.push(startTimeout);

      if (withBall) {
        const progressTimeout = window.setTimeout(() => {
          const progress = totalTimelineMs > 0 ? (endMs / totalTimelineMs) * 100 : 0;
          setBallProgress(Math.min(progress, 100));
        }, endMs);
        timeoutsRef.current.push(progressTimeout);
      }

      accumulatedMs = endMs;
      if (index < chunks.length - 1) accumulatedMs += pauseSec * 1000;
    });

    const finishTimeout = window.setTimeout(() => {
      finishTraining();
    }, totalTimelineMs);
    timeoutsRef.current.push(finishTimeout);
  }

  function finishTraining() {
    clearAllTimers();
    setIsRunning(false);
    setActiveChunkIndex(-1);
    if (withBall) setBallProgress(100);
    setStatusText("완료");
    stopRecording(true);
  }

  function stopTrainingManually() {
    clearAllTimers();
    setIsRunning(false);
    setActiveChunkIndex(-1);
    setStatusText("중지");
    stopRecording(true);
  }

  return {
    // 세션
    clientName, sessionNote,
    // 설정
    practiceText, setPracticeText,
    selectedPresetId, setSelectedPresetId,
    targetSps, setTargetSps,
    chunkMode, setChunkMode,
    pauseSec, setPauseSec,
    displayFontSize, increaseFontSize, decreaseFontSize,
    // 프리셋
    presets, presetLabelInput, setPresetLabelInput, presetTextInput, setPresetTextInput,
    handleSelectPreset, handleNewPreset, handleSavePreset, handleDeletePreset, handleResetPresets,
    resetSettingsToDefault,
    // 미리 써둔 문장 목록
    sentenceList, updateSentence, applySentence,
    // 실행 상태
    isRunning, activeChunkIndex, ballProgress, statusText,
    measuredSps, feedback, recordingSec, recordedAudioUrl,
    // 파생
    chunks, totalSyllables, targetTotalSec,
    // 액션
    startTraining, stopTrainingManually,
  };
}

/* ──────────────────────────────────────────────
   공용 프리젠테이션 — 설정 + 요약 + 어절 표시
   accent: 청각/혼합 테마 강조색(없으면 primary)
   extraNote: 단서 안내 문구
   showBall: 진행 막대 표시 여부
   ────────────────────────────────────────────── */

function TrainerView({
  t,
  showBall,
  extraNote,
}: {
  t: ReturnType<typeof usePacingTrainer>;
  showBall: boolean;
  extraNote: string;
}) {
  const fb = feedbackBadgeStyle(t.feedback);
  const st = statusBadgeStyle(t.statusText);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* 세션 정보 (읽기 전용) */}
      {(t.clientName || t.sessionNote) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {t.clientName && (
            <span className="badge badge-primary">대상자: {t.clientName}</span>
          )}
          {t.sessionNote && (
            <span className="badge">메모: {t.sessionNote}</span>
          )}
        </div>
      )}

      {/* 설정 카드 */}
      <div className="card">
        <div className="card-body" style={{ display: "grid", gap: 18 }}>
          {/* 연습 문구 고르기 — 왼쪽: 저장된 문구 / 오른쪽: 미리 써둔 문장 5개 */}
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <strong style={{ fontSize: 13, color: "var(--text)" }}>연습 문구 고르기</strong>
              <button type="button" className="btn btn-sm" onClick={t.resetSettingsToDefault} disabled={t.isRunning}>
                설정 초기화
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
              {/* 왼쪽: 저장된 문구(프리셋) */}
              <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-mute)" }}>저장된 문구</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {t.presets.map((preset) => {
                    const on = t.selectedPresetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => t.handleSelectPreset(preset)}
                        disabled={t.isRunning}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 999,
                          border: "none",
                          background: on ? "var(--primary)" : "var(--surface-2)",
                          color: on ? "#fff" : "var(--text-soft)",
                          cursor: t.isRunning ? "not-allowed" : "pointer",
                          fontWeight: on ? 700 : 500,
                          fontSize: 13,
                        }}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 오른쪽: 미리 써둔 문장 5개 */}
              <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-mute)" }}>문장 목록 (미리 5개 작성 · 자동 저장)</span>
                {t.sentenceList.map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "var(--text-mute)", width: 14, textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
                    <input
                      type="text"
                      value={s}
                      onChange={(e) => t.updateSentence(i, e.target.value)}
                      placeholder={`문장 ${i + 1}`}
                      disabled={t.isRunning}
                      style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                    />
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => t.applySentence(s)}
                      disabled={t.isRunning || !s.trim()}
                      style={{ flexShrink: 0 }}
                    >
                      사용
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 프리셋 편집 */}
          <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "var(--surface-2)" }}>
            <div style={{ display: "grid", gap: 12 }}>
              <div className="field">
                <label>문구 이름</label>
                <input
                  type="text"
                  value={t.presetLabelInput}
                  onChange={(e) => t.setPresetLabelInput(e.target.value)}
                  placeholder="예: 주문 문구"
                  style={inputStyle}
                />
              </div>
              <div className="field">
                <label>문구 내용</label>
                <textarea
                  value={t.presetTextInput}
                  onChange={(e) => t.setPresetTextInput(e.target.value)}
                  rows={3}
                  placeholder="자주 쓰는 문구를 저장하세요"
                  style={textareaStyle}
                />
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn btn-sm" onClick={t.handleNewPreset}>새 문구</button>
                <button type="button" className="btn btn-primary btn-sm" onClick={t.handleSavePreset}>문구 저장</button>
                <button type="button" className="btn btn-sm" onClick={t.handleDeletePreset}>선택 문구 삭제</button>
                <button type="button" className="btn btn-sm" onClick={t.handleResetPresets}>기본값 복원</button>
              </div>
            </div>
          </div>

          {/* 연습 문구 */}
          <div className="field">
            <label>연습 문구</label>
            <textarea
              value={t.practiceText}
              onChange={(e) => {
                t.setPracticeText(e.target.value);
                t.setSelectedPresetId(null);
              }}
              disabled={t.isRunning}
              rows={4}
              style={textareaStyle}
            />
          </div>

          {/* 수치 설정 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
            <div className="field">
              <label>목표 말속도 — {t.targetSps.toFixed(1)} 음절/초</label>
              <input
                type="range"
                min={1}
                max={6}
                step={0.1}
                value={t.targetSps}
                disabled={t.isRunning}
                onChange={(e) => t.setTargetSps(Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label>끊어 읽기</label>
              <select
                value={t.chunkMode}
                disabled={t.isRunning}
                onChange={(e) => t.setChunkMode(e.target.value as ChunkMode)}
                style={inputStyle}
              >
                {CHUNK_MODES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>묶음 간 쉼 — {t.pauseSec.toFixed(1)}초</label>
              <input
                type="range"
                min={0}
                max={3}
                step={0.1}
                value={t.pauseSec}
                disabled={t.isRunning}
                onChange={(e) => t.setPauseSec(Number(e.target.value))}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="card">
        <div className="card-body" style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, fontSize: 14 }}>
            {[
              ["총 한글 음절 수", `${t.totalSyllables}`],
              ["목표 전체 시간", `${t.targetTotalSec.toFixed(2)}초`],
              ["묶음 개수", `${t.chunks.length}`],
              ["녹음 시간", t.recordingSec !== null ? `${t.recordingSec}초` : "-"],
            ].map(([k, v]) => (
              <div key={k} style={{ padding: "10px 14px", borderRadius: 10, background: "var(--surface-2)" }}>
                <div style={{ fontSize: 12, color: "var(--text-mute)" }}>{k}</div>
                <div style={{ fontWeight: 700 }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--text-mute)" }}>상태</span>
            <span className="badge" style={{ background: st.bg, color: st.fg, borderColor: "transparent" }}>{t.statusText}</span>

            <span style={{ fontSize: 13, color: "var(--text-mute)" }}>측정 말속도</span>
            <span style={{ fontWeight: 800, color: "var(--primary)" }}>
              {t.measuredSps !== null ? `${t.measuredSps} 음절/초` : "-"}
            </span>

            <span style={{ fontSize: 13, color: "var(--text-mute)" }}>피드백</span>
            <span className="badge" style={{ background: fb.bg, color: fb.fg, borderColor: "transparent" }}>{t.feedback || "-"}</span>
          </div>
        </div>
      </div>

      {/* 어절 표시 + 진행 */}
      <div className="card">
        <div className="card-body" style={{ display: "grid", gap: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 14, color: "var(--text)" }}>문장 묶음 표시</strong>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: "var(--text-mute)" }}>글자 크기 {t.displayFontSize}</span>
              <button type="button" className="btn btn-sm" onClick={t.decreaseFontSize}>A-</button>
              <button type="button" className="btn btn-sm" onClick={t.increaseFontSize}>A+</button>
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, minHeight: 48 }}>
            {t.chunks.length === 0 ? (
              <span style={{ fontSize: 14, color: "var(--text-mute)" }}>연습 문구를 입력하세요.</span>
            ) : (
              t.chunks.map((chunk, index) => {
                const on = index === t.activeChunkIndex;
                return (
                  <span
                    key={`${chunk}-${index}`}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 999,
                      border: "1px solid var(--border)",
                      background: on ? "var(--primary-soft)" : "transparent",
                      color: on ? "var(--primary)" : "var(--text)",
                      fontWeight: on ? 800 : 500,
                      fontSize: t.displayFontSize,
                      transition: "background 80ms, color 80ms",
                    }}
                  >
                    {chunk}
                  </span>
                );
              })
            )}
          </div>

          {showBall && (
            <div style={{ position: "relative", height: 52, borderRadius: 999, background: "var(--surface-2)", border: "1px solid var(--border)", overflow: "hidden" }}>
              <div
                style={{
                  position: "absolute",
                  left: `calc(${t.ballProgress}% - 18px)`,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: "var(--primary)",
                  boxShadow: "0 4px 10px rgba(0,0,0,0.18)",
                  transition: t.isRunning ? "left 0.3s linear" : "none",
                }}
              />
            </div>
          )}

          <div style={{ fontSize: 12.5, color: "var(--text-mute)", lineHeight: 1.6 }}>{extraNote}</div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {!t.isRunning ? (
              <button className="btn btn-primary" onClick={t.startTraining} disabled={!t.practiceText.trim()}>시작</button>
            ) : (
              <button className="btn" onClick={t.stopTrainingManually}>정지</button>
            )}
          </div>

          {t.recordedAudioUrl && (
            <div style={{ padding: 14, borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <strong style={{ color: "var(--text-soft)", fontSize: 13 }}>녹음 다시 듣기</strong>
              <div style={{ marginTop: 8 }}>
                <audio controls src={t.recordedAudioUrl} style={{ width: "100%" }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   3개 변형
   ────────────────────────────────────────────── */

function PacingVisual() {
  const t = usePacingTrainer("visual", { withBall: true, withCue: false });
  return (
    <TrainerView
      t={t}
      showBall
      extraNote="움직이는 공이 묶음을 지나가는 속도에 맞춰, 강조된 묶음을 목표 속도로 읽어요."
    />
  );
}

function PacingAudio() {
  const t = usePacingTrainer("audio", { withBall: false, withCue: true });
  return (
    <TrainerView
      t={t}
      showBall={false}
      extraNote="각 묶음 시작 시점에 짧은 청각 신호(삐)가 울려요. 신호에 맞춰 한 묶음씩 읽어요."
    />
  );
}

function PacingMixed() {
  const t = usePacingTrainer("mixed", { withBall: true, withCue: true });
  return (
    <TrainerView
      t={t}
      showBall
      extraNote="시각 진행 막대와 묶음 시작 청각 신호(삐)를 함께 사용해 목표 속도로 읽어요."
    />
  );
}

/* ──────────────────────────────────────────────
   루트 — 모드 토글 + 해당 트레이너
   ────────────────────────────────────────────── */

export default function PacingClient() {
  const [mode, setMode] = useState<Mode>("visual");

  const TABS: { key: Mode; label: string }[] = [
    { key: "visual", label: "시각" },
    { key: "audio", label: "청각" },
    { key: "mixed", label: "혼합" },
  ];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* 세그먼트 토글 */}
      <div style={{ display: "flex", gap: 6, background: "var(--surface-2)", padding: 4, borderRadius: 12, width: "fit-content" }}>
        {TABS.map((tab) => {
          const on = mode === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setMode(tab.key)}
              style={{
                border: "none",
                borderRadius: 9,
                padding: "8px 20px",
                fontSize: 14,
                fontWeight: on ? 700 : 500,
                background: on ? "var(--primary)" : "var(--surface)",
                color: on ? "#fff" : "var(--text-soft)",
                cursor: "pointer",
                transition: "background 0.12s, color 0.12s",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* mode를 key로 줘서 전환 시 각 트레이너 상태를 깔끔히 초기화 */}
      {mode === "visual" && <PacingVisual key="visual" />}
      {mode === "audio" && <PacingAudio key="audio" />}
      {mode === "mixed" && <PacingMixed key="mixed" />}
    </div>
  );
}
