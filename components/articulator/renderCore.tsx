"use client";

// 바로조음 공유 렌더/분석 코어.
// CompareViewer(v2 비교뷰)와 ArticulationTrainer(음운변동 훈련)가 함께 쓰는
// 3D 조음기관 렌더 + 조음 차이 계산 + 재생 타임라인 로직을 한 곳에 모은다.
// (원래 CompareViewer.tsx 안에 있던 것을 거동 보존하며 추출 — 모프 적용 로직 이중화 방지.)

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import {
  CONSONANTS,
  VOWELS,
  MORPHS,
  VELUM_INVERTED,
  VELUM_CLOSE,
  VELUM_CLOSED_MIN,
  fullPose,
  lerpPose,
  type Pose,
} from "@/components/articulator/phonemeMap";

export const MODEL_URL = "/models/head-rigged.glb?v=36";
export const isLipMesh = (n: string) => n === "lips_upper" || n === "lips_lower";

// 정적 비교이므로 v1의 기본 턱 값을 상수로 고정(휴지 기준 조음 자세를 그대로 재현).
export const JAW = { pivotX: -0.15, pivotY: 0.25, maxDeg: 18, tongue: 1.0, lips: 1.0 };

export const GHOST_COLOR = 0x34d399; // emerald-400 — 목표 고스트
export const HL_COLOR = 0xfb7185; // rose-400 — 벗어난 조음기관 강조
export const HL_EMERALD = 0x34d399; // emerald-400 — 교정 방향(움직이는 조음기관) 강조
export const GHOST_OPACITY = 0.42;

// 조음 요소(모프) → 치료사용 한국어 라벨
export const MORPH_LABEL: Record<string, string> = {
  tongue_tip_up: "혀끝 올림 (치조)",
  tongue_tip_down: "혀끝 내림",
  tongue_front_up: "혀 앞날 올림 (경구개)",
  tongue_back_up: "혀 뒤 올림 (연구개)",
  tongue_retract: "혀 뒤로 (후퇴)",
  tongue_groove: "혀 홈 (마찰 틈)",
  tongue_lateral_channel: "설측 통로",
  lips_closed: "입술 닫힘",
  lips_round: "입술 둥글게 (원순)",
  lips_spread: "입술 펴기 (평순)",
  jaw_open: "턱 벌림",
  velum_open: "연구개 열림 (비강)",
};

export const isTongueMorph = (m: string) => m.startsWith("tongue");
export const isLipMorph = (m: string) => m.startsWith("lips") || m === "jaw_open";

// 통합 음소 목록(자음 11 + 단모음 8). 이중모음은 시간축 전이라 정적 비교에서 제외.
export type Phone = {
  id: string;
  label: string;
  kind: "consonant" | "vowel";
  pose: Pose;
  desc: string;
};

export const PHONES: Phone[] = [
  ...CONSONANTS.map((c) => ({
    id: "c_" + c.id,
    label: c.label,
    kind: "consonant" as const,
    pose: c.pose,
    desc: c.manner,
  })),
  ...Object.values(VOWELS).map((v) => ({
    id: "v_" + v.id,
    label: v.label,
    kind: "vowel" as const,
    pose: v.pose,
    desc: v.feature,
  })),
];

export const phoneById = (id: string) => PHONES.find((p) => p.id === id)!;

// ── 조음 차이 계산 ────────────────────────────────────────────────────────────
export type Diff = { morph: string; label: string; target: number; actual: number; delta: number };

export function computeDiffs(target: Pose, actual: Pose, thr = 0.08): Diff[] {
  const T = fullPose(target);
  const A = fullPose(actual);
  const out: Diff[] = [];
  for (const m of MORPHS) {
    const t = T[m] ?? 0;
    const a = A[m] ?? 0;
    if (Math.abs(t - a) >= thr) {
      out.push({ morph: m, label: MORPH_LABEL[m] ?? m, target: t, actual: a, delta: a - t });
    }
  }
  return out.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
}

