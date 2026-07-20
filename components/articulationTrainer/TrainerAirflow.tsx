"use client";

// 훈련 탭(시상면) 전용 기류 시각화 — 마찰음 /ㅅ/ 계열.
// 음소산출(RiggedViewer)의 기류를 훈련뷰에 맞게 축약: 성문→구강 경로를 따라 입자가 흐르고
// 협착점(좁은 틈)에서 벤투리 가속 + 난류(지글거림)가 인다. ⚠️핵심: 협착점 u를 "음소 id"가
// 아니라 **현재 혀 자세**(tongue_retract/back_up)에서 유도한다 → 정상 ㅅ은 치조(u≈0.8),
// 구개음화(혀 뒤로)될수록 협착점이 경구개(뒤, u↓)로 밀려 기류도 함께 후퇴한다.
// 오류→목표 전환(sampleSegs)에 맞춰 협착점이 부드럽게 앞뒤로 이동.

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { fullPose, type Pose } from "@/components/articulator/phonemeMap";
import { sampleSegs, type Clock, type PlayState, type Seg } from "@/components/articulator/renderCore";

// /ㅅ/ 구강 기류 경로 = 음소산출 ORAL_PATH_BY_ID['s']와 동일(정상 ㅅ 기류가 음소산출과 일치).
// 성문(뒤·아래)→인두→구강→입술(앞). 시상면 XY평면(z≈0, +X=전방/입술).
const S_PATH: [number, number, number][] = [
  [-0.274, -0.503, 0], [-0.265, -0.462, 0], [-0.255, -0.391, 0], [-0.244, -0.345, 0],
  [-0.24, -0.304, 0], [-0.237, -0.246, 0], [-0.237, -0.187, 0], [-0.247, -0.138, 0],
  [-0.273, -0.1, 0], [-0.299, -0.052, 0], [-0.296, -0.018, 0], [-0.293, 0.051, 0],
  [-0.29, 0.103, 0], [-0.278, 0.162, 0], [-0.253, 0.198, 0], [-0.22, 0.247, 0],
  [-0.172, 0.272, 0], [-0.121, 0.286, 0], [-0.078, 0.297, 0], [-0.027, 0.311, 0],
  [0.02, 0.316, 0], [0.06, 0.315, 0], [0.097, 0.312, 0], [0.133, 0.299, 0],
  [0.158, 0.288, 0], [0.185, 0.266, 0], [0.201, 0.245, 0], [0.22, 0.21, 0],
  [0.248, 0.187, 0], [0.278, 0.169, 0], [0.31, 0.153, 0], [0.356, 0.144, 0],
  [0.385, 0.138, 0], [0.435, 0.142, 0], [0.477, 0.138, 0],
];
const S_CURVE = new THREE.CatmullRomCurve3(
  S_PATH.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
  false,
  "catmullrom",
  0.5,
);
const AIR_GREEN = new THREE.Color(0x3bff77); // 정확(치조 앞) — 선명한 초록
const AIR_RED = new THREE.Color(0xff2a3d); // 왜곡(경구개 뒤) — 선명한 빨강

// 현재 혀 자세 → 후방화 정도(0=치조 앞/정확, 1=경구개 뒤/왜곡). 협착점·기류색 공통 신호.
function posteriorOf(eff: Pose): number {
  const retract = eff.tongue_retract ?? 0;
  const backUp = eff.tongue_back_up ?? 0;
  return Math.min(1, Math.max(0, Math.max(retract, backUp * 0.6)));
}

