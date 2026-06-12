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
import ToolMonitor from "../ToolMonitor";

/* ──────────────────────────────────────────────
   공용 상수 / 타입
   ────────────────────────────────────────────── */

type Mode = "visual" | "audio" | "mixed";
type Child = { id: number; name: string; birthDate: string | null };

const CHUNK_MODES: ChunkMode[] = ["1어절씩", "2어절씩", "3어절씩", "4어절씩", "전체 문장"];

const MODE_DEFAULT_TEXT: Record<Mode, string> = {
  visual: "오늘은 천천히 또박또박 말해 볼게요.",
  audio: "잠깐만요. 제가 천천히 다시 말해 볼게요.",
  mixed: "말하기 전에 숨을 한 번 고르고 천천히 이어서 말해 볼게요.",
};

const DEFAULT_TARGET_SPS = 3.0;
const DEFAULT_CHUNK_MODE: ChunkMode = "2어절씩";
const DEFAULT_PAUSE_SEC = 0.5;
const DEFAULT_FONT_SIZE = 18;

// 아동별 문장 목록 — localStorage 자동 저장. 키: 아동 id 별로 분리.
const SENTENCE_KEY = (childId: number | null) => `pd-pacing-sentences:${childId ?? "none"}`;
const DEFAULT_SENTENCE_ROWS = 3;
const MAX_SENTENCE_ROWS = 12;

function loadSentences(childId: number | null): string[] {
  try {
    const raw = window.localStorage.getItem(SENTENCE_KEY(childId));
    if (raw) {
      const arr: unknown = JSON.parse(raw);
      if (Array.isArray(arr)) {
        const list = arr.filter((x) => typeof x === "string") as string[];
        return list.length > 0 ? list : Array(DEFAULT_SENTENCE_ROWS).fill("");
      }
    }
  } catch {
    /* noop */
  }
  return Array(DEFAULT_SENTENCE_ROWS).fill("");
}

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
   childId/childName : 상단 드롭다운에서 선택한 대상자(문장 목록·저장 기준)
   ────────────────────────────────────────────── */

function usePacingTrainer(
  moduleType: ModuleType,
  opts: { withBall: boolean; withCue: boolean },
  childId: number | null,
  childName: string,
) {
  const { withBall, withCue } = opts;

  const [sessionNote, setSessionNote] = useState("");

  const [practiceText, setPracticeText] = useState(MODE_DEFAULT_TEXT[moduleType]);
  const [targetSps, setTargetSps] = useState(DEFAULT_TARGET_SPS);
  const [chunkMode, setChunkMode] = useState<ChunkMode>(DEFAULT_CHUNK_MODE);
  const [pauseSec, setPauseSec] = useState(DEFAULT_PAUSE_SEC);
  const [displayFontSize, setDisplayFontSize] = useState(DEFAULT_FONT_SIZE);

  // 아동별 문장 목록 (추가/제거 가능). SSR 안전 위해 초기값은 빈 줄, 로드는 effect 에서.
  const [sentenceList, setSentenceList] = useState<string[]>(() => Array(DEFAULT_SENTENCE_ROWS).fill(""));
  const loadedChildRef = useRef<number | null | undefined>(undefined);

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

  const clientName = childName.trim();

  /* 현재 세션(메모) 읽기 — 표시·기록용 */
  useEffect(() => {
    const sync = () => {
      const current = getCurrentSession();
      setSessionNote(current.sessionNote ?? "");
    };
    sync();
    window.addEventListener("pd-current-session-updated", sync);
    return () => window.removeEventListener("pd-current-session-updated", sync);
  }, []);

  /* 마운트 + 대상자 변경 시 그 아동의 문장 목록 로드 (effect 내에서만 localStorage 접근) */
  useEffect(() => {
    if (loadedChildRef.current === childId) return;
    loadedChildRef.current = childId;
    setSentenceList(loadSentences(childId));
  }, [childId]);

  // 변경 즉시 현재 아동 키로 저장 (effect 저장은 대상자 전환 시 경쟁이 생겨 함수에서 직접)
  function persist(list: string[]) {
    try {
      window.localStorage.setItem(SENTENCE_KEY(childId), JSON.stringify(list));
    } catch {
      /* noop */
    }
  }
  function updateSentence(index: number, value: string) {
    setSentenceList((prev) => {
      const next = prev.map((s, i) => (i === index ? value : s));
      persist(next);
      return next;
    });
  }
  function addSentence() {
    setSentenceList((prev) => {
      if (prev.length >= MAX_SENTENCE_ROWS) return prev;
      const next = [...prev, ""];
      persist(next);
      return next;
    });
  }
  function removeSentence(index: number) {
    setSentenceList((prev) => {
      const next = prev.length <= 1 ? [""] : prev.filter((_, i) => i !== index);
      persist(next);
      return next;
    });
  }
  function applySentence(text: string) {
    if (isRunning) return;
    const v = text.trim();
    if (!v) return;
    setPracticeText(v);
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
    setTargetSps(DEFAULT_TARGET_SPS);
    setChunkMode(DEFAULT_CHUNK_MODE);
    setPauseSec(DEFAULT_PAUSE_SEC);
    setDisplayFontSize(DEFAULT_FONT_SIZE);
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
              clientName: clientName,
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
    targetSps, setTargetSps,
    chunkMode, setChunkMode,
    pauseSec, setPauseSec,
    displayFontSize, increaseFontSize, decreaseFontSize,
    resetSettingsToDefault,
    // 문장 목록
    sentenceList, updateSentence, addSentence, removeSentence, applySentence,
    // 실행 상태
    isRunning, activeChunkIndex, ballProgress, statusText,
    measuredSps, feedback, recordingSec, recordedAudioUrl,
    // 파생
    chunks, totalSyllables, targetTotalSec,
    // 액션
    startTraining, stopTrainingManually,
    // 모듈
    moduleType,
  };
}