// 흔한 아동 조음 오류패턴 추정(참고용 — 확정 진단 아님).
export function classifyPattern(target: Pose, actual: Pose): string | null {
  const T = fullPose(target);
  const A = fullPose(actual);
  const g = (p: Pose, k: string) => p[k] ?? 0;
  const velarT = g(T, "tongue_back_up") >= 0.6;
  const velarA = g(A, "tongue_back_up") >= 0.6;
  const antA = g(A, "tongue_tip_up") >= 0.5 || g(A, "tongue_front_up") >= 0.5;
  const antT = g(T, "tongue_tip_up") >= 0.5 || g(T, "tongue_front_up") >= 0.5;
  const grooveT = g(T, "tongue_groove") > 0.2;
  const fullContactA =
    g(A, "tongue_tip_up") >= 0.9 || g(A, "lips_closed") >= 0.9 || g(A, "tongue_back_up") >= 0.9;
  const nasalT = g(T, "velum_open") >= 0.6;
  const nasalA = g(A, "velum_open") >= 0.6;

  if (velarT && !velarA && antA) return "연구개음 전방화 (velar fronting) — 예: ㄱ→ㄷ";
  if (antT && !antA && velarA) return "후방화 (backing) — 예: ㄷ→ㄱ";
  if (grooveT && g(A, "tongue_groove") < 0.15 && fullContactA) return "파열음화 (stopping) — 마찰/파찰 → 파열";
  if (g(T, "lips_round") >= 0.8 && g(A, "lips_round") < 0.3) return "원순성 소실 (unrounding)";
  if (nasalT !== nasalA) return nasalT ? "탈비음화 (denasalization)" : "비음화 (nasalization)";
  return null;
}

// ── 재생 타임라인 ─────────────────────────────────────────────────────────────
// 자세 시퀀스. ease?: 세그먼트 보간 곡선. 기본 smooth01(ease-in-out).
// "out"=ease-out(빠른 출발→목표에서 감속) — 파열음처럼 "탁" 붙는 접촉에 사용(v1 RiggedViewer와 동일 개념).
export type Seg = { pose: Pose; dur: number; ease?: "out" };

export function smooth01(t: number) {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
}
// ease-out: 빠르게 출발해 목표에서 감속(시작 기울기 급함) → 파열음 "탁" 접촉감.
export function easeOut01(t: number) {
  t = Math.min(1, Math.max(0, t));
  return 1 - (1 - t) * (1 - t);
}

// 조음방법(manner)별 제스처 envelope: 이동(move) 길이·이징 + 유지(hold) 길이.
// ⚠️ 목표/실제 재생 동기화를 위해 **목표 음소 기준**으로만 정한다(둘 다 같은 시간 슬롯을
// 채우므로 어긋나지 않음). 조음위치(pose)는 그대로, 전환의 "느낌"만 조음방법별로.
export function gestureEnvelope(phoneId: string): { moveDur: number; moveEase?: "out"; holdDur: number } {
  if (phoneById(phoneId).kind === "vowel") return { moveDur: 0.28, holdDur: 0.34 }; // 모음: 부드럽고 김
  const id = phoneId.startsWith("c_") ? phoneId.slice(2) : phoneId;
  switch (id) {
    case "k": return { moveDur: 0.18, moveEase: "out", holdDur: 0.16 }; // 연구개 파열 "탁"
    case "p":
    case "t": return { moveDur: 0.16, moveEase: "out", holdDur: 0.14 }; // 파열: 재빠른 접촉
    case "c": return { moveDur: 0.14, moveEase: "out", holdDur: 0.22 }; // 파찰: 빠른 폐쇄+긴 접촉
    case "s":
    case "h": return { moveDur: 0.2, holdDur: 0.34 }; // 마찰: 지속(sustained)
    case "m":
    case "n":
    case "ng": return { moveDur: 0.18, holdDur: 0.32 }; // 비음: murmur 유지
    case "r_tap": return { moveDur: 0.12, moveEase: "out", holdDur: 0.1 }; // 탄설: 빠른 접촉
    case "l": return { moveDur: 0.18, holdDur: 0.22 }; // 설측: 유지
    default: return { moveDur: 0.2, holdDur: 0.16 };
  }
}