export default function TrainerAirflow({
  segsRef,
  clockRef,
  playRef,
  staticPose,
  livePoseRef,
  airActiveRef,
  distortAmtRef,
  lateralAmtRef,
  lateral = false,
}: {
  segsRef: React.RefObject<Seg[] | null>;
  clockRef: React.RefObject<Clock>;
  playRef: React.RefObject<PlayState>;
  staticPose: Pose;
  livePoseRef?: React.RefObject<Pose | null>;
  // 실시간 구동 시 마찰 산출 중일 때만 기류 표시(무음=휴지면 숨김). 미지정(데모)이면 항상 표시.
  airActiveRef?: React.RefObject<boolean>;
  // 실시간 왜곡량(0=정조음/초록, 1=왜곡/빨강). 기류 색. 미지정이면 자세에서 유도.
  distortAmtRef?: React.RefObject<number>;
  // 설측 좌우 fork 강도(0=중앙, 1=완전 좌우). 통합 모드에서 설측 감지 시만 1.
  lateralAmtRef?: React.RefObject<number>;
  lateral?: boolean; // 설측음화(데모용 정적 플래그): lateralAmtRef 없을 때 자세로 fork 유도.
}) {
  const N = 110;
  const ptsRef = useRef<THREE.Points>(null);
  const geomRef = useRef<THREE.BufferGeometry>(null);
  const phases = useRef(Float32Array.from({ length: N }, (_, i) => i / N)).current;
  const speeds = useRef(Float32Array.from({ length: N }, (_, i) => 0.85 + ((i * 37) % 40) / 60)).current;
  const positions = useRef(new Float32Array(N * 3)).current;
  const tmp = useRef(new THREE.Vector3()).current;
  const curColor = useRef(new THREE.Color()).current;
  const staticRef = useRef(staticPose);
  staticRef.current = staticPose;

  useFrame((_, dt) => {
    const grp = ptsRef.current;
    const geo = geomRef.current;
    if (!grp || !geo) return;

    // 실시간 구동 중엔 마찰 산출 중일 때만 기류 표시(무음=휴지면 숨김). 데모(미구동)면 항상.
    const liveDriven = livePoseRef?.current != null;
    grp.visible = liveDriven && airActiveRef ? !!airActiveRef.current : true;
    if (!grp.visible) return;

    // 현재 유효 자세: 실시간 구동 우선 → 재생 중 타임라인 샘플 → 정적(StaticArticulator와 동일 규칙).
    const playing = playRef.current?.playing;
    const segs = segsRef.current;
    const pose =
      livePoseRef?.current ??
      (playing && segs && segs.length && clockRef.current
        ? sampleSegs(segs, clockRef.current.t)
        : staticRef.current);
    const eff = fullPose(pose);
    const posterior = posteriorOf(eff);
    const tc = 0.8 - 0.3 * posterior; // 협착점: 정확=치조(u≈0.8), 후방화될수록 경구개(u↓)

    // 왜곡량(0=정조음/초록, 1=왜곡/빨강): 실시간 구동 시 외부 신호(음향) 우선, 아니면 자세에서 유도
    // (설측=중앙 홈 닫힘 1-groove, 구개음화=후방화 posterior).
    const liveDriven2 = livePoseRef?.current != null;
    const grooveClosed = 1 - (eff.tongue_groove ?? 0);
    const amt =
      liveDriven2 && distortAmtRef
        ? Math.min(1, Math.max(0, distortAmtRef.current))
        : lateral
          ? Math.min(1, Math.max(0, (grooveClosed - 0.5) / 0.5))
          : Math.min(1, Math.max(0, (posterior - 0.05) / 0.45));

    // 기류 색: 초록→빨강. 가법 블렌딩에서 또렷하게 보이도록 살짝 오버드라이브(>1).
    curColor.copy(AIR_GREEN).lerp(AIR_RED, amt).multiplyScalar(1.4);
    (grp.material as THREE.PointsMaterial).color.copy(curColor);

    const dtl = Math.min(dt, 0.05);
    for (let i = 0; i < N; i++) {
      // 벤투리: 좁은 협착 틈을 지날 때 가속.
      let sp = speeds[i] * (1 + Math.max(0, 1 - Math.abs(phases[i] - tc) / 0.12) * 1.3);
      let p = phases[i] + sp * dtl * 0.5;
      if (p > 1) p -= 1;
      phases[i] = p;
      const uc = Math.min(0.999, Math.max(0, p));
      S_CURVE.getPointAt(uc, tmp);
      let x = tmp.x, y = tmp.y, z = tmp.z + 0.02;
      // 난류: 협착점~하류(틈 통과 후)에서 지글거림, 통과 뒤 더 흩어짐.
      if (p > tc - 0.06) {
        const amp = 0.018 * (p > tc ? 2 : 1);
        x += (Math.random() - 0.5) * amp;
        y += (Math.random() - 0.5) * amp;
      }
      // 설측음화: 협착점(치조)에서 공기가 혀 양옆(±Z)으로 갈라져 샘. fork 강도=lateralAmtRef(음향)
      // 우선, 없으면 정적 lateral 플래그일 때 왜곡량(amt)에서 유도.
      // ±Z=진짜 좌우(정면/비스듬에서 보임), ±Y=시상면 가시성용 상하 스프레드(좌우 대칭).
      const latAmt = lateralAmtRef ? Math.min(1, Math.max(0, lateralAmtRef.current)) : lateral ? amt : 0;
      if (latAmt > 0.02) {
        const zSide = i % 2 === 0 ? 1 : -1;
        const ySide = Math.floor(i / 2) % 2 === 0 ? 1 : -1;
        const fork = Math.max(0, 1 - Math.abs(p - tc) / 0.22) * latAmt;
        z += zSide * 0.16 * fork;
        y += ySide * 0.05 * fork;
      }
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
    }
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  });

  return (
    <points ref={ptsRef} renderOrder={999} frustumCulled={false}>
      <bufferGeometry ref={geomRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={N} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        size={0.055}
        sizeAttenuation
        transparent
        opacity={1}
        depthTest={false}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
