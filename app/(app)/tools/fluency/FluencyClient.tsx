"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useKoreanASR } from "@/lib/voice/useKoreanASR";
import {
  tagFromTranscript,
  type TranscriptTagType,
} from "@/lib/voice/transcriptTagger";
import { countKoreanSyllables } from "@/lib/voice/syllables";
import { decodeAudioFile } from "@/lib/voice/audioFile";
import { downloadReport } from "@/lib/voice/report";
import ToolMonitor from "../ToolMonitor";

// 파형 피크 추출 — 절대값 최대를 버킷마다 뽑아 0‥1 정규화
function computePeaks(data: Float32Array, buckets: number): number[] {
  const out = new Array(buckets).fill(0);
  const size = Math.floor(data.length / buckets) || 1;
  for (let i = 0; i < buckets; i++) {
    let max = 0;
    const start = i * size;
    const end = Math.min(data.length, start + size);
    for (let j = start; j < end; j++) {
      const a = Math.abs(data[j]);
      if (a > max) max = a;
    }
    out[i] = max;
  }
  const peak = Math.max(...out, 1e-6);
  return out.map((v) => v / peak);
}

// 말 흐름 패턴 유형 — 자가 점검용 일반 설명 라벨(점수·등급 산출 없음)
type PatternType = "I" | "UR" | "R1" | "R2" | "P" | "B";

const TYPES: {
  id: PatternType;
  label: string;
  key: string;
  description: string;
  hex: string;
}[] = [
  { id: "I", label: "간투사", key: "1", description: "의미 없는 삽입어 (예: 음·어·그)", hex: "#B79268" },
  { id: "UR", label: "수정·고쳐말하기", key: "2", description: "말하다 멈추고 다시 시작/고침 (예: 난 아니 제가)", hex: "#5A6E3D" },
  { id: "R1", label: "낱말 반복", key: "3", description: "다음절 낱말·구를 반복 (예: 어제-어제)", hex: "#1F4E79" },
  { id: "R2", label: "음절 반복", key: "4", description: "음절·일음절을 반복 (예: 지-지-지구)", hex: "#C0492F" },
  { id: "P", label: "연장", key: "5", description: "소리를 길게 늘임 (예: 스ː프·어~). 전사엔 ː·~·— 또는 같은 글자 반복", hex: "#1F8A70" },
  { id: "B", label: "막힘", key: "6", description: "소리가 막혀 안 나옴 (예: #사과). 전사엔 # 또는 (막힘)", hex: "#7A4FB0" },
];

const EXAMPLE_TRANSCRIPT =
  "음 어제 하- 아니 학교 에-에-에서 #친구를 마- 만났-만났어요 그래서 스ː트레스 받았어요";

type TagSource = "manual" | "transcript";
type Tag = {
  id: number;
  time: number; // 점 표시이거나 구간의 시작(sec)
  end?: number; // 구간 표시일 때 끝(sec)
  type: PatternType;
  emphasized: boolean; // 사용자가 특별히 표시한 항목
  source: TagSource;
  reviewed: boolean; // false = 자동 1차 초안(검토 필요)
  note?: string;
};

const SOURCE_LABEL: Record<TagSource, string> = {
  manual: "직접 표시",
  transcript: "전사 기반",
};

type Stage = "input" | "review";

// ── 공용 인라인 스타일 ──
const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  fontSize: 14,
  color: "var(--text)",
};
const errorBox: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  fontSize: 13.5,
  lineHeight: 1.6,
  background: "#F6E4DE",
  color: "#8A2F1C",
  border: "1px solid #E6C3B8",
};