// 공유 클럭 t(초)에서 현재 자세를 보간해 반환.
export function sampleSegs(segs: Seg[], t: number): Pose {
  let acc = 0;
  for (let i = 0; i < segs.length; i++) {
    const d = segs[i].dur;
    if (t < acc + d || i === segs.length - 1) {
      const from = i === 0 ? segs[0].pose : segs[i - 1].pose;
      const raw = d > 0 ? Math.min(1, (t - acc) / d) : 1;
      const local = segs[i].ease === "out" ? easeOut01(raw) : smooth01(raw);
      return lerpPose(from, segs[i].pose, local);
    }
    acc += d;
  }
  return segs[segs.length - 1].pose;
}

export type Clock = { t: number };
export type PlayState = { playing: boolean; speed: number; loop: boolean; total: number };

// Canvas 내부에서 공유 클럭을 진행시키는 드라이버(재생 종료 시 onEnd).
export function ClockDriver({
  clockRef,
  playRef,
  onEnd,
}: {
  clockRef: React.RefObject<Clock>;
  playRef: React.RefObject<PlayState>;
  onEnd: () => void;
}) {
  useFrame((_, dt) => {
    const p = playRef.current;
    if (!p.playing) return;
    clockRef.current.t += dt * p.speed;
    if (clockRef.current.t >= p.total) {
      if (p.loop) {
        clockRef.current.t = 0;
      } else {
        clockRef.current.t = p.total;
        p.playing = false;
        onEnd();
      }
    }
  });
  return null;
}

// ── 정적 조음기관 (한 자세를 고정 렌더) ────────────────────────────────────────
export type Highlight = { tongue: boolean; lips: boolean };

