"use client";

// 바로조음 v2 — "목표 vs 실제" 조음 위치 비교 UI.
// v1 자세 라이브러리(phonemeMap)를 재사용해, 목표 음소와 실제(아동이 산출한) 음소의
// 조음 자세를 3D로 비교한다. 나란히(side-by-side) / 겹쳐보기(overlay) 두 모드.
//  · 입술 투명도는 사용자가 슬라이더로 직접 조절.
//  · 겹쳐보기: 목표를 반투명 초록 고스트로 실제 위에 겹쳐 위치 차이를 직접 확인.
//  · 벗어난 조음기관(혀/입술)은 실제 쪽에 로즈색으로 강조.
// (다음 단계에서 '실제'는 음향 분석 결과로 자동 채워짐 — 지금은 치료사가 선택.)
// 렌더/차이/타임라인 코어는 components/articulator/renderCore.tsx로 추출(훈련 모듈과 공유).

import { Suspense, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, OrbitControls } from "@react-three/drei";
import { IDLE_POSE, fullPose, type Pose } from "@/components/articulator/phonemeMap";
import {
  analyzeWord,
  ROLE_LABEL,
  type WordTarget,
} from "@/components/articulator/korean";
import {
  ClockDriver,
  Lights,
  PHONES,
  StaticArticulator,
  classifyPattern,
  computeDiffs,
  gestureEnvelope,
  isLipMorph,
  isTongueMorph,
  phoneById,
  type Clock,
  type Highlight,
  type Phone,
  type PlayState,
  type Seg,
} from "@/components/articulator/renderCore";

// 비교 탭 기본 카메라 = 측면(사지탈, +Z). 훈련(SAG_CAM)·음소산출(dev=false)과 동일하게
// 조음 위치가 가장 잘 보이는 측면을 우선 노출한다. (renderCore의 CAM 은 전방[2.4,0,0.5]이라 미사용)
const SIDE_CAM = { position: [0, 0, 3] as [number, number, number], fov: 35, near: 0.01, far: 100 };

// 겹쳐보기: 실제(솔리드+강조) 위에 목표(초록 고스트, 머리 숨김)를 겹침.
// 재생 시 목표/실제가 각자의 타임라인을 공유 클럭으로 동시에 애니메이션.
function OverlayCanvas(props: {
  target: Pose;
  actual: Pose;
  lipOpacity: number;
  showArt: boolean;
  highlight?: Highlight;
  targetSegsRef: React.RefObject<Seg[] | null>;
  actualSegsRef: React.RefObject<Seg[] | null>;
  clockRef: React.RefObject<Clock>;
  playRef: React.RefObject<PlayState>;
  onEnd: () => void;
}) {
  return (
    <Canvas camera={SIDE_CAM} dpr={[1, 2]} gl={{ alpha: true, antialias: true }}>
      <Lights />
      <ClockDriver clockRef={props.clockRef} playRef={props.playRef} onEnd={props.onEnd} />
      <Suspense fallback={null}>
        <Bounds fit clip margin={0.75}>
          <group>
            {/* 실제 산출 — 솔리드, 벗어난 조음기관 로즈 강조 */}
            <StaticArticulator
              pose={props.actual}
              lipOpacity={props.lipOpacity}
              showArt={props.showArt}
              highlight={props.highlight}
              segsRef={props.actualSegsRef}
              clockRef={props.clockRef}
              playRef={props.playRef}
            />
            {/* 목표 — 초록 반투명 고스트(머리 숨김, 조음기관만 겹침) */}
            <StaticArticulator
              pose={props.target}
              lipOpacity={props.lipOpacity}
              showArt={props.showArt}
              hideHead
              ghost
              segsRef={props.targetSegsRef}
              clockRef={props.clockRef}
              playRef={props.playRef}
            />
          </group>
        </Bounds>
      </Suspense>
      <OrbitControls enablePan enableZoom enableRotate minDistance={0.5} maxDistance={20} makeDefault />
    </Canvas>
  );
}

function PhoneGrid({
  selected,
  onPick,
  accent,
}: {
  selected: string;
  onPick: (id: string) => void;
  accent: string;
}) {
  const cons = PHONES.filter((p) => p.kind === "consonant");
  const vows = PHONES.filter((p) => p.kind === "vowel");
  const cell = (p: Phone) => (
    <button
      key={p.id}
      title={p.desc}
      onClick={() => onPick(p.id)}
      className={
        "rounded-md px-2 py-1.5 text-sm font-medium transition " +
        (selected === p.id
          ? `${accent} text-white`
          : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50")
      }
    >
      {p.label}
    </button>
  );
  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className="mb-1 text-[11px] font-semibold text-slate-500">자음</div>
        <div className="grid grid-cols-4 gap-1.5">{cons.map(cell)}</div>
      </div>
      <div>
        <div className="mb-1 text-[11px] font-semibold text-slate-500">단모음</div>
        <div className="grid grid-cols-8 gap-1.5">{vows.map(cell)}</div>
      </div>
    </div>
  );
}