/* ──────────────────────────────────────────────
   공용 프리젠테이션 — 설정 + 요약 + 어절 표시 + 모니터링
   ────────────────────────────────────────────── */

function TrainerView({
  t,
  childId,
  showBall,
  extraNote,
}: {
  t: ReturnType<typeof usePacingTrainer>;
  childId: number | null;
  showBall: boolean;
  extraNote: string;
}) {
  const fb = feedbackBadgeStyle(t.feedback);
  const st = statusBadgeStyle(t.statusText);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* 설정 카드 */}
      <div className="card">
        <div className="card-body" style={{ display: "grid", gap: 18 }}>
          {/* 문장 목록 (아동별 · 추가/제거 · 자동 저장) — 전체 폭 */}
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <strong style={{ fontSize: 13, color: "var(--text)" }}>
                문장 목록 {t.clientName ? `· ${t.clientName}` : ""}
                <span style={{ fontWeight: 400, color: "var(--text-mute)", marginLeft: 6 }}>자동 저장</span>
              </strong>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn btn-sm" onClick={t.addSentence} disabled={t.isRunning}>＋ 문장 추가</button>
                <button type="button" className="btn btn-sm" onClick={t.resetSettingsToDefault} disabled={t.isRunning}>설정 초기화</button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: 8 }}>
              {t.sentenceList.map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--text-mute)", width: 16, textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
                  <input
                    type="text"
                    value={s}
                    onChange={(e) => t.updateSentence(i, e.target.value)}
                    placeholder={`문장 ${i + 1}`}
                    disabled={t.isRunning}
                    style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                  />
                  <button type="button" className="btn btn-sm" onClick={() => t.applySentence(s)} disabled={t.isRunning || !s.trim()} style={{ flexShrink: 0 }}>사용</button>
                  <button type="button" className="btn btn-sm" onClick={() => t.removeSentence(i)} disabled={t.isRunning} title="이 문장 삭제" style={{ flexShrink: 0, padding: "6px 9px" }}>✕</button>
                </div>
              ))}
            </div>
          </div>

          {/* 연습 문구 */}
          <div className="field">
            <label>연습 문구</label>
            <textarea
              value={t.practiceText}
              onChange={(e) => t.setPracticeText(e.target.value)}
              disabled={t.isRunning}
              rows={3}
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

      {/* 모니터링 — 상단에서 고른 대상자 기준 */}
      <ToolMonitor
        module="pacing"
        lockedChildId={childId}
        getMetrics={() =>
          t.measuredSps !== null
            ? { measuredSps: t.measuredSps, targetSps: Number(t.targetSps.toFixed(1)), feedback: t.feedback || "-", mode: t.moduleType }
            : null
        }
        renderSummary={(m) =>
          `측정 ${m.measuredSps ?? "-"} / 목표 ${m.targetSps ?? "-"} 음절·초${m.feedback ? ` · ${m.feedback}` : ""}${m.mode ? ` (${m.mode})` : ""}`
        }
        trend={{
          key: "measuredSps",
          label: "측정 말속도",
          unit: "음절/초",
          color: "#2563EB",
          refKey: "targetSps",
          refLabel: "목표 말속도",
          refColor: "#B7956A",
        }}
      />
    </div>
  );
}

