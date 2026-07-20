"use client";

// 음운변동 조음 훈련 (바로조음 Phase 2).
// 치료사가 음운변동을 고르면 → 대립쌍 대조 + 오류→목표 3D 애니메이션 + 음향 피드백.
// 근거: 대립쌍(Baker 2022), 단순 시상면+애니메이션(DYNARTmo), KP fade·초점 전환(Maas 2008),
//       centroid 목표대역 게이지(SibilantTrainer 재사용).
// 음향은 조음방법에서 자동 분기(modeOf): 지속음(마찰 등)=실시간 centroid 게이지,
// 순간음(파열·파찰)=캡처(녹음→재생 비교 + 파형, CaptureRecorder).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SagittalArticulator, { type SagittalMode } from "./SagittalArticulator";
import CaptureRecorder from "./CaptureRecorder";
import {
  PROCESSES,
  modeOf,
  type MinimalPair,
  type PhonologicalProcess,
} from "./processes";
import {
  PHONE_OPTIONS,
  deleteCustomProcess,
  loadCustomProcesses,
  loadPairs,
  makeCustomProcess,
  savePairs,
  saveCustomProcesses,
  type CustomProcess,
} from "./customProcesses";
import {
  computeDiffs,
  isLipMorph,
  isTongueMorph,
  phoneById,
  type Highlight,
} from "@/components/articulator/renderCore";
import { useAudioAnalyser } from "@/components/audio/useAudioAnalyser";
import { analyzeSibilantSpectrum } from "@/components/vocalTract/spectralMoments";
import SaveToHistory from "@/components/SaveToHistory";
import { lerpPose, fullPose, IDLE_POSE, type Pose } from "@/components/articulator/phonemeMap";

// 무음(정조음·오조음 어느 쪽도 아닐 때)에 보여줄 휴지 자세.
const IDLE_FULL = fullPose(IDLE_POSE);

// /ㅅ/ 훈련 앵커 자세: 구개음화(혀 뒤·경구개). 정조음은 목표 자세(c_s) 사용.
const POSE_PALATAL = fullPose({
  tongue_front_up: 0.85, tongue_tip_up: 0, tongue_back_up: 0.6,
  tongue_retract: 0.9, tongue_groove: 0.35, lips_closed: 0.5,
});

const GAUGE_MIN = 2000;
const GAUGE_MAX = 9500;
const EMA_ALPHA = 0.55;
// 왜곡(구개음화) 실시간 매핑 — 센트로이드(Hz) → 혀 후방화(0=정조음 앞/초록, 1=구개음화 뒤/빨강).
// 실제 산출에 민감하게: 이 값 이상=정조음(치조 앞), 이하=구개음화(경구개 뒤). 그 사이 선형.
// (구개음화 /ɕ/는 /s/보다 센트로이드가 내려가지만 목표대역 하한까지 안 떨어질 수 있어 임계를 위로.)
const S_CORRECT_HZ = 5800; // 이 이상 = 정조음(앞)
const S_PALATAL_HZ = 4000; // 이 이하 = 구개음화(뒤)
// 설측음화 추가 판별: 고주파 집중도(hfRatio). 정조음=날카로운 중앙 마찰(hfRatio↑),
// 설측=둔탁·다습(hfRatio↓). centroid 부족분과 평균해 왜곡량 산출.
const HF_CORRECT = 0.82; // 이 이상 = 정조음(집중)
const HF_LATERAL = 0.62; // 이 이하 = 설측(둔탁)