const PRESET_WORDS = ["사자", "가방", "토끼", "나무", "우산", "코끼리"];

export default function CompareViewer() {
  const [word, setWord] = useState("사자");
  // 대상별 실제 산출 음소 override. key = `${음절}-${역할}` → PHONES id.
  const [actualBy, setActualBy] = useState<Record<string, string>>({});
  const [currentKey, setCurrentKey] = useState("0-onset");
  const [showArt, setShowArt] = useState(true);
  const [lipOpacity, setLipOpacity] = useState(0.5);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(0.6); // 재생 속도(기본: 천천히)
  const [loop, setLoop] = useState(false);

  const clockRef = useRef<Clock>({ t: 0 });
  const playRef = useRef<PlayState>({ playing: false, speed: 0.6, loop: false, total: 0 });
  const targetSegsRef = useRef<Seg[] | null>(null);
  const actualSegsRef = useRef<Seg[] | null>(null);

  const analysis = useMemo(() => analyzeWord(word), [word]);
  const syllables = analysis.syllables;
  const flatTargets = useMemo(() => syllables.flatMap((s) => s.targets), [syllables]);

  // 현재 선택 대상(단어 변경 시 첫 대상으로 폴백)
  const current: WordTarget | undefined =
    flatTargets.find((t) => t.key === currentKey) ?? flatTargets[0];

  const actualIdFor = (t: WordTarget) => actualBy[t.key] ?? t.phoneId;
  // 목표 자세: 변이음 override가 있으면 그것, 없으면 라이브러리 기본 포즈.
  const targetPoseOf = (t: WordTarget) => t.poseOverride ?? phoneById(t.phoneId).pose;
  // 실제 자세: '정상'(목표와 동일 음소)이면 목표 자세 그대로(변이음 포함), 대치면 그 음소의 기본 포즈.
  const actualPoseOf = (t: WordTarget) =>
    actualIdFor(t) === t.phoneId ? targetPoseOf(t) : phoneById(actualIdFor(t)).pose;

  // 대상별 오류 여부(스트립 색칠용): override가 있고 조음 자세가 다르면 오류
  const errorKeys = useMemo(() => {
    const set = new Set<string>();
    for (const t of flatTargets) {
      const aId = actualBy[t.key];
      if (!aId || aId === t.phoneId) continue;
      if (computeDiffs(targetPoseOf(t), phoneById(aId).pose).length > 0) set.add(t.key);
    }
    return set;
  }, [flatTargets, actualBy]);

  const target = current ? phoneById(current.phoneId) : null;
  const targetPose = current ? targetPoseOf(current) : null;
  const actual = current ? phoneById(actualIdFor(current)) : null;
  const actualPose = current ? actualPoseOf(current) : null;
  const diffs = useMemo(
    () => (targetPose && actualPose ? computeDiffs(targetPose, actualPose) : []),
    [targetPose, actualPose],
  );
  const pattern = useMemo(
    () => (targetPose && actualPose ? classifyPattern(targetPose, actualPose) : null),
    [targetPose, actualPose],
  );
  const same = diffs.length === 0;
  const highlight: Highlight = useMemo(
    () => ({
      tongue: diffs.some((d) => isTongueMorph(d.morph)),
      lips: diffs.some((d) => isLipMorph(d.morph)),
    }),
    [diffs],
  );

  const setActual = (id: string) => {
    if (!current) return;
    setActualBy((m) => ({ ...m, [current.key]: id }));
  };
  const resetActual = () => {
    if (!current) return;
    setActualBy((m) => {
      const n = { ...m };
      delete n[current.key];
      return n;
    });
  };
  const stopPlay = () => {
    playRef.current.playing = false;
    setPlaying(false);
  };
  const pickWord = (w: string) => {
    stopPlay();
    setWord(w);
    setActualBy({});
    const first = analyzeWord(w).syllables.flatMap((s) => s.targets)[0];
    if (first) setCurrentKey(first.key);
  };

  // 단어의 조음 대상들을 순서대로 잇는 타임라인 만들기(목표/실제 동일 길이).
  const buildTimeline = () => {
    const targets = flatTargets;
    if (!targets.length) return null;
    // 조음방법별 envelope은 **목표 음소 기준**으로 고정 → 목표/실제 재생이 어긋나지 않음.
    const env = targets.map((t) => gestureEnvelope(t.phoneId));
    // ── 동시조음(coarticulation) 파라미터 ──
    const LIP_ANTIC = 0.7; // 예기적 원순/평순 반영 비율
    const CODA_ANTIC = 0.3; // 종성 예기(모음 꼬리로 종성 혀 조음 당김) 비율
    const LIP_M = ["lips_round", "lips_spread", "lips_closed"];
    const CODA_M = ["tongue_tip_up", "tongue_front_up", "tongue_back_up", "tongue_retract", "velum_open", "lips_closed"];
    const build = (useActual: boolean): Seg[] => {
      const poseFor = (t: WordTarget) => fullPose(useActual ? actualPoseOf(t) : targetPoseOf(t));
      const segs: Seg[] = [{ pose: IDLE_POSE, dur: 0.15 }];
      targets.forEach((t, i) => {
        const e = env[i];
        const next = targets[i + 1];
        const own = poseFor(t);
        let approach: Pose = { ...own };
        const settle: Pose = { ...own };

        // 2c) 활음(반모음): 온글라이드 고모음 → 핵모음으로 미끄러짐. 이동=온글라이드 시작,
        // 유지=핵모음. 활음은 목표에 항상, 실제엔 대치 없을 때만(아동이 활음 생략한 경우 왜곡 방지).
        const glideApplies = t.role === "nucleus" && t.glide && (!useActual || actualIdFor(t) === t.phoneId);
        if (glideApplies) approach = fullPose(phoneById("v_" + t.glide).pose);

        // 2a) 예기적 원순/평순: onset 자음이면 같은 음절 뒤 모음의 입술모양을 미리(자음 폐쇄는 유지).
        // ⚠️ 활음(반모음) 중성이면 자음 동안 형성되는 입모양은 핵모음이 아니라 **온글라이드**(w=ㅜ원순/
        // j=ㅣ평순) 입술이어야 한다. 예: 귀(ㄱ+ㅟ)=ㄱ 동안 ㅜ 원순 → 이후 ㅣ로 미끄러짐.
        if (t.role === "onset" && next && next.role === "nucleus" && next.syl === t.syl) {
          const v = next.glide ? fullPose(phoneById("v_" + next.glide).pose) : poseFor(next);
          for (const m of LIP_M) {
            const b = (v[m] ?? 0) * LIP_ANTIC;
            approach[m] = Math.max(approach[m] ?? 0, b);
            settle[m] = Math.max(settle[m] ?? 0, b);
          }
        }
        // 2b) 종성 예기: nucleus 모음이면 뒤 종성 자음의 혀/연구개 조음을 유지(tail) 구간에 살짝.
        if (t.role === "nucleus" && next && next.role === "coda") {
          const c = poseFor(next);
          for (const m of CODA_M) {
            settle[m] = (settle[m] ?? 0) + ((c[m] ?? 0) - (settle[m] ?? 0)) * CODA_ANTIC;
          }
        }
        segs.push({ pose: approach, dur: e.moveDur, ease: e.moveEase }); // 이동
        segs.push({ pose: settle, dur: e.holdDur }); // 유지
      });
      segs.push({ pose: IDLE_POSE, dur: 0.3 }); // 휴지 복귀
      return segs;
    };
    const tg = build(false);
    const total = tg.reduce((s, x) => s + x.dur, 0);
    return { tg, ac: build(true), total };
  };

  const playWord = () => {
    const tl = buildTimeline();
    if (!tl) return;
    targetSegsRef.current = tl.tg;
    actualSegsRef.current = tl.ac;
    clockRef.current.t = 0;
    playRef.current = { playing: true, speed, loop, total: tl.total };
    setPlaying(true);
  };
  const changeSpeed = (v: number) => {
    setSpeed(v);
    playRef.current.speed = v;
  };
  const changeLoop = (v: boolean) => {
    setLoop(v);
    playRef.current.loop = v;
  };

  const bg =
    "radial-gradient(circle at 50% 38%, #3b3540 0%, #211d26 55%, #14111a 100%)";
  const errorCount = errorKeys.size;

  return (
    <div className="flex w-full flex-col gap-4 lg:flex-row">
      {/* 좌: 3D 비교 + 차이 */}
      <div className="flex flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
          <span><span className="font-semibold text-emerald-600">초록 고스트</span> = 목표</span>
          <span><span className="font-semibold text-rose-600">솔리드</span> = 실제(산출)</span>
          <span><span className="font-semibold text-rose-500">로즈 강조</span> = 목표와 벗어난 조음기관</span>
        </div>

        {/* 겹쳐보기 */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between rounded-t-xl bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white">
            <span>
              {current
                ? `${current.syl + 1}음절 ${ROLE_LABEL[current.role]} · ${current.jamo}`
                : "겹쳐보기 · 목표 vs 실제"}
            </span>
            {target && actual && (
              <span className="text-base">
                <span className="text-emerald-300">{target.label}</span>
                <span className="mx-1 text-slate-400">↔</span>
                <span className="text-rose-300">{actual.label}</span>
              </span>
            )}
          </div>
          <div className="relative h-[440px] overflow-hidden rounded-b-xl" style={{ background: bg }}>
            {target && targetPose && actual && actualPose ? (
              <OverlayCanvas
                target={targetPose}
                actual={actualPose}
                lipOpacity={lipOpacity}
                showArt={showArt}
                highlight={playing ? undefined : highlight}
                targetSegsRef={targetSegsRef}
                actualSegsRef={actualSegsRef}
                clockRef={clockRef}
                playRef={playRef}
                onEnd={() => setPlaying(false)}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                한글 단어를 입력하세요
              </div>
            )}
            {playing && (
              <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-emerald-500/90 px-2.5 py-1 text-[11px] font-semibold text-white">
                ▶ 재생 중 · 「{word}」
              </div>
            )}
          </div>
        </div>

        {/* 재생 컨트롤 */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm">
          <button
            onClick={playing ? stopPlay : playWord}
            disabled={flatTargets.length === 0}
            className={
              "rounded-lg px-3 py-1.5 text-sm font-medium text-white transition disabled:opacity-40 " +
              (playing ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700")
            }
          >
            {playing ? "■ 정지" : "▶ 단어 재생"}
          </button>
          <span className="text-xs text-slate-500">속도</span>
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs">
            {[
              { v: 0.35, label: "아주 천천히" },
              { v: 0.6, label: "천천히" },
              { v: 1.0, label: "보통" },
            ].map((o) => (
              <button
                key={o.v}
                onClick={() => changeSpeed(o.v)}
                className={
                  "rounded-md px-2 py-1 font-medium transition " +
                  (Math.abs(speed - o.v) < 0.01 ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")
                }
              >
                {o.label}
              </button>
            ))}
          </div>
          <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={loop} onChange={(e) => changeLoop(e.target.checked)} />
            반복
          </label>
        </div>

        {/* 입술 투명도 슬라이더 */}
        <div className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 shadow-sm">
          <span className="w-24 shrink-0 text-xs font-medium text-slate-600">입술 투명도</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={lipOpacity}
            onChange={(e) => setLipOpacity(parseFloat(e.target.value))}
            className="flex-1"
          />
          <span className="w-16 text-right text-xs tabular-nums text-slate-500">
            {lipOpacity < 0.02 ? "완전 투명" : lipOpacity > 0.98 ? "불투명" : lipOpacity.toFixed(2)}
          </span>
        </div>

        {/* 조음 차이 표 */}
        <div className="rounded-xl bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">조음 위치 차이</h2>
            {!current ? null : same ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                ✓ 목표와 동일
              </span>
            ) : (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
                {diffs.length}개 요소 다름
              </span>
            )}
          </div>

          {pattern && (
            <div className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <span className="font-semibold">참고 · 추정 오류패턴:</span> {pattern}
            </div>
          )}

          {!current || same ? (
            <p className="text-xs text-slate-500">
              {current ? "선택한 대상의 조음 자세가 목표와 일치합니다." : "단어를 입력하고 대상 음소를 선택하세요."}
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg ring-1 ring-slate-100">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">조음 요소</th>
                    <th className="px-2 py-1.5 text-right font-medium text-emerald-600">목표</th>
                    <th className="px-2 py-1.5 text-right font-medium text-rose-600">실제</th>
                    <th className="px-2 py-1.5 text-left font-medium">차이</th>
                  </tr>
                </thead>
                <tbody>
                  {diffs.map((d) => (
                    <tr key={d.morph} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 text-slate-700">{d.label}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{d.target.toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{d.actual.toFixed(2)}</td>
                      <td className="px-2 py-1.5">
                        <span className={"font-medium " + (d.delta > 0 ? "text-sky-600" : "text-orange-600")}>
                          {d.delta > 0 ? "▲ 과다" : "▼ 부족"} {Math.abs(d.delta).toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-[11px] text-slate-400">
            ▲과다 = 실제가 목표보다 그 동작이 큼 · ▼부족 = 실제가 목표보다 작음. 값은 조음 강도(0~1.5).
            로즈색으로 강조된 조음기관이 목표와 다른 부위입니다.
          </p>
        </div>
      </div>

      {/* 우: 단어 → 음절 → 대상 → 실제 선택 */}
      <div className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-4 shadow-sm lg:w-[22rem]">
        {/* 단어 입력 */}
        <div>
          <div className="mb-1.5 text-xs font-semibold text-slate-700">목표 단어</div>
          <input
            type="text"
            value={word}
            onChange={(e) => pickWord(e.target.value)}
            placeholder="예: 사자"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-lg font-medium text-slate-900 focus:border-slate-400 focus:outline-none"
          />
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {PRESET_WORDS.map((w) => (
              <button
                key={w}
                onClick={() => pickWord(w)}
                className={
                  "rounded-md px-2 py-1 text-xs transition " +
                  (word === w ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")
                }
              >
                {w}
              </button>
            ))}
          </div>

          {/* 표준발음(음운변동 적용) */}
          {analysis.pronunciation && (
            <div className="mt-2 rounded-lg bg-indigo-50 px-3 py-2">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold text-indigo-700">표준발음</span>
                <span className="text-base font-semibold text-indigo-900">[{analysis.pronunciation}]</span>
                {analysis.input !== analysis.pronunciation && (
                  <span className="text-[11px] text-slate-400">표기 {analysis.input}</span>
                )}
              </div>
              {analysis.rules.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {analysis.rules.map((r) => (
                    <span key={r} className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                      {r}
                    </span>
                  ))}
                </div>
              )}
              {analysis.notes.length > 0 && (
                <div className="mt-1 text-[11px] text-slate-500">변이음 · {analysis.notes.join(" · ")}</div>
              )}
            </div>
          )}
        </div>

        {/* 음절 스트립 — 대상(초/중/종성) 선택 */}
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-700">
            <span>음절 · 조음 대상</span>
            {errorCount > 0 && (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                오류 {errorCount}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {syllables.map((s, si) => (
              <div key={si} className="rounded-lg bg-slate-50 p-1.5">
                <div className="mb-1 text-center text-base font-semibold text-slate-800">{s.char}</div>
                <div className="flex gap-1">
                  {s.targets.map((t) => {
                    const isCur = current?.key === t.key;
                    const isErr = errorKeys.has(t.key);
                    return (
                      <button
                        key={t.key}
                        title={ROLE_LABEL[t.role]}
                        onClick={() => setCurrentKey(t.key)}
                        className={
                          "min-w-[28px] rounded px-1.5 py-1 text-sm font-medium transition " +
                          (isCur
                            ? "bg-slate-900 text-white ring-2 ring-slate-400"
                            : isErr
                              ? "bg-rose-100 text-rose-700 ring-1 ring-rose-300"
                              : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100")
                        }
                      >
                        {t.jamo}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            표준발음(음운변동 적용) 기준 · 초성 ㅇ(무음) 제외 · 종성 불파
          </p>
        </div>

        {/* 현재 대상의 실제 산출 음소 선택 */}
        {current && (
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-rose-700">
              <span className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-600" />
                실제 산출 — {current.syl + 1}음절 {ROLE_LABEL[current.role]} 「{current.jamo}」
              </span>
              <button
                onClick={resetActual}
                className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-normal text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
              >
                정상(목표와 동일)
              </button>
            </div>
            {current.note && (
              <p className="mb-1 text-[11px] text-indigo-600">변이음 · {current.note}</p>
            )}
            <PhoneGrid selected={actualIdFor(current)} onPick={setActual} accent="bg-rose-600" />
          </div>
        )}

        <label className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <input type="checkbox" checked={showArt} onChange={(e) => setShowArt(e.target.checked)} />
          3D 혀·입술 표시 <span className="text-xs text-slate-400">(끄면 단면만)</span>
        </label>

        <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
          단어→음절→조음 대상(초/중/종성)으로 나눠, 대상마다 아동이 실제로 낸 소리를 지정해 비교합니다.
          다음 단계(v2)에서 아동의 단어 발화를 음향 분석해 이 &lsquo;실제&rsquo;가 자동으로 채워집니다.
        </p>
      </div>
    </div>
  );
}