export default function FluencyClient() {
  const [stage, setStage] = useState<Stage>("input");
  const [recording, setRecording] = useState(false);
  const [recElapsed, setRecElapsed] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  // 파형 표시 + 클릭으로 패턴 표시
  const [peaks, setPeaks] = useState<number[]>([]);
  const [cursorTime, setCursorTime] = useState(0);
  const [activeType, setActiveType] = useState<PatternType | null>(null);

  const [tags, setTags] = useState<Tag[]>([]);

  const [transcript, setTranscript] = useState("");
  const [syllables, setSyllables] = useState("");

  // 보고서 정보
  const [name, setName] = useState("");
  const [taskName, setTaskName] = useState("자유 말하기");
  const [notes, setNotes] = useState("");
  const [subj, setSubj] = useState<{ subject: string | null; clinician: string; chartSvg?: string }>({ subject: null, clinician: "" });

  const asr = useKoreanASR();
  const tagIdRef = useRef(1);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recStreamRef = useRef<MediaStream | null>(null);
  const recTimerRef = useRef<number | null>(null);
  const recStartRef = useRef(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stageRef = useRef<Stage>("input");
  const durationRef = useRef(0);

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);
  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  // 오디오 → URL + 전사 기반 1차 자동 태깅(초안)
  const handleAudioBlob = useCallback(
    (blob: Blob, seedTranscript?: string, seedSyll?: string) => {
      const url = URL.createObjectURL(blob);
      setAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      // 파형 피크 디코드 (서버 업로드 없이 브라우저에서)
      setPeaks([]);
      setCursorTime(0);
      decodeAudioFile(blob)
        .then(({ data, duration: d }) => {
          setPeaks(computePeaks(data, 600));
          if (isFinite(d) && d > 0) setDuration(d);
        })
        .catch(() => setPeaks([]));
      const tText = seedTranscript ?? "";
      if (seedTranscript !== undefined) setTranscript(seedTranscript);
      if (seedSyll !== undefined) setSyllables(seedSyll);

      // duration 은 audio onLoadedMetadata 에서 채워지므로 0 으로 추정 후
      // 사용자가 전사로 재분석할 때 정확한 위치로 갱신할 수 있음
      const drafts: Tag[] = [];
      if (tText.trim()) {
        for (const d of tagFromTranscript(tText, 0)) {
          drafts.push({
            id: tagIdRef.current++,
            time: d.time,
            type: d.type as PatternType,
            emphasized: false,
            source: "transcript",
            reviewed: false,
            note: d.note,
          });
        }
      }
      drafts.sort((a, b) => a.time - b.time);
      setTags(drafts);
      setStage("review");
    },
    [],
  );

  const startRecording = useCallback(async () => {
    setMicError(null);
    setTranscript("");
    if (typeof MediaRecorder === "undefined") {
      setMicError(
        "이 브라우저에서는 녹음을 사용할 수 없어요. 크롬·엣지 최신 버전을 권장하거나, 오디오 파일을 업로드하세요.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      recStreamRef.current = stream;
      recChunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) recChunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(recChunksRef.current, {
          type: mr.mimeType || "audio/webm",
        });
        stream.getTracks().forEach((t) => t.stop());
        recStreamRef.current = null;
        handleAudioBlob(blob);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
      setRecElapsed(0);
      recStartRef.current = performance.now();
      recTimerRef.current = window.setInterval(() => {
        setRecElapsed((performance.now() - recStartRef.current) / 1000);
      }, 100);
      if (asr.supported) asr.start();
    } catch (err) {
      console.error(err);
      setMicError(
        "마이크 접근에 실패했어요 — 주소창의 마이크 권한을 확인하거나 오디오 파일 업로드를 사용하세요.",
      );
    }
  }, [asr, handleAudioBlob]);

  const stopRecording = useCallback(() => {
    if (recTimerRef.current !== null) {
      clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
    setRecording(false);
    asr.stop();
    mediaRecorderRef.current?.stop();
  }, [asr]);

  // 녹음 종료 후 ASR 전사 자동 채움 (참고용 — 말한 그대로가 아닐 수 있음)
  useEffect(() => {
    if (stage !== "review" || !asr.supported) return;
    const finalText = asr.finalTranscript.trim();
    if (!finalText) return;
    setTranscript((prev) => prev || finalText);
    setSyllables((prev) => prev || String(countKoreanSyllables(finalText)));
  }, [stage, asr.finalTranscript, asr.supported]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMicError(null);
    handleAudioBlob(file);
  };

  const loadExample = useCallback(() => {
    setMicError(null);
    setName((c) => c || "예시");
    setTaskName("문장 따라말하기");
    // 예시: 오디오 없이 전사만으로 태깅 흐름을 체험
    const drafts: Tag[] = tagFromTranscript(EXAMPLE_TRANSCRIPT, 0).map((d) => ({
      id: tagIdRef.current++,
      time: d.time,
      type: d.type as PatternType,
      emphasized: false,
      source: "transcript" as TagSource,
      reviewed: false,
      note: d.note,
    }));
    setTranscript(EXAMPLE_TRANSCRIPT);
    setSyllables(String(countKoreanSyllables(EXAMPLE_TRANSCRIPT)));
    setTags(drafts.sort((a, b) => a.time - b.time));
    setStage("review");
  }, []);

  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play();
      setPlaying(true);
    } else {
      a.pause();
      setPlaying(false);
    }
  }, []);

  const seek = useCallback((t: number) => {
    const a = audioRef.current;
    if (a) a.currentTime = t;
    setCursorTime(t);
  }, []);

  // 재생 중 파형 커서 갱신
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const loop = () => {
      const a = audioRef.current;
      if (a) setCursorTime(a.currentTime);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const addTagAt = useCallback((type: PatternType, time: number, end?: number) => {
    setTags((prev) =>
      [
        ...prev,
        {
          id: tagIdRef.current++,
          time,
          ...(end != null ? { end } : {}),
          type,
          emphasized: false,
          source: "manual" as TagSource,
          reviewed: true,
        },
      ].sort((a, b) => a.time - b.time),
    );
  }, []);

  // 파형 클릭/드래그: 시작 위치로 이동 + (유형 선택 상태면) 그 지점(클릭) 또는 구간(드래그)에 패턴 표시
  const handleWaveformCommit = useCallback((start: number, end: number | null) => {
    seek(start);
    if (!activeType) return;
    if (end != null && end - start >= 0.08) addTagAt(activeType, start, end);
    else addTagAt(activeType, start);
  }, [seek, activeType, addTagAt]);

  // 키보드: 1-6 태그, space 재생/정지
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (stageRef.current !== "review") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT") return;
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
        return;
      }
      const t = TYPES.find((tt) => tt.key === e.key);
      if (t) {
        e.preventDefault();
        addTagAt(t.id, audioRef.current?.currentTime ?? 0);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [addTagAt, togglePlay]);

  const removeTag = (id: number) =>
    setTags((prev) => prev.filter((t) => t.id !== id));
  const toggleEmphasis = (id: number) =>
    setTags((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, emphasized: !t.emphasized, reviewed: true } : t,
      ),
    );
  const changeTagType = (id: number, type: PatternType) =>
    setTags((prev) =>
      prev.map((t) => (t.id === id ? { ...t, type, reviewed: true } : t)),
    );
  const confirmTag = (id: number) =>
    setTags((prev) =>
      prev.map((t) => (t.id === id ? { ...t, reviewed: true } : t)),
    );
  const confirmAll = () =>
    setTags((prev) => prev.map((t) => ({ ...t, reviewed: true })));
  const removeDrafts = () => setTags((prev) => prev.filter((t) => t.reviewed));

  const reanalyzeTranscript = () => {
    const drafts = tagFromTranscript(transcript, durationRef.current).map(
      (d) => ({
        id: tagIdRef.current++,
        time: d.time,
        type: d.type as PatternType,
        emphasized: false,
        source: "transcript" as TagSource,
        reviewed: false,
        note: d.note,
      }),
    );
    setTags((prev) =>
      [
        ...prev.filter((t) => !(t.source === "transcript" && !t.reviewed)),
        ...drafts,
      ].sort((a, b) => a.time - b.time),
    );
  };

  const recountFromTranscript = () =>
    setSyllables(String(countKoreanSyllables(transcript)));

  const reset = () => {
    if (recTimerRef.current !== null) clearInterval(recTimerRef.current);
    if (recStreamRef.current)
      recStreamRef.current.getTracks().forEach((t) => t.stop());
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setStage("input");
    setRecording(false);
    setRecElapsed(0);
    setAudioUrl(null);
    setDuration(0);
    setPlaying(false);
    setPeaks([]);
    setCursorTime(0);
    setActiveType(null);
    setTags([]);
    setTranscript("");
    setSyllables("");
    setMicError(null);
    asr.reset();
  };

  useEffect(
    () => () => {
      if (recTimerRef.current !== null) clearInterval(recTimerRef.current);
      if (recStreamRef.current)
        recStreamRef.current.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const downloadFluencyReport = () => {
    const total = tags.length;
    const ratio =
      validSyll && total > 0 ? ((total / syllablesNum) * 100).toFixed(1) : "-";
    downloadReport(
      {
        title: "유창성 자가 점검 결과",
        subtitle: `${taskName}`,
        meta: {
          subject: subj.subject ?? (name.trim() || undefined),
          clinician: subj.clinician || undefined,
        },
        chartSvg: subj.chartSvg,
        sections: [
          {
            heading: "패턴 빈도",
            rows: [
              ...TYPES.map((t) => ({
                label: `${t.label}`,
                value: `${counts[t.id]} 회`,
              })),
              { label: "전체 표시 수", value: `${total} 회` },
            ],
          },
          {
            heading: "자가 점검 비율",
            rows: [
              {
                label: "기준 음절 수",
                value: validSyll ? `${syllablesNum} 음절` : "-",
              },
              {
                label: "음절 100개당 표시 비율",
                value: ratio === "-" ? "-" : `${ratio} / 100음절`,
              },
            ],
          },
          ...(tags.length > 0
            ? [
                {
                  heading: "표시 상세",
                  rows: tags.map((t) => {
                    const meta = TYPES.find((m) => m.id === t.type);
                    return {
                      label: t.end != null ? `${t.time.toFixed(2)}–${t.end.toFixed(2)}s` : `${t.time.toFixed(2)}s`,
                      value: `${meta?.label ?? t.type}${t.emphasized ? " (강조)" : ""}`,
                      ref: t.note ?? SOURCE_LABEL[t.source],
                    };
                  }),
                },
              ]
            : []),
        ],
        footnote:
          "본 결과는 말 흐름을 스스로 살펴보기 위한 자가 점검 자료입니다. 표시 항목은 사용자가 직접 확인·수정한 것이며, 어떤 점수·등급·판정도 제공하지 않습니다.",
      },
      "유창성자가점검",
    );
  };

  // ---- 파생값 ----
  const syllablesNum = parseInt(syllables, 10);
  const validSyll = !isNaN(syllablesNum) && syllablesNum > 0;
  const counts: Record<PatternType, number> = { I: 0, UR: 0, R1: 0, R2: 0, P: 0, B: 0 };
  for (const tag of tags) counts[tag.type]++;
  const unreviewed = tags.filter((t) => !t.reviewed).length;
  const ratioPer100 =
    validSyll && tags.length > 0 ? (tags.length / syllablesNum) * 100 : 0;

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${Math.floor(s % 60)
      .toString()
      .padStart(2, "0")}`;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {micError && <div style={errorBox}>{micError}</div>}

      {/* ─── 입력 ─── */}
      {stage === "input" && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 16,
            }}
          >
            <div className="card">
              <div className="card-body">
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--text)" }}>
                  ① 마이크 녹음
                </h2>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-mute)" }}>
                  말한 뒤 다시 들으며 패턴을 표시해요.
                </p>
                <div style={{ margin: "24px 0", textAlign: "center" }}>
                  <div
                    style={{
                      fontSize: 44,
                      fontWeight: 800,
                      fontVariantNumeric: "tabular-nums",
                      color: "var(--text)",
                    }}
                  >
                    {fmt(recElapsed)}
                  </div>
                </div>
                {!recording ? (
                  <button
                    className="btn btn-primary"
                    style={{ width: "100%" }}
                    onClick={startRecording}
                  >
                    ● 녹음 시작
                  </button>
                ) : (
                  <button
                    className="btn"
                    style={{
                      width: "100%",
                      background: "#C0492F",
                      color: "#fff",
                      border: "none",
                    }}
                    onClick={stopRecording}
                  >
                    ■ 녹음 종료
                  </button>
                )}
                {recording && asr.supported && (
                  <p
                    style={{
                      marginTop: 12,
                      minHeight: "1.5rem",
                      borderRadius: 8,
                      background: "var(--surface-2)",
                      padding: "4px 8px",
                      fontSize: 12,
                      color: "var(--text-soft)",
                    }}
                  >
                    {asr.finalTranscript}
                    <span style={{ color: "var(--text-mute)" }}> {asr.interim}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-body">
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--text)" }}>
                  ② 오디오 파일 업로드
                </h2>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-mute)" }}>
                  wav · mp3 · m4a · webm 등. 브라우저에서 처리하며 서버 업로드가 없어요.
                </p>
                <label
                  style={{
                    marginTop: 24,
                    display: "flex",
                    height: 128,
                    cursor: "pointer",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 12,
                    border: "2px dashed var(--border-strong)",
                    background: "var(--surface-2)",
                    color: "var(--text-soft)",
                  }}
                >
                  <span style={{ fontSize: 28 }}>📁</span>
                  <span style={{ marginTop: 8, fontSize: 14 }}>
                    파일 선택 또는 끌어다 놓기
                  </span>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={onFile}
                    style={{ display: "none" }}
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="card">
            <div
              className="card-body"
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                fontSize: 14,
                color: "var(--text-soft)",
              }}
            >
              <span>
                처음이라면 <b>예시 전사</b>로 자동 표시 → 검토 → 결과 흐름을 체험해 보세요.
              </span>
              <button className="btn btn-sm" onClick={loadExample}>
                예시 전사 불러오기
              </button>
            </div>
          </div>
        </>
      )}

      {/* ─── 검토 ─── */}
      {stage === "review" && (
        <>
          <div className="card">
            <div className="card-body">
              <div
                style={{
                  marginBottom: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--text)" }}>
                  다시 듣고 패턴 표시
                </h2>
                <button className="btn btn-sm" onClick={reset}>
                  새로 하기
                </button>
              </div>

              {audioUrl ? (
                <audio
                  ref={audioRef}
                  src={audioUrl}
                  controls
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onEnded={() => setPlaying(false)}
                  onLoadedMetadata={(e) => {
                    const d = e.currentTarget.duration;
                    if (isFinite(d) && d > 0) setDuration(d);
                  }}
                  style={{ width: "100%" }}
                />
              ) : (
                <p style={{ fontSize: 13, color: "var(--text-mute)", margin: 0 }}>
                  (예시 전사 모드 — 오디오 없이 전사 기반으로 패턴을 표시합니다.)
                </p>
              )}

              {audioUrl && (
                <div
                  style={{
                    marginTop: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <button className="btn btn-sm" onClick={togglePlay}>
                    {playing ? "⏸ 일시정지" : "▶ 재생"}
                  </button>
                  <span style={{ fontSize: 12, color: "var(--text-mute)" }}>
                    Space 재생/정지 · 재생 중 키 1–6 으로 현재 위치에 표시
                  </span>
                </div>
              )}

              {/* 파형 — 클릭한 위치에 패턴 표시 */}
              {audioUrl && peaks.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <FluencyWaveform
                    peaks={peaks}
                    duration={duration}
                    cursorTime={cursorTime}
                    tags={tags}
                    onCommit={handleWaveformCommit}
                    activeHex={activeType ? (TYPES.find((t) => t.id === activeType)?.hex ?? null) : null}
                  />
                </div>
              )}

              {/* 유형 선택 → 파형 클릭으로 표시 */}
              <div
                style={{
                  marginTop: 12,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
                  gap: 8,
                }}
              >
                {TYPES.map((t) => {
                  const on = activeType === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setActiveType((prev) => (prev === t.id ? null : t.id))}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        borderRadius: 12,
                        padding: "10px",
                        border: "none",
                        background: t.hex,
                        color: "#fff",
                        cursor: "pointer",
                        opacity: activeType && !on ? 0.5 : 1,
                        boxShadow: on ? "0 0 0 3px var(--text), 0 0 0 5px #fff" : "none",
                        transform: on ? "translateY(-1px)" : "none",
                        transition: "opacity 0.12s, box-shadow 0.12s, transform 0.12s",
                      }}
                      title={`${t.label} (키 ${t.key})`}
                    >
                      <span style={{ fontSize: 13, fontWeight: 700 }}>
                        {on ? "✓ " : ""}{t.label}
                      </span>
                      <span style={{ marginTop: 2, fontSize: 11, opacity: 0.85 }}>
                        [{t.key}]
                      </span>
                    </button>
                  );
                })}
              </div>
              <div
                style={{
                  marginTop: 8,
                  borderRadius: 10,
                  border: `1px solid ${activeType ? "var(--primary)" : "var(--border)"}`,
                  background: activeType ? "var(--primary-soft)" : "var(--surface-2)",
                  padding: "8px 12px",
                  fontSize: 12.5,
                  color: activeType ? "var(--primary)" : "var(--text-soft)",
                  lineHeight: 1.6,
                }}
              >
                {activeType ? (
                  <>
                    <b>{TYPES.find((t) => t.id === activeType)?.label}</b> 선택됨 — {audioUrl && peaks.length > 0 ? "파형을 클릭(한 지점)하거나 드래그(구간)해 표시하세요" : "재생 중 키로 현재 위치에 표시하세요"}. (유형을 다시 누르면 해제)
                  </>
                ) : (
                  <>위 유형을 하나 고른 뒤 {audioUrl && peaks.length > 0 ? "파형을 클릭(지점)하거나 드래그(구간)하면" : "재생 중 키 1–6 으로 현재 위치에"} 표시가 추가돼요.</>
                )}
              </div>
            </div>
          </div>

          {/* 자동 1차 표시 안내 */}
          {unreviewed > 0 && (
            <div
              className="card"
              style={{ borderColor: "var(--accent)" }}
            >
              <div
                className="card-body"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  fontSize: 14,
                  color: "var(--text-soft)",
                }}
              >
                <span>
                  🔎 <b>전사 기반 자동 표시 {unreviewed}건</b>이 검토 대기 중이에요.
                  들으면서 유형·위치를 확인하고 채택하거나 수정·삭제하세요.
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-sm" onClick={confirmAll}>
                    모두 확인
                  </button>
                  <button className="btn btn-sm" onClick={removeDrafts}>
                    초안 모두 삭제
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 표시 목록 (검토/수정) */}
          {tags.length > 0 && (
            <div className="card">
              <div className="card-body">
                <div
                  style={{
                    marginBottom: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
                    표시 {tags.length}건{" "}
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 400,
                        color: "var(--text-mute)",
                      }}
                    >
                      (검토 완료 {tags.length - unreviewed} · 초안 {unreviewed})
                    </span>
                  </h3>
                </div>
                <div style={{ maxHeight: 288, overflowY: "auto" }}>
                  <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse" }}>
                    <thead style={{ position: "sticky", top: 0, background: "var(--surface)" }}>
                      <tr
                        style={{
                          borderBottom: "1px solid var(--border)",
                          textAlign: "left",
                          fontSize: 12,
                          color: "var(--text-mute)",
                        }}
                      >
                        <th style={{ padding: "8px 8px 8px 0" }}>시간</th>
                        <th style={{ padding: "8px 8px 8px 0" }}>유형 (수정)</th>
                        <th style={{ padding: "8px 8px 8px 0" }}>출처</th>
                        <th style={{ padding: "8px 0" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {tags.map((tag) => {
                        const meta = TYPES.find((t) => t.id === tag.type);
                        return (
                          <tr
                            key={tag.id}
                            style={{
                              borderBottom: "1px solid var(--border)",
                              background: tag.reviewed
                                ? "transparent"
                                : "var(--surface-2)",
                            }}
                          >
                            <td style={{ padding: "6px 8px 6px 0" }}>
                              <button
                                onClick={() => seek(tag.time)}
                                style={{
                                  background: "none",
                                  border: "none",
                                  padding: 0,
                                  fontVariantNumeric: "tabular-nums",
                                  color: "var(--accent)",
                                  textDecoration: "underline",
                                  cursor: "pointer",
                                  fontSize: 13,
                                }}
                              >
                                {tag.end != null ? `${tag.time.toFixed(2)}–${tag.end.toFixed(2)}s` : `${tag.time.toFixed(2)}s`}
                              </button>
                            </td>
                            <td style={{ padding: "6px 8px 6px 0" }}>
                              <select
                                value={tag.type}
                                onChange={(e) =>
                                  changeTagType(
                                    tag.id,
                                    e.target.value as PatternType,
                                  )
                                }
                                style={{
                                  borderRadius: 8,
                                  border: "1px solid var(--border)",
                                  background: "var(--surface)",
                                  padding: "4px 6px",
                                  fontSize: 12,
                                  color: "var(--text)",
                                }}
                              >
                                {TYPES.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.label}
                                  </option>
                                ))}
                              </select>
                              {tag.note && (
                                <span
                                  style={{
                                    marginLeft: 4,
                                    fontSize: 10,
                                    color: "var(--text-mute)",
                                  }}
                                  title={tag.note}
                                >
                                  ⓘ
                                </span>
                              )}
                              {tag.emphasized && (
                                <span
                                  className="badge"
                                  style={{
                                    marginLeft: 6,
                                    background: "#F4E4C8",
                                    color: "#8A6422",
                                    borderColor: "#E8D097",
                                    fontSize: 10,
                                  }}
                                >
                                  강조
                                </span>
                              )}
                            </td>
                            <td style={{ padding: "6px 8px 6px 0" }}>
                              <span
                                className="badge"
                                style={{
                                  background: "var(--surface-2)",
                                  color: "var(--text-soft)",
                                  borderColor: "transparent",
                                  fontSize: 10,
                                }}
                              >
                                {SOURCE_LABEL[tag.source]}
                              </span>
                            </td>
                            <td
                              style={{
                                padding: "6px 0",
                                textAlign: "right",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {!tag.reviewed && (
                                <button
                                  onClick={() => confirmTag(tag.id)}
                                  style={{
                                    marginRight: 8,
                                    background: "none",
                                    border: "none",
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: "var(--primary)",
                                    cursor: "pointer",
                                  }}
                                  title="이 자동 표시를 확인(채택)"
                                >
                                  ✓확인
                                </button>
                              )}
                              <button
                                onClick={() => toggleEmphasis(tag.id)}
                                style={{
                                  marginRight: 8,
                                  background: "none",
                                  border: "none",
                                  fontSize: 12,
                                  color: "var(--text-mute)",
                                  cursor: "pointer",
                                }}
                                title="강조 표시 토글"
                              >
                                강조↕
                              </button>
                              <button
                                onClick={() => removeTag(tag.id)}
                                style={{
                                  background: "none",
                                  border: "none",
                                  fontSize: 12,
                                  color: "var(--text-mute)",
                                  cursor: "pointer",
                                }}
                              >
                                제거
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 전사 + 음절 */}
          <div className="card">
            <div className="card-body" style={{ display: "grid", gap: 12 }}>
              <div className="field">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <label style={{ fontSize: 14, fontWeight: 600, color: "var(--text-soft)" }}>
                    전사 (말한 그대로 — 자동 표시에 사용)
                  </label>
                  <button
                    className="btn btn-sm"
                    onClick={reanalyzeTranscript}
                    disabled={!transcript.trim()}
                  >
                    전사로 다시 표시 (간투사·반복·수정)
                  </button>
                </div>
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  rows={3}
                  placeholder="예: 음 어제 하- 아니 학교 에-에-에서 #친구를 만났-만났어요  (반복은 '-', 연장은 'ː·~·—'(스ː프), 막힘은 '#'(#사과), 간투사는 음·어 등으로 적으면 자동 표시 정확도가 올라가요)"
                  style={{
                    resize: "vertical",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: "var(--text)",
                    fontFamily: "inherit",
                  }}
                />
              </div>
              <div className="field">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <label style={{ fontSize: 14, fontWeight: 600, color: "var(--text-soft)" }}>
                    기준 음절 수 (비율 분모)
                  </label>
                  <button className="btn btn-sm" onClick={recountFromTranscript}>
                    전사 → 음절 수 다시 세기
                  </button>
                </div>
                <input
                  type="number"
                  min={1}
                  value={syllables}
                  onChange={(e) => setSyllables(e.target.value)}
                  placeholder="예: 87"
                  style={{
                    ...inputStyle,
                    fontSize: 16,
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                  }}
                />
              </div>
            </div>
          </div>

          {/* ─── 결과 요약 ─── */}
          <div className="card">
            <div className="card-body">
              <div
                style={{
                  marginBottom: 12,
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--text)" }}>
                    유창성 자가 점검 결과
                  </h2>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-mute)" }}>
                    직접 확인·수정한 표시를 모아 빈도와 비율을 보여줘요. 점수·판정이 아닙니다.
                  </p>
                </div>
                <button className="btn btn-primary btn-sm" onClick={downloadFluencyReport}>
                  📄 결과 보고서 다운로드
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 12,
                  marginBottom: 14,
                }}
              >
                <div className="field">
                  <label>이름·별칭 (선택)</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="예: 홍길동"
                    style={inputStyle}
                  />
                </div>
                <div className="field">
                  <label>과제</label>
                  <input
                    value={taskName}
                    onChange={(e) => setTaskName(e.target.value)}
                    placeholder="자유 말하기 / 읽기 등"
                    style={inputStyle}
                  />
                </div>
              </div>

              {unreviewed > 0 && (
                <p
                  style={{
                    ...errorBox,
                    background: "#F4E4C8",
                    color: "#8A6422",
                    border: "1px solid #E8D097",
                    marginBottom: 14,
                  }}
                >
                  아직 검토하지 않은 자동 초안 {unreviewed}건이 집계에 포함되어 있어요.
                  위 표시 목록에서 확인/수정한 뒤 보고서를 받으세요.
                </p>
              )}

              <div style={{ overflowX: "auto", marginBottom: 14 }}>
                <table
                  style={{
                    width: "100%",
                    fontSize: 14,
                    borderCollapse: "collapse",
                    border: "1px solid var(--border)",
                  }}
                >
                  <thead>
                    <tr style={{ background: "var(--surface-2)", textAlign: "left" }}>
                      <th style={{ border: "1px solid var(--border)", padding: "8px 12px" }}>유형</th>
                      {TYPES.map((t) => (
                        <th
                          key={t.id}
                          style={{
                            border: "1px solid var(--border)",
                            padding: "8px",
                            textAlign: "center",
                          }}
                        >
                          {t.label}
                        </th>
                      ))}
                      <th
                        style={{
                          border: "1px solid var(--border)",
                          padding: "8px",
                          textAlign: "center",
                        }}
                      >
                        계
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td
                        style={{
                          border: "1px solid var(--border)",
                          padding: "8px 12px",
                          color: "var(--text-soft)",
                        }}
                      >
                        빈도
                      </td>
                      {TYPES.map((t) => (
                        <td
                          key={t.id}
                          style={{
                            border: "1px solid var(--border)",
                            padding: "8px",
                            textAlign: "center",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {counts[t.id]}
                        </td>
                      ))}
                      <td
                        style={{
                          border: "1px solid var(--border)",
                          padding: "8px",
                          textAlign: "center",
                          fontWeight: 700,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {tags.length}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 12,
                }}
              >
                <ResultBox label="전체 표시 수" value={`${tags.length}`} />
                <ResultBox
                  label="기준 음절 수"
                  value={validSyll ? `${syllablesNum}` : "-"}
                />
                <ResultBox
                  label="100음절당 비율"
                  value={validSyll && tags.length > 0 ? ratioPer100.toFixed(1) : "-"}
                  sub="표시 수 ÷ 음절 × 100"
                  highlight
                />
              </div>
            </div>
          </div>

          <ToolMonitor
            module="fluency"
            getMetrics={() =>
              tags.length > 0
                ? {
                    total: tags.length,
                    I: counts.I, UR: counts.UR, R1: counts.R1, R2: counts.R2, P: counts.P, B: counts.B,
                    syllables: validSyll ? syllablesNum : 0,
                    per100: validSyll && tags.length > 0 ? Number(ratioPer100.toFixed(1)) : 0,
                  }
                : null
            }
            renderSummary={(m) =>
              `총 ${m.total ?? "-"}회 (간투사 ${m.I ?? 0}·반복 ${(Number(m.R1 ?? 0) + Number(m.R2 ?? 0))}·수정 ${m.UR ?? 0}·연장 ${m.P ?? 0}·막힘 ${m.B ?? 0})${m.per100 ? ` · 100음절당 ${m.per100}` : ""}`
            }
            renderRowChart={(m) => {
              const total = Number(m.total) || 0;
              if (total <= 0) return null;
              const segs = TYPES.map((t) => ({ label: t.label, count: Number(m[t.id]) || 0, color: t.hex }))
                .filter((s) => s.count > 0)
                .map((s) => ({ ...s, pct: (s.count / total) * 100 }));
              return <TypeBar segs={segs} />;
            }}
            trend={{ key: "total", label: "비유창 표시 수", unit: "회" }}
            onContext={setSubj}
          />
        </>
      )}

      {/* 유형 설명 */}
      <details className="card" style={{ padding: 0 }}>
        <summary
          style={{
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-soft)",
            padding: "14px 18px",
          }}
        >
          말 흐름 패턴 유형 설명
        </summary>
        <div style={{ padding: "0 18px 16px", display: "grid", gap: 10 }}>
          {TYPES.map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <span
                style={{
                  marginTop: 2,
                  display: "inline-flex",
                  height: 20,
                  minWidth: 20,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 6,
                  padding: "0 6px",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#fff",
                  background: t.hex,
                }}
              >
                {t.key}
              </span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontWeight: 700, color: "var(--text)", fontSize: 14 }}>
                  {t.label}
                </p>
                <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--text-soft)" }}>
                  {t.description}
                </p>
              </div>
            </div>
          ))}
          <div
            style={{
              marginTop: 6,
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--surface-2)",
              padding: "10px 12px",
              fontSize: 12,
              color: "var(--text-soft)",
              lineHeight: 1.7,
            }}
          >
            전사(말한 그대로) 기반 자동 표시는 간투사·낱말/음절 반복·수정/고쳐말하기를
            텍스트에서 찾아 초안으로 제안해요. 위치는 음절 비율로 추정하므로,
            다시 들으며 사용자가 확인·수정하는 것을 전제로 합니다. 모든 표시는 자가 점검용이며
            점수·등급·판정을 제공하지 않습니다.
          </div>
        </div>
      </details>
    </div>
  );
}

// 모니터링 세션별 비유창 유형 분포 막대
function TypeBar({ segs }: { segs: { label: string; count: number; color: string; pct: number }[] }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ display: "flex", height: 16, borderRadius: 6, overflow: "hidden", background: "var(--surface)", border: "1px solid var(--border)" }}>
        {segs.map((s) => (
          <div
            key={s.label}
            title={`${s.label} ${s.count}회`}
            style={{ width: `${s.pct}%`, background: s.color, display: "flex", alignItems: "center", justifyContent: "center", minWidth: 0 }}
          >
            {s.pct >= 14 && <span style={{ fontSize: 9.5, fontWeight: 700, color: "#fff" }}>{s.count}</span>}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 10.5, color: "var(--text-soft)" }}>
        {segs.map((s) => (
          <span key={s.label} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: s.color, display: "inline-block" }} />
            {s.label} {s.count}
          </span>
        ))}
      </div>
    </div>
  );
}

const WAVE_H = 76;

// 파형 + 패턴 마커(점/구간) + 재생 커서. 클릭=지점, 드래그=구간 → onCommit(start, end|null).
function FluencyWaveform({
  peaks,
  duration,
  cursorTime,
  tags,
  onCommit,
  activeHex,
}: {
  peaks: number[];
  duration: number;
  cursorTime: number;
  tags: Tag[];
  onCommit: (start: number, end: number | null) => void;
  activeHex: string | null;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragStartRef = useRef<number | null>(null);
  const liveRef = useRef<{ a: number; b: number } | null>(null);
  const [live, setLive] = useState<{ a: number; b: number } | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const draw = () => {
      const cssW = wrap.clientWidth;
      const cssH = WAVE_H;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(cssW * dpr));
      canvas.height = Math.floor(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.fillStyle = "#F5EDE0";
      ctx.fillRect(0, 0, cssW, cssH);
      const mid = cssH / 2;
      const n = peaks.length;
      if (n === 0) return;
      const barW = cssW / n;
      ctx.fillStyle = "#9FAE86";
      for (let i = 0; i < n; i++) {
        const h = Math.max(1, peaks[i] * cssH * 0.9);
        ctx.fillRect(i * barW, mid - h / 2, Math.max(0.5, barW), h);
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [peaks]);

  const timeAt = (clientX: number): number => {
    const wrap = wrapRef.current;
    if (!wrap || duration <= 0) return 0;
    const rect = wrap.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * duration;
  };

  const beginDrag = (clientX: number) => {
    if (duration <= 0) return;
    const t = timeAt(clientX);
    dragStartRef.current = t;
    liveRef.current = { a: t, b: t };
    setLive({ a: t, b: t });
  };

  // 드래그 추적 + 종료(window 리스너 — 파형 밖에서 떼도 인식)
  useEffect(() => {
    const move = (clientX: number) => {
      if (dragStartRef.current == null) return;
      const r = { a: dragStartRef.current, b: timeAt(clientX) };
      liveRef.current = r;
      setLive(r);
    };
    const onMouseMove = (e: MouseEvent) => move(e.clientX);
    const onTouchMove = (e: TouchEvent) => {
      if (dragStartRef.current != null && e.touches[0]) { e.preventDefault(); move(e.touches[0].clientX); }
    };
    const onUp = () => {
      const s = dragStartRef.current;
      const r = liveRef.current;
      dragStartRef.current = null;
      liveRef.current = null;
      setLive(null);
      if (s == null || !r) return;
      const a = Math.min(r.a, r.b);
      const b = Math.max(r.a, r.b);
      if (b - a < 0.08) onCommit(s, null);
      else onCommit(a, b);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onUp);
    window.addEventListener("touchcancel", onUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onUp);
      window.removeEventListener("touchcancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, onCommit]);

  const pct = (t: number) => (duration > 0 ? Math.max(0, Math.min(100, (t / duration) * 100)) : 0);

  return (
    <div>
      <div
        ref={wrapRef}
        onMouseDown={(e) => { e.preventDefault(); beginDrag(e.clientX); }}
        onTouchStart={(e) => { if (e.touches[0]) beginDrag(e.touches[0].clientX); }}
        style={{
          position: "relative",
          width: "100%",
          height: WAVE_H,
          overflow: "hidden",
          borderRadius: 8,
          border: "1px solid var(--border-strong)",
          background: "#F5EDE0",
          cursor: activeHex ? "crosshair" : "pointer",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        <canvas ref={canvasRef} style={{ display: "block" }} />

        {/* 구간 태그 (음영) */}
        {duration > 0 && tags.filter((t) => t.end != null).map((tag) => {
          const hex = TYPES.find((t) => t.id === tag.type)?.hex ?? "#666";
          const l = pct(tag.time);
          const w = Math.max(0.5, pct(tag.end as number) - l);
          return (
            <div
              key={tag.id}
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${l}%`,
                width: `${w}%`,
                background: hex,
                opacity: tag.reviewed ? 0.26 : 0.16,
                borderLeft: `2px solid ${hex}`,
                borderRight: `2px solid ${hex}`,
                pointerEvents: "none",
                zIndex: 2,
              }}
            />
          );
        })}

        {/* 점 태그 (세로선 + ▼) */}
        {duration > 0 && tags.filter((t) => t.end == null).map((tag) => {
          const hex = TYPES.find((t) => t.id === tag.type)?.hex ?? "#666";
          return (
            <div
              key={tag.id}
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${pct(tag.time)}%`,
                width: tag.emphasized ? 3 : 2,
                marginLeft: tag.emphasized ? -1.5 : -1,
                background: hex,
                opacity: tag.reviewed ? 0.95 : 0.55,
                pointerEvents: "none",
                zIndex: 2,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: -1,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 0,
                  height: 0,
                  borderLeft: "4px solid transparent",
                  borderRight: "4px solid transparent",
                  borderTop: `6px solid ${hex}`,
                }}
              />
            </div>
          );
        })}

        {/* 드래그 중 선택 영역 */}
        {live && Math.abs(live.b - live.a) > 0.001 && (
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${pct(Math.min(live.a, live.b))}%`,
              width: `${Math.max(0, pct(Math.max(live.a, live.b)) - pct(Math.min(live.a, live.b)))}%`,
              background: activeHex ?? "var(--primary)",
              opacity: 0.22,
              border: `1.5px solid ${activeHex ?? "var(--primary)"}`,
              pointerEvents: "none",
              zIndex: 4,
            }}
          />
        )}

        {/* 재생 커서 */}
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${pct(cursorTime)}%`,
            width: 2,
            marginLeft: -1,
            background: "#1F2317",
            opacity: 0.8,
            pointerEvents: "none",
            zIndex: 3,
          }}
        />
      </div>
      <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--text-mute)", lineHeight: 1.6 }}>
        클릭=그 지점으로 이동{activeHex ? "·표시" : ""}, 드래그=구간 선택{activeHex ? "·구간 표시" : ""}. 점은 ▼, 구간은 색 음영으로 나타나요.
      </p>
    </div>
  );
}

function ResultBox({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        borderRadius: 12,
        border: highlight ? "1px solid var(--primary)" : "1px solid var(--border)",
        background: highlight ? "var(--primary-soft)" : "var(--surface)",
        padding: "12px 16px",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 12,
          fontWeight: 500,
          color: "var(--text-mute)",
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: "4px 0 0",
          fontSize: 22,
          fontWeight: 800,
          fontVariantNumeric: "tabular-nums",
          color: highlight ? "var(--primary)" : "var(--text)",
        }}
      >
        {value}
      </p>
      {sub && (
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-mute)" }}>{sub}</p>
      )}
    </div>
  );
}