// 강화용 오디오(WebAudio, 외부 에셋 없음). 바르게 유지하면 진행에 따라 음이 높아지는 지속음,
// 목표 도달 시 축하 아르페지오. 컨텍스트는 마이크 세션(사용자 제스처) 중 지연 생성.
function createFeedbackAudio() {
  let ctx: AudioContext | null = null;
  let osc: OscillatorNode | null = null;
  let gain: GainNode | null = null;
  const ensure = (): AudioContext => {
    if (!ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(ctx.destination);
      osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 480;
      osc.connect(gain);
      osc.start();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  };
  return {
    // active=정조음 유지 중, prog=0~1. 진행할수록 음이 높아지고, 정조음일 때만 들림.
    update(active: boolean, prog: number) {
      const c = ensure();
      if (!osc || !gain) return;
      const t = c.currentTime;
      osc.frequency.setTargetAtTime(460 + prog * 520, t, 0.06);
      gain.gain.setTargetAtTime(active ? 0.045 : 0, t, 0.06);
    },
    reward() {
      const c = ensure();
      const t0 = c.currentTime;
      [523, 659, 784, 1047].forEach((f, i) => {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = "triangle";
        o.frequency.value = f;
        o.connect(g);
        g.connect(c.destination);
        const t = t0 + i * 0.11;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.16, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.start(t);
        o.stop(t + 0.32);
      });
    },
    quiet() {
      if (gain && ctx) gain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
    },
  };
}

function freqToX(f: number, w: number, padL: number, padR: number) {
  const inner = w - padL - padR;
  const ratio = (Math.min(GAUGE_MAX, Math.max(GAUGE_MIN, f)) - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN);
  return padL + inner * ratio;
}

type Judged = { attempts: number; correct: number };

export default function ArticulationTrainer() {
  const [processId, setProcessId] = useState<string | null>(null);
  const [custom, setCustom] = useState<CustomProcess[]>([]);
  // 맞춤 변동은 클라이언트 localStorage에서 로드(SSR 불일치 방지: 마운트 후).
  useEffect(() => {
    setCustom(loadCustomProcesses());
  }, []);

  const all = useMemo<PhonologicalProcess[]>(() => [...PROCESSES, ...custom], [custom]);
  const process = useMemo(
    () => all.find((p) => p.id === processId) ?? null,
    [all, processId],
  );

  const addCustom = useCallback((p: CustomProcess) => {
    setCustom((prev) => {
      const next = [...prev, p];
      saveCustomProcesses(next);
      return next;
    });
    setProcessId(p.id); // 만들자마자 연습 화면으로.
  }, []);
  const removeCustom = useCallback((id: string) => {
    setCustom(deleteCustomProcess(id));
  }, []);

  if (!process) {
    return <ProcessPicker builtIn={PROCESSES} custom={custom} onPick={setProcessId} onCreate={addCustom} onDelete={removeCustom} />;
  }
  return <PracticeScreen process={process} onBack={() => setProcessId(null)} />;
}

// ── 변동 선택 화면 ────────────────────────────────────────────────────────────
function ProcessCard({ p, onPick, onDelete }: { p: PhonologicalProcess; onPick: (id: string) => void; onDelete?: (id: string) => void }) {
  const mode = modeOf(p);
  return (
    <div className="group relative flex flex-col items-start gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-emerald-300 hover:shadow">
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`맞춤 변동 「${p.label}」을(를) 삭제할까요?`)) onDelete(p.id);
          }}
          title="맞춤 변동 삭제"
          className="absolute right-2 top-2 z-10 rounded-full px-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500"
        >
          ✕
        </button>
      )}
      <button onClick={() => onPick(p.id)} className="flex w-full flex-col items-start gap-2 text-left">
        <div className="flex w-full items-center justify-between pr-5">
          <span className="text-2xl font-bold tracking-tight text-slate-900">
            {p.targetGrapheme}
            <span className="mx-1 text-slate-300">→</span>
            {p.errorGrapheme}
          </span>
          <span
            className={
              "rounded-full px-2 py-0.5 text-[11px] font-medium " +
              (mode === "live" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")
            }
          >
            {mode === "live" ? "실시간" : "캡처"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          {p.label}
          {"custom" in p && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">맞춤</span>
          )}
        </div>
        <div className="text-xs text-slate-500">{p.metaphorAxis}</div>
        {!p.ready && (
          <div className="mt-1 text-[11px] text-slate-400">3D 애니메이션·대립쌍 제공 · 음향 피드백은 후속</div>
        )}
      </button>
    </div>
  );
}

function ProcessPicker({
  builtIn,
  custom,
  onPick,
  onCreate,
  onDelete,
}: {
  builtIn: PhonologicalProcess[];
  custom: CustomProcess[];
  onPick: (id: string) => void;
  onCreate: (p: CustomProcess) => void;
  onDelete: (id: string) => void;
}) {
  const [building, setBuilding] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-600">
        가르칠 <strong>음운변동</strong>을 고르세요. 각 변동은 목표음↔흔한 오류음의 대조로 구성됩니다.
        필요한 대조가 없으면 <strong>직접 만들어</strong> 쓸 수 있어요.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {builtIn.map((p) => (
          <ProcessCard key={p.id} p={p} onPick={onPick} />
        ))}
        {custom.map((p) => (
          <ProcessCard key={p.id} p={p} onPick={onPick} onDelete={onDelete} />
        ))}
        <button
          onClick={() => setBuilding(true)}
          className="flex min-h-[128px] flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-4 text-slate-400 transition hover:border-emerald-400 hover:text-emerald-600"
        >
          <span className="text-2xl leading-none">＋</span>
          <span className="text-sm font-semibold">직접 만들기</span>
          <span className="text-[11px]">목표·오류 음소를 골라 새 대조 만들기</span>
        </button>
      </div>
      {building && <ProcessBuilder onCancel={() => setBuilding(false)} onCreate={(p) => { setBuilding(false); onCreate(p); }} />}
    </div>
  );
}