/* ──────────────────────────────────────────────
   3개 변형
   ────────────────────────────────────────────── */

function PacingVisual({ childId, childName }: { childId: number | null; childName: string }) {
  const t = usePacingTrainer("visual", { withBall: true, withCue: false }, childId, childName);
  return (
    <TrainerView
      t={t}
      childId={childId}
      showBall
      extraNote="움직이는 공이 묶음을 지나가는 속도에 맞춰, 강조된 묶음을 목표 속도로 읽어요."
    />
  );
}

function PacingAudio({ childId, childName }: { childId: number | null; childName: string }) {
  const t = usePacingTrainer("audio", { withBall: false, withCue: true }, childId, childName);
  return (
    <TrainerView
      t={t}
      childId={childId}
      showBall={false}
      extraNote="각 묶음 시작 시점에 짧은 청각 신호(삐)가 울려요. 신호에 맞춰 한 묶음씩 읽어요."
    />
  );
}

function PacingMixed({ childId, childName }: { childId: number | null; childName: string }) {
  const t = usePacingTrainer("mixed", { withBall: true, withCue: true }, childId, childName);
  return (
    <TrainerView
      t={t}
      childId={childId}
      showBall
      extraNote="시각 진행 막대와 묶음 시작 청각 신호(삐)를 함께 사용해 목표 속도로 읽어요."
    />
  );
}

/* ──────────────────────────────────────────────
   루트 — 모드 토글 + 대상자 드롭다운 + 해당 트레이너
   ────────────────────────────────────────────── */

export default function PacingClient() {
  const [mode, setMode] = useState<Mode>("visual");
  const [children, setChildren] = useState<Child[]>([]);
  const [childId, setChildId] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/tools/children")
      .then((r) => (r.ok ? r.json() : { children: [] }))
      .then((d) => { if (alive) setChildren(d.children ?? []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const childName = children.find((c) => c.id === childId)?.name ?? "";

  const TABS: { key: Mode; label: string }[] = [
    { key: "visual", label: "시각" },
    { key: "audio", label: "청각" },
    { key: "mixed", label: "혼합" },
  ];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* 모드 토글 + 대상자 드롭다운 */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
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

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-soft)" }}>대상자</span>
          <select
            value={childId ?? ""}
            onChange={(e) => setChildId(e.target.value ? Number(e.target.value) : null)}
            style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 14, color: "var(--text)", minWidth: 160 }}
          >
            <option value="">선택 안 함</option>
            {children.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.birthDate ? ` (${c.birthDate})` : ""}</option>
            ))}
          </select>
          <span style={{ fontSize: 12, color: "var(--text-mute)" }}>문장 목록·기록이 대상자별로 저장돼요</span>
        </div>
      </div>

      {/* mode를 key로 줘서 전환 시 각 트레이너 상태를 깔끔히 초기화 */}
      {mode === "visual" && <PacingVisual key="visual" childId={childId} childName={childName} />}
      {mode === "audio" && <PacingAudio key="audio" childId={childId} childName={childName} />}
      {mode === "mixed" && <PacingMixed key="mixed" childId={childId} childName={childName} />}
    </div>
  );
}