export function StaticArticulator({
  pose,
  lipOpacity,
  showArt,
  hideHead = false,
  ghost = false,
  highlight,
  hlColor = HL_COLOR,
  segsRef,
  clockRef,
  playRef,
  livePoseRef,
}: {
  pose: Pose;
  lipOpacity: number;
  showArt: boolean;
  hideHead?: boolean;
  ghost?: boolean;
  highlight?: Highlight;
  hlColor?: number; // 강조색(기본 로즈, 훈련뷰는 교정 방향=에메랄드)
  segsRef?: React.RefObject<Seg[] | null>;
  clockRef?: React.RefObject<Clock>;
  playRef?: React.RefObject<PlayState>;
  // 실시간 외부 구동 포즈(예: 마이크 음향→혀 위치 바이오피드백). 설정 시 매 프레임 이 포즈를
  // 우선 렌더(재생/정적 모드 무시). null이면 기존 재생/정적 로직.
  livePoseRef?: React.RefObject<Pose | null>;
}) {
  const { scene } = useGLTF(MODEL_URL);
  // 인스턴스마다 씬을 복제(지오메트리는 공유, 재질은 아래서 복제해 독립).
  const root = useMemo(() => scene.clone(true), [scene]);

  const poseRef = useRef(pose);
  const opRef = useRef(lipOpacity);
  const showRef = useRef(showArt);
  const hideHeadRef = useRef(hideHead);
  const ghostRef = useRef(ghost);
  const hlRef = useRef<Highlight>(highlight ?? { tongue: false, lips: false });
  const hlColorRef = useRef(hlColor);
  poseRef.current = pose;
  opRef.current = lipOpacity;
  showRef.current = showArt;
  hideHeadRef.current = hideHead;
  ghostRef.current = ghost;
  hlRef.current = highlight ?? { tongue: false, lips: false };
  hlColorRef.current = hlColor;

  type Base = {
    mesh: THREE.Mesh;
    name: string;
    pos: THREE.Vector3;
    quat: THREE.Quaternion;
    baseVerts: Float32Array | null;
    mats: THREE.Material[];
  };
  const bases = useRef<Base[]>([]);

  useEffect(() => {
    bases.current = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.morphTargetDictionary) return;
      // 재질을 인스턴스별로 복제해 두 인스턴스가 opacity/색/재질 설정을 공유하지 않게 함.
      if (Array.isArray(m.material)) m.material = m.material.map((mt) => mt.clone());
      else m.material = m.material.clone();
      const mats = (Array.isArray(m.material) ? m.material : [m.material]) as THREE.Material[];

      const posAttr = m.geometry.attributes.position as THREE.BufferAttribute;
      if (m.name === "lips_upper") {
        for (const mt of mats) {
          const std = mt as THREE.Material;
          std.polygonOffset = true;
          std.polygonOffsetFactor = -4;
          std.polygonOffsetUnits = -4;
        }
      }
      bases.current.push({
        mesh: m,
        name: m.name,
        pos: m.position.clone(),
        quat: m.quaternion.clone(),
        baseVerts:
          isLipMesh(m.name) || m.name === "tongue"
            ? Float32Array.from(posAttr.array as ArrayLike<number>)
            : null,
        mats,
      });
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat && "roughness" in mat) {
        mat.side = THREE.DoubleSide;
        mat.roughness = 0.85;
        mat.metalness = 0;
        if (m.name === "head") {
          mat.alphaTest = 0.5;
          mat.transparent = false;
          mat.depthWrite = true;
          mat.emissiveMap = mat.map;
          mat.emissive = new THREE.Color(0xffffff);
          mat.emissiveIntensity = 1;
          mat.color = new THREE.Color(0x000000);
        }
        mat.needsUpdate = true;
      }
    });
  }, [root]);

  const q = useRef(new THREE.Quaternion()).current;
  const v = useRef(new THREE.Vector3()).current;
  const pivot = useRef(new THREE.Vector3()).current;
  const Z = useRef(new THREE.Vector3(0, 0, 1)).current;

  // 조음기관 재질 스타일(고스트/강조/기본)을 적용.
  const styleArticulator = (mesh: THREE.Mesh, mats: THREE.Material[], isLip: boolean) => {
    const g = ghostRef.current;
    const hl = hlRef.current;
    const hc = hlColorRef.current;
    const highlighted = isLip ? hl.lips : hl.tongue;
    for (const mt of mats) {
      const std = mt as THREE.MeshStandardMaterial;
      if (g) {
        std.transparent = true;
        std.opacity = GHOST_OPACITY;
        std.depthWrite = false;
        if ("emissive" in std) {
          std.emissive.setHex(GHOST_COLOR);
          std.emissiveIntensity = 0.35;
        }
      } else if (isLip) {
        std.transparent = true;
        std.opacity = opRef.current; // 사용자 슬라이더(입술 투명도)
        std.depthWrite = true;
        if ("emissive" in std) {
          std.emissive.setHex(highlighted ? hc : 0x000000);
          std.emissiveIntensity = highlighted ? 0.4 : 1;
        }
      } else {
        // 혀(비고스트): 불투명 유지, 강조 시 틴트
        std.transparent = false;
        std.opacity = 1;
        std.depthWrite = true;
        if ("emissive" in std) {
          std.emissive.setHex(highlighted ? hc : 0x000000);
          std.emissiveIntensity = highlighted ? 0.4 : 1;
        }
      }
    }
    mesh.renderOrder = g ? 2 : 0;
  };

  useFrame(() => {
    // 실시간 구동 포즈 우선 → 재생 중이면 타임라인 샘플 → 정적 포즈.
    const playing = playRef?.current.playing;
    const segs = segsRef?.current;
    const activePose =
      livePoseRef?.current ??
      (playing && segs && segs.length && clockRef
        ? sampleSegs(segs, clockRef.current.t)
        : poseRef.current);
    const eff = fullPose(activePose);
    const jawW = eff["jaw_open"] ?? 0;
    const lipsJaw = jawW * JAW.lips; // 아랫입술 하강(턱 개구 연동)
    pivot.set(JAW.pivotX, JAW.pivotY, 0);
    const maxRad = THREE.MathUtils.degToRad(JAW.maxDeg) * jawW;

    for (const b of bases.current) {
      if (b.name === "head") b.mesh.visible = !hideHeadRef.current;
      if (b.name === "tongue" || isLipMesh(b.name)) b.mesh.visible = showRef.current;

      const dict = b.mesh.morphTargetDictionary;
      const inf = b.mesh.morphTargetInfluences;
      if (dict && inf) {
        for (const [name, idx] of Object.entries(dict)) {
          let val = name === "lips_jaw_open" ? lipsJaw : eff[name] ?? 0;
          // "닫힘" 재정의: 완전 밀폐가 아니라 semantic을 VELUM_CLOSED_MIN(0.1)로 floor → 적용 0.9 최대. (v1과 동일)
          if (name === "velum_open" && VELUM_INVERTED)
            val = (1 - Math.max(VELUM_CLOSED_MIN, val)) * VELUM_CLOSE;
          inf[idx] = val;
        }
      }

      if (b.name === "tongue" && b.baseVerts) {
        const posAttr = b.mesh.geometry.attributes.position as THREE.BufferAttribute;
        const arr = posAttr.array as Float32Array;
        const base = b.baseVerts;
        // ⚠️ tongue_back_up 모프가 three.js에서 1.0으로 하드클램프되어(외삽 안 됨) 혀 뒤가 연구개까지
        // 못 닿는다 → velar(ㄱㄲㅋ, back_up→1.0)에서 혀 뒤(로컬 -X)를 기하적으로 추가로 들어올려 접촉.
        // 0.75~1.0 연속 램프라 팝 없이 부드럽게(ㅇ 0.71·모음 ≤0.6은 0). (v1과 동일)
        const backUp = eff["tongue_back_up"] ?? 0;
        const dlift = Math.min(1, Math.max(0, (backUp - 0.75) / 0.25)) * 0.05;
        for (let i = 0; i < arr.length; i += 3) {
          const lx = base[i]; // 로컬 X: +전방(치조) / −후방(연구개쪽)
          const post = Math.min(1, Math.max(0, (-0.02 - lx) / 0.21));
          arr[i] = base[i];
          arr[i + 1] = base[i + 1] + post * dlift;
          arr[i + 2] = base[i + 2];
        }
        posAttr.needsUpdate = true;
        b.mesh.scale.setScalar(1);
        if (JAW.tongue > 0 && maxRad !== 0) {
          q.setFromAxisAngle(Z, -maxRad * JAW.tongue);
          v.copy(b.pos).sub(pivot).applyQuaternion(q).add(pivot);
          b.mesh.position.copy(v);
          b.mesh.quaternion.copy(q).multiply(b.quat);
        } else {
          b.mesh.position.copy(b.pos);
          b.mesh.quaternion.copy(b.quat);
        }
        styleArticulator(b.mesh, b.mats, false);
      } else if (isLipMesh(b.name)) {
        b.mesh.position.copy(b.pos);
        b.mesh.quaternion.copy(b.quat);
        styleArticulator(b.mesh, b.mats, true);
      }
    }
  });

  return <primitive object={root} />;
}

export function Lights() {
  return (
    <>
      <ambientLight intensity={0.6} />
      <hemisphereLight args={["#fff1e8", "#2a2030", 0.5]} />
      <directionalLight position={[3, 4, 6]} intensity={1.2} color="#fff2e6" />
      <directionalLight position={[-4, 1.5, 3]} intensity={0.5} color="#cfe0ff" />
      <pointLight position={[2, 0, 4]} intensity={0.5} color="#ffd9c0" />
    </>
  );
}

export const CAM = { position: [2.4, 0, 0.5] as [number, number, number], fov: 35, near: 0.01, far: 100 };

useGLTF.preload(MODEL_URL);