// ── 맞춤 변동 빌더 ────────────────────────────────────────────────────────────
function ProcessBuilder({ onCancel, onCreate }: { onCancel: () => void; onCreate: (p: CustomProcess) => void }) {
  const [label, setLabel] = useState("");
  const [targetPhone, setTargetPhone] = useState("c_s");
  const [errorPhone, setErrorPhone] = useState("c_t");
  const [pairs, setPairs] = useState<MinimalPair[]>([]);
  const [t, setT] = useState("");
  const [e, setE] = useState("");

  const addPair = () => {
    const tw = t.trim();
    const ew = e.trim();
    if (!tw || !ew || tw === ew) return;
    setPairs((ps) => [...ps, { target: tw, error: ew }]);
    setT("");
    setE("");
  };
  const canSave = targetPhone !== errorPhone;

  const save = () => {
    if (!canSave) return;
    onCreate(makeCustomProcess({ label, targetPhone, errorPhone, pairs }));
  };

  const opt = (o: (typeof PHONE_OPTIONS)[number]) => `${o.grapheme}  (${o.desc})`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onCancel}>
      <div
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(ev) => ev.stopPropagation()}
      >
        <h3 className="text-base font-bold text-slate-900">맞춤 변동 만들기</h3>
        <p className="mt-1 text-xs text-slate-500">
          기존 음소 자세를 그대로 씁니다. 3D 애니메이션·소리 동기화·대립쌍이 자동 구성돼요.
          <br />
          <span className="text-amber-600">⚠️ 자극어는 SLP가 대치 위치·연령 적합성을 검토한 뒤 사용하세요.</span>
        </p>

        <label className="mt-4 block text-xs font-semibold text-slate-600">이름 (선택)</label>
        <input
          value={label}
          onChange={(ev) => setLabel(ev.target.value)}
          placeholder="예: 마찰음의 파열음화 (우리 아동용)"
          className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
        />

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-emerald-700">목표 음소</label>
            <select
              value={targetPhone}
              onChange={(ev) => setTargetPhone(ev.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            >
              {PHONE_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {opt(o)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-rose-600">오류(대치) 음소</label>
            <select
              value={errorPhone}
              onChange={(ev) => setErrorPhone(ev.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            >
              {PHONE_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {opt(o)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {!canSave && <p className="mt-1 text-[11px] text-rose-500">목표와 오류 음소는 서로 달라야 해요.</p>}

        <label className="mt-4 block text-xs font-semibold text-slate-600">
          대립쌍 (목표어 / 오류어) — 나중에 연습 화면에서도 추가·삭제 가능
        </label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {pairs.map((p, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
              {p.target}<span className="text-slate-400">/</span>{p.error}
              <button onClick={() => setPairs((ps) => ps.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-500">✕</button>
            </span>
          ))}
          {!pairs.length && <span className="text-[11px] text-slate-400">아직 없음 — 아래에서 추가</span>}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <input value={t} onChange={(ev) => setT(ev.target.value)} placeholder="목표어 (예: 사자)" className="w-full rounded-lg border border-emerald-200 px-2 py-1.5 text-sm" />
          <span className="text-slate-300">/</span>
          <input
            value={e}
            onChange={(ev) => setE(ev.target.value)}
            onKeyDown={(ev) => ev.key === "Enter" && addPair()}
            placeholder="오류어 (예: 따자)"
            className="w-full rounded-lg border border-rose-200 px-2 py-1.5 text-sm"
          />
          <button onClick={addPair} className="shrink-0 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">추가</button>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">취소</button>
          <button
            onClick={save}
            disabled={!canSave}
            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            만들고 시작
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 대립쌍(자극어) 편집 — 연습 화면 안에서 즉석 추가·삭제 ──────────────────────
function PairEditor({
  pairs,
  onChange,
  targetGrapheme,
  errorGrapheme,
}: {
  pairs: MinimalPair[];
  onChange: (next: MinimalPair[]) => void;
  targetGrapheme: string;
  errorGrapheme: string;
}) {
  const [t, setT] = useState("");
  const [e, setE] = useState("");
  const add = () => {
    const tw = t.trim();
    const ew = e.trim();
    if (!tw || !ew || tw === ew) return;
    onChange([...pairs, { target: tw, error: ew }]);
    setT("");
    setE("");
  };
  return (
    <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-[11px] text-slate-500">
        아동의 실제 오류를 보고 (목표어 {targetGrapheme} / 오류어 {errorGrapheme}) 짝을 직접 넣으세요.
        <span className="text-amber-600"> SLP 검토 후 사용.</span>
      </p>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {pairs.map((p, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs text-slate-700 shadow-sm">
            {p.target}
            <span className="text-slate-300">/</span>
            {p.error}
            <button
              onClick={() => onChange(pairs.filter((_, j) => j !== i))}
              className="text-slate-400 hover:text-rose-500"
              title="삭제"
            >
              ✕
            </button>
          </span>
        ))}
        {!pairs.length && <span className="text-[11px] text-slate-400">비어 있음 — 아래에서 추가</span>}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          value={t}
          onChange={(ev) => setT(ev.target.value)}
          placeholder="목표어"
          className="w-full rounded-lg border border-emerald-200 px-2 py-1 text-sm"
        />
        <span className="text-slate-300">/</span>
        <input
          value={e}
          onChange={(ev) => setE(ev.target.value)}
          onKeyDown={(ev) => ev.key === "Enter" && add()}
          placeholder="오류어"
          className="w-full rounded-lg border border-rose-200 px-2 py-1 text-sm"
        />
        <button onClick={add} className="shrink-0 rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-700">
          추가
        </button>
      </div>
    </div>
  );
}

// ── 연습 화면 ────────────────────────────────────────────────────────────────
function PracticeScreen({
  process,
  onBack,
}: {
  process: PhonologicalProcess;
  onBack: () => void;
}) {
  const mode = modeOf(process);
  const targetPose = phoneById(process.targetPhone).pose;
  // 왜곡(같은 음소의 조음 변형)이면 대치음 자세 대신 지정된 오류 포즈 사용.
  const errorPose = process.errorPoseOverride ?? phoneById(process.errorPhone).pose;
  // 왜곡 변동 = 대립쌍(뜻 바뀜) 대신 /ㅅ/ 연습 + 마이크 실시간 혀 위치 피드백.
  const isDistortion = !!process.distortion;

  // 움직이는 조음기관(오류→목표 차이)으로 강조 부위 유도.
  const highlight: Highlight = useMemo(() => {
    const diffs = computeDiffs(errorPose, targetPose);
    return {
      tongue: diffs.some((d) => isTongueMorph(d.morph)),
      lips: diffs.some((d) => isLipMorph(d.morph)),
    };
  }, [errorPose, targetPose]);

  const [sagMode, setSagMode] = useState<SagittalMode>("transition");
  const [kpVisible, setKpVisible] = useState(true);
  const [focus, setFocus] = useState<"external" | "internal">("external");
  const [speed, setSpeed] = useState(0.8);
  const [pairIndex, setPairIndex] = useState(0);
  const [breakdown, setBreakdown] = useState<string | null>(null);
  const [judged, setJudged] = useState<Judged>({ attempts: 0, correct: 0 });

  // 대립쌍(자극어)은 치료사가 아동의 실제 오류를 보고 편집 — localStorage에 변동별로 저장.
  const [pairs, setPairs] = useState<MinimalPair[]>(process.minimalPairs);
  useEffect(() => {
    setPairs(loadPairs(process.id, process.minimalPairs));
  }, [process.id, process.minimalPairs]);
  const commitPairs = useCallback(
    (next: MinimalPair[]) => {
      setPairs(next);
      savePairs(process.id, next);
    },
    [process.id],
  );
  const [editPairs, setEditPairs] = useState(false);

  const safePairs = pairs.length ? pairs : process.minimalPairs;
  const pair = safePairs[pairIndex % safePairs.length];

  // ── 실시간 centroid 게이지 (지속음·centroid 변동만) ──
  const liveEnabled = mode === "live" && process.acoustic === "centroid" && !!process.centroidZone;
  const [centroid, setCentroid] = useState<number | null>(null);
  const [isFric, setIsFric] = useState(false);
  const [inZoneCount, setInZoneCount] = useState(0);
  const [sampleCount, setSampleCount] = useState(0);
  const smoothRef = useRef<number | null>(null);

  // 실시간 음향→3D 혀 위치 바이오피드백(왜곡 변동). 매 오디오 프레임 stale 클로저를 피하려고
  // 최신 값을 ref로 읽는다. livePoseRef 가 set 되면 SagittalArticulator가 그 자세를 실시간 렌더.
  const livePoseRef = useRef<Pose | null>(null);
  const liveDisplayRef = useRef<Pose | null>(null); // 프레임 간 부드러운 전이용(휴지↔산출)
  const airActiveRef = useRef(false); // 기류 표시(마찰 산출 중일 때만)
  const distortAmtRef = useRef(0); // 실시간 왜곡량(0=정조음/초록, 1=왜곡/빨강) — 기류 색·설측 fork용
  const lateralAmtRef = useRef(0); // 설측 좌우 fork 강도(0=없음, 1=완전 설측)
  const distortRef = useRef(!!process.distortion);
  distortRef.current = !!process.distortion;
  const lateralRef = useRef(!!process.lateral);
  lateralRef.current = !!process.lateral;
  const sTrainerRef = useRef(!!process.sTrainer);
  sTrainerRef.current = !!process.sTrainer;
  // 통합 모드에서 실시간 감지된 오류 유형 라벨(변할 때만 setState).
  const [detected, setDetected] = useState<string | null>(null);
  const detectedRef = useRef<string | null>(null);
  // 강화(게임): 정조음 유지 시 캐릭터가 목표로 전진(progress 0~1), 도달 시 보상.
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const lastTimeRef = useRef(0); // 프레임 간 실제 경과(ms) — 5초 유지를 프레임률과 무관하게.
  const [reached, setReached] = useState(false);
  const reachedRef = useRef(false);
  const feedbackRef = useRef<ReturnType<typeof createFeedbackAudio> | null>(null);
  const rewardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetPoseRef = useRef(targetPose);
  targetPoseRef.current = targetPose;
  const errorPoseRef = useRef(errorPose);
  errorPoseRef.current = errorPose;

  const zone = process.centroidZone;
  const onFrame = useCallback(
    (analyser: AnalyserNode, ctx: AudioContext) => {
      const freq = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(freq);
      const r = analyzeSibilantSpectrum(freq, ctx.sampleRate);
      // 목표 자세로 프레임 간 부드럽게 전이(휴지↔정조음↔오조음 급변 방지).
      const applyLive = (desired: Pose) => {
        const cur = liveDisplayRef.current;
        const next = cur ? lerpPose(cur, desired, 0.3) : desired;
        liveDisplayRef.current = next;
        livePoseRef.current = next;
      };
      const bump = (c: string) => {
        if (detectedRef.current !== c) {
          detectedRef.current = c;
          setDetected(c);
        }
      };
      if (r.isFricative) {
        const sm =
          smoothRef.current === null
            ? r.centroid
            : EMA_ALPHA * smoothRef.current + (1 - EMA_ALPHA) * r.centroid;
        smoothRef.current = sm;
        setCentroid(sm);
        setIsFric(true);
        setSampleCount((n) => n + 1);
        if (zone && sm >= zone.min && sm <= zone.max) setInZoneCount((n) => n + 1);
        if (sTrainerRef.current) {
          // /ㅅ/ 실시간 판별(마찰 있음): centroid로 정조음↔구개음화 연속 보간.
          const d = Math.min(1, Math.max(0, (S_CORRECT_HZ - sm) / (S_CORRECT_HZ - S_PALATAL_HZ)));
          applyLive(lerpPose(targetPoseRef.current, POSE_PALATAL, d));
          distortAmtRef.current = d;
          lateralAmtRef.current = 0;
          bump(d < 0.35 ? "정조음" : "구개음화");
          airActiveRef.current = true;
        } else if (distortRef.current) {
          // (단일 왜곡 카드용) 음향→왜곡량 d. 구개음화=센트로이드만, 설측=centroid+hfRatio 평균.
          const dC = Math.min(1, Math.max(0, (S_CORRECT_HZ - sm) / (S_CORRECT_HZ - S_PALATAL_HZ)));
          let d = dC;
          if (lateralRef.current) {
            const dR = Math.min(1, Math.max(0, (HF_CORRECT - r.hfRatio) / (HF_CORRECT - HF_LATERAL)));
            d = Math.min(1, Math.max(0, (dC + dR) / 2));
            lateralAmtRef.current = d;
          }
          distortAmtRef.current = d;
          applyLive(lerpPose(targetPoseRef.current, errorPoseRef.current, d));
          airActiveRef.current = true;
        }
      } else {
        setIsFric(false);
        // 마찰 없음(무음) → 휴지.
        if (distortRef.current) {
          applyLive(IDLE_FULL);
          airActiveRef.current = false;
          if (sTrainerRef.current) bump("휴지");
        }
      }

      // 강화(게임): 정조음 유지 시 자동차 전진, 오류 시 후퇴, 무음은 유지. 도달 시 보상.
      // 진행은 실제 경과 시간 기준 — 정조음을 5초 유지하면 결승선 도착(프레임률 무관).
      if (sTrainerRef.current) {
        const now = performance.now();
        const dt = lastTimeRef.current ? Math.min(0.1, (now - lastTimeRef.current) / 1000) : 0;
        lastTimeRef.current = now;
        // 데드존: 확실히 정조음(왜곡량<0.4)일 때만 전진, 확실히 오조음(>0.65)일 때만 후퇴,
        // 애매/무음이면 유지 → 경계 깜빡임으로 진행이 상쇄되지 않게(전진>후퇴 속도).
        const amt = distortAmtRef.current;
        const good = r.isFricative && amt < 0.4;
        const bad = r.isFricative && amt > 0.65;
        if (good) progressRef.current = Math.min(1, progressRef.current + dt / 5); // 5초 유지=도착
        else if (bad) progressRef.current = Math.max(0, progressRef.current - dt / 6);
        if (!feedbackRef.current) feedbackRef.current = createFeedbackAudio();
        feedbackRef.current.update(good, progressRef.current);
        setProgress(progressRef.current);
        if (progressRef.current >= 1 && !reachedRef.current) {
          reachedRef.current = true;
          setReached(true);
          feedbackRef.current.reward();
          if (rewardTimerRef.current) clearTimeout(rewardTimerRef.current);
          rewardTimerRef.current = setTimeout(() => {
            progressRef.current = 0;
            reachedRef.current = false;
            setReached(false);
            setProgress(0);
          }, 2200);
        }
      }
    },
    [zone],
  );

  const audio = useAudioAnalyser({ fftSize: 4096, smoothingTimeConstant: 0.3, onFrame });

  // 강화 게임 상태 초기화 + 지속음 끄기.
  const resetGame = () => {
    feedbackRef.current?.quiet();
    if (rewardTimerRef.current) clearTimeout(rewardTimerRef.current);
    progressRef.current = 0;
    lastTimeRef.current = 0;
    reachedRef.current = false;
    setProgress(0);
    setReached(false);
  };
  const resetLive = () => {
    smoothRef.current = null;
    livePoseRef.current = null;
    liveDisplayRef.current = null;
    airActiveRef.current = false;
    distortAmtRef.current = 0;
    lateralAmtRef.current = 0;
    detectedRef.current = null;
    setDetected(null);
    setCentroid(null);
    setIsFric(false);
    setInZoneCount(0);
    setSampleCount(0);
    resetGame();
  };
  const stopLive = () => {
    audio.stop();
    // 정지 시 실시간 구동 해제 → 기본(목표/전환) 자세로 복귀.
    livePoseRef.current = null;
    liveDisplayRef.current = null;
    airActiveRef.current = false;
    distortAmtRef.current = 0;
    lateralAmtRef.current = 0;
    detectedRef.current = null;
    setDetected(null);
    resetGame();
  };
  // 언마운트 시 지속음·타이머 정리.
  useEffect(() => {
    return () => {
      feedbackRef.current?.quiet();
      if (rewardTimerRef.current) clearTimeout(rewardTimerRef.current);
    };
  }, []);

  const inZone = !!(zone && centroid !== null && isFric && centroid >= zone.min && centroid <= zone.max);
  const pctInZone = sampleCount > 0 ? (inZoneCount / sampleCount) * 100 : 0;

  const liveFeedback = (() => {
    if (!isFric || centroid === null)
      return { msg: `${process.cue.external}`, color: "slate" as const };
    if (inZone) return { msg: `✨ 좋아요! ${process.targetGrapheme} 소리예요`, color: "emerald" as const };
    if (zone && centroid < zone.min)
      return { msg: "소리가 낮아요 — 혀를 조금 더 앞으로", color: "amber" as const };
    return { msg: "소리가 높아요 — 혀를 살짝 뒤로", color: "amber" as const };
  })();

  // 산출 판정(대립쌍 의사소통 실패 체험)
  const markCorrect = () => {
    setJudged((j) => ({ attempts: j.attempts + 1, correct: j.correct + 1 }));
    setBreakdown(null);
    setSagMode("target");
  };
  const markError = () => {
    setJudged((j) => ({ attempts: j.attempts + 1, correct: j.correct }));
    setBreakdown(`「${pair.error}」처럼 들려요 — 뜻이 바뀌었어요! 목표 조음을 다시 봐요.`);
    setSagMode("transition");
  };

  const accuracy = judged.attempts > 0 ? (judged.correct / judged.attempts) * 100 : 0;

  const summary: Record<string, number | string> = {
    음운변동: process.label,
    목표: process.targetGrapheme,
    오류: process.errorGrapheme,
    시도: judged.attempts,
    정확: judged.correct,
    정확도_pct: Number(accuracy.toFixed(1)),
    ...(liveEnabled
      ? { 목표대역_체류_pct: Number(pctInZone.toFixed(1)), 샘플: sampleCount }
      : {}),
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => {
            stopLive();
            onBack();
          }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          ← 변동 목록
        </button>
        <h2 className="text-lg font-bold text-slate-900">
          {process.label}
          <span className="ml-2 text-base font-semibold text-slate-400">{process.short}</span>
        </h2>
        <span
          className={
            "rounded-full px-2 py-0.5 text-[11px] font-medium " +
            (mode === "live" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")
          }
        >
          {mode === "live" ? "실시간(지속음)" : "캡처(순간음)"}
        </span>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* 좌: 3D 시상면(오류→목표 전환) */}
        <div className="flex flex-1 flex-col gap-3">
          <div className="h-[420px]">
            <SagittalArticulator
              errorPose={errorPose}
              targetPose={targetPose}
              targetPhoneId={process.targetPhone}
              mode={process.sTrainer ? "target" : sagMode}
              highlight={highlight}
              showArt={kpVisible}
              speed={speed}
              airflow={process.airflow}
              livePoseRef={isDistortion ? livePoseRef : undefined}
              airActiveRef={isDistortion ? airActiveRef : undefined}
              distortAmtRef={isDistortion ? distortAmtRef : undefined}
              lateralAmtRef={isDistortion ? lateralAmtRef : undefined}
              lateral={process.lateral}
              frontView={process.lateral}
            />
          </div>

          {/* 강화 게임(사지탈 아래): 정조음을 5초 유지하면 자동차가 결승선까지 달려 도착, 보상. */}
          {process.sTrainer && (
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">결승선까지 달리기</h3>
                <span className="text-[11px] text-slate-400">맑은 「스~」를 5초 유지하면 도착!</span>
              </div>
              <div className="relative h-16 overflow-hidden rounded-xl bg-slate-700 ring-1 ring-slate-300">
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t-2 border-dashed border-amber-300/70" />
                <div
                  className="absolute right-0 top-0 bottom-0 w-3"
                  style={{ backgroundImage: "repeating-linear-gradient(0deg,#fff 0 6px,#111 6px 12px)" }}
                />
                <div className="absolute right-1 top-0.5 text-base">🏁</div>
                <div
                  className="absolute top-1/2 -translate-y-1/2 text-2xl"
                  style={{ left: `calc(${progress * 84}% + 6px)`, transition: "left 90ms linear" }}
                >
                  🏎️
                </div>
                {reached && (
                  <div className="absolute inset-0 grid place-items-center bg-emerald-500/30 text-lg font-extrabold text-white">
                    🎉 결승선 도착!
                  </div>
                )}
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${progress * 100}%`, transition: "width 90ms linear" }}
                />
              </div>
            </div>
          )}

          {/* 방향 단서 캡션 */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
            <span className="mr-1 font-semibold">교정 방향:</span>
            {process.directionText}
          </div>

          {/* 3D 컨트롤 (실시간 /ㅅ/ 훈련에선 모드·속도 숨김 — 조음 그림 토글만) */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm">
            {!process.sTrainer && (
              <>
                <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs">
                  {[
                    { v: "transition", label: "오류→목표 전환" },
                    { v: "target", label: "목표만 (내 차례)" },
                    { v: "error", label: "오류만" },
                  ].map((o) => (
                    <button
                      key={o.v}
                      onClick={() => setSagMode(o.v as SagittalMode)}
                      className={
                        "rounded-md px-2 py-1 font-medium transition " +
                        (sagMode === o.v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")
                      }
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <span className="ml-1 text-xs text-slate-500">속도</span>
                <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs">
                  {[
                    { v: 0.5, label: "느림" },
                    { v: 0.8, label: "보통" },
                    { v: 1.2, label: "빠름" },
                  ].map((o) => (
                    <button
                      key={o.v}
                      onClick={() => setSpeed(o.v)}
                      className={
                        "rounded-md px-2 py-1 font-medium transition " +
                        (Math.abs(speed - o.v) < 0.01 ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")
                      }
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </>
            )}
            <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={kpVisible} onChange={(e) => setKpVisible(e.target.checked)} />
              조음 그림 (끄면 소리로만)
            </label>
          </div>

          {/* 초점 전환(외부/내부) 단서 — 실시간 /ㅅ/ 훈련에선 숨김 */}
          {!process.sTrainer && (
            <div className="rounded-xl bg-white px-3 py-2 shadow-sm">
              <div className="mb-1.5 flex items-center gap-2">
                <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs">
                  {[
                    { v: "external", label: "소리에 집중" },
                    { v: "internal", label: "혀에 집중" },
                  ].map((o) => (
                    <button
                      key={o.v}
                      onClick={() => setFocus(o.v as "external" | "internal")}
                      className={
                        "rounded-md px-2 py-1 font-medium transition " +
                        (focus === o.v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")
                      }
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-sm text-slate-700">
                {focus === "external" ? process.cue.external : process.cue.internal}
              </p>
            </div>
          )}
        </div>

        {/* 우: (대립쌍 대조 | 왜곡 안내) + (실시간) 음향 게이지 + 저장 */}
        <div className="flex w-full flex-col gap-4 lg:w-[24rem]">
          {/* 왜곡(구개음화)은 대립쌍(뜻 바뀜)이 아니라 같은 낱말의 조음 왜곡 → 대립쌍 대조 대신
              마이크 실시간 피드백 안내를 보여준다. */}
          {isDistortion && (
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold text-slate-800">
                {process.sTrainer ? "마찰음 /ㅅ/ 실시간 훈련" : `${process.targetGrapheme} 실시간 연습`}
              </h3>
              {process.sTrainer ? (
                <>
                  <p className="text-xs leading-relaxed text-slate-600">
                    <strong>마이크 시작</strong> 후 <strong>「ㅅ」을 길게</strong> 내보세요. 정확한
                    <strong> 치조</strong> 위치면 3D 혀가 <strong>앞</strong>에(기류 초록), 구개음화되면 혀가
                    <strong> 뒤(경구개)</strong>로(기류 빨강) 실시간으로 움직여요. 소리가 낮아 혀가 뒤로 가면 앞으로 당기도록 도와주세요.
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">지금 감지</span>
                    <span
                      className={
                        "rounded-full px-3 py-1 text-sm font-bold " +
                        (detected === null
                          ? "bg-slate-100 text-slate-400"
                          : detected === "정조음"
                            ? "bg-emerald-100 text-emerald-800"
                            : detected === "휴지"
                              ? "bg-slate-100 text-slate-500"
                              : "bg-rose-100 text-rose-800")
                      }
                    >
                      {detected ?? "— (마이크 시작)"}
                    </span>
                  </div>
                </>
              ) : process.lateral ? (
                <p className="text-xs leading-relaxed text-slate-600">
                  아래 <strong>마이크 시작</strong>을 누르고 <strong>「{process.targetGrapheme}」 소리를 길게</strong> 내보세요.
                  정확하면 바람이 혀 <strong>가운데로 곧게</strong>(기류 초록), 설측음화되면 공기가
                  <strong> 양옆으로 갈라져</strong>(기류 빨강) 실시간으로 보여요.
                </p>
              ) : (
                <p className="text-xs leading-relaxed text-slate-600">
                  아래 <strong>마이크 시작</strong>을 누르고 <strong>「{process.targetGrapheme}」 소리를 길게</strong> 내보세요.
                  정확한 <strong>치조</strong> 위치면 3D 혀가 <strong>앞</strong>에(기류 초록), 왜곡(구개음화)되면 혀가
                  <strong> 뒤(경구개)</strong>로(기류 빨강) 실시간으로 움직여요.
                </p>
              )}
            </div>
          )}

          {/* 대립쌍 대조 게임 (의사소통 실패) — 대치 오류(뜻 바뀜)에서만. */}
          {!isDistortion && (
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">
                대립쌍 대조
                <span className="ml-1.5 text-[11px] font-normal text-slate-400">
                  {(pairIndex % safePairs.length) + 1}/{safePairs.length}
                </span>
              </h3>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setEditPairs((v) => !v)}
                  className={
                    "rounded-md px-2 py-1 text-xs transition " +
                    (editPairs ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200")
                  }
                >
                  ✎ 편집
                </button>
                <button
                  onClick={() => {
                    setPairIndex((i) => i + 1);
                    setBreakdown(null);
                  }}
                  className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-slate-200"
                >
                  다음 짝 →
                </button>
              </div>
            </div>

            {editPairs && (
              <PairEditor
                pairs={pairs}
                onChange={commitPairs}
                targetGrapheme={process.targetGrapheme}
                errorGrapheme={process.errorGrapheme}
              />
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3 text-center">
                <div className="text-[11px] font-semibold text-emerald-700">목표</div>
                <div className="mt-1 text-3xl font-bold text-emerald-900">{pair.target}</div>
                <div className="mt-0.5 text-xs text-emerald-600">{process.targetGrapheme}</div>
              </div>
              <div className="rounded-xl border-2 border-rose-200 bg-rose-50 p-3 text-center">
                <div className="text-[11px] font-semibold text-rose-600">흔한 오류</div>
                <div className="mt-1 text-3xl font-bold text-rose-900">{pair.error}</div>
                <div className="mt-0.5 text-xs text-rose-500">{process.errorGrapheme}</div>
              </div>
            </div>
            {pair.note && <p className="mt-1.5 text-[11px] text-slate-400">{pair.note}</p>}

            <p className="mt-3 text-xs text-slate-600">
              아동이 「{pair.target}」을(를) 산출한 뒤, 실제로 들린 대로 판정하세요.
            </p>
            <div className="mt-1.5 flex gap-2">
              <button
                onClick={markCorrect}
                className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                ✓ 정확히 「{pair.target}」
              </button>
              <button
                onClick={markError}
                className="flex-1 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700"
              >
                ✗ 「{pair.error}」로 들림
              </button>
            </div>
            {breakdown && (
              <div className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {breakdown}
              </div>
            )}
            {judged.attempts > 0 && (
              <p className="mt-2 text-[11px] text-slate-500">
                시도 {judged.attempts} · 정확 {judged.correct} · 정확도 {accuracy.toFixed(0)}%
              </p>
            )}
          </div>
          )}

          {/* 실시간 음향 게이지 (지속음·centroid) */}
          {liveEnabled ? (
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold text-slate-800">
                실시간 음향 — {process.targetGrapheme} 목표대역
              </h3>
              {!audio.isRecording ? (
                <button
                  onClick={audio.start}
                  className="mb-3 w-full rounded-xl bg-violet-600 px-4 py-3.5 text-base font-bold text-white shadow-sm transition hover:bg-violet-700"
                >
                  🎤 마이크 시작
                </button>
              ) : (
                <button
                  onClick={stopLive}
                  className="mb-3 w-full rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-rose-700"
                >
                  ■ 정지
                </button>
              )}
              {audio.error && (
                <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{audio.error}</p>
              )}
              <CentroidGauge zone={zone!} centroid={isFric ? centroid : null} lit={inZone} />
              <div
                className={
                  "mt-2 rounded-lg px-3 py-2 text-center text-sm font-semibold " +
                  (liveFeedback.color === "emerald"
                    ? "bg-emerald-50 text-emerald-900"
                    : liveFeedback.color === "amber"
                      ? "bg-amber-50 text-amber-900"
                      : "bg-slate-50 text-slate-600")
                }
              >
                {liveFeedback.msg}
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                <span>목표대역 체류 {sampleCount > 0 ? `${pctInZone.toFixed(0)}%` : "—"}</span>
                <button onClick={resetLive} className="underline hover:text-slate-700">
                  세션 초기화
                </button>
              </div>
            </div>
          ) : (
            <CaptureRecorder targetWord={pair.target} />
          )}

          <SaveToHistory
            moduleId="articulation_train"
            summary={summary}
            saveHint="음운변동 훈련 세션"
          />
        </div>
      </div>
    </div>
  );
}

// ── 목표대역 게이지 (단일 목표존) ──────────────────────────────────────────────
function CentroidGauge({
  zone,
  centroid,
  lit,
}: {
  zone: { min: number; max: number };
  centroid: number | null;
  lit: boolean;
}) {
  const W = 360;
  const H = 96;
  const PADL = 12;
  const PADR = 12;
  const top = 14;
  const barH = 40;
  const x1 = freqToX(zone.min, W, PADL, PADR);
  const x2 = freqToX(zone.max, W, PADL, PADR);
  const cx = centroid !== null ? freqToX(centroid, W, PADL, PADR) : null;
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <rect x={PADL} y={top} width={W - PADL - PADR} height={barH} fill="#f1f5f9" stroke="#cbd5e1" rx={6} />
        {/* 목표 대역 */}
        <rect
          x={x1}
          y={top}
          width={x2 - x1}
          height={barH}
          fill={lit ? "#34d399" : "#a7f3d0"}
          opacity={lit ? 0.9 : 0.5}
          rx={4}
        />
        <text x={(x1 + x2) / 2} y={top + barH / 2 + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="#065f46">
          목표
        </text>
        {/* 눈금 */}
        {[2000, 4000, 6000, 8000].map((f) => {
          const x = freqToX(f, W, PADL, PADR);
          return (
            <g key={f}>
              <line x1={x} x2={x} y1={top + barH} y2={top + barH + 4} stroke="#94a3b8" />
              <text x={x} y={top + barH + 16} textAnchor="middle" fontSize={9} fill="#64748b">
                {f / 1000}k
              </text>
            </g>
          );
        })}
        {/* 라이브 마커 */}
        {cx !== null && (
          <g>
            <line x1={cx} x2={cx} y1={top - 4} y2={top + barH + 4} stroke="#0f172a" strokeWidth={2.5} />
            <circle cx={cx} cy={top + barH / 2} r={8} fill="#0f172a" stroke="white" strokeWidth={2} />
          </g>
        )}
      </svg>
    </div>
  );
}
