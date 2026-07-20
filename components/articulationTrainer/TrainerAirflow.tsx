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
const AIR_ORAL = new THREE.Color(0x66ddff);

// 현재 혀 자세 → 협착점 u. 정상 ㅅ(치조, 음소산출과 동일 u≈0.80),
// 혀가 뒤·위(경구개)로 갈수록 협착점이 뒤로(u↓, 최소 ~0.60).
function constrictionFromPose(eff: Pose): number {
  const retract = eff.tongue_retract ?? 0;
  const backUp = eff.tongue_back_up ?? 0;
  const posterior = Math.min(1, Math.max(0, Math.max(retract, backUp * 0.6)));
  return 0.8 - 0.3 * posterior;
}

export default function TrainerAirflow({
  segsRef,
  clockRef,
  playRef,
  staticPose,
  livePoseRef,
}: {
  segsRef: React.RefObject<Seg[] | null>;
  clockRef: React.RefObject<Clock>;
  playRef: React.RefObject<PlayState>;
  staticPose: Pose;
  livePoseRef?: React.RefObject<Pose | null>;
}) {
  const N = 64;
  const ptsRef = useRef<THREE.Points>(null);
  const geomRef = useRef<THREE.BufferGeometry>(null);
  const phases = useRef(Float32Array.from({ length: N }, (_, i) => i / N)).current;
  const speeds = useRef(Float32Array.from({ length: N }, (_, i) => 0.85 + ((i * 37) % 40) / 60)).current;
  const positions = useRef(new Float32Array(N * 3)).current;
  const tmp = useRef(new THREE.Vector3()).current;
  const staticRef = useRef(staticPose);
  staticRef.current = staticPose;

  useFrame((_, dt) => {
    const grp = ptsRef.current;
    const geo = geomRef.current;
    if (!grp || !geo) return;

    // 현재 유효 자세: 실시간 구동 우선 → 재생 중 타임라인 샘플 → 정적(StaticArticulator와 동일 규칙).
    const playing = playRef.current?.playing;
    const segs = segsRef.current;
    const pose =
      livePoseRef?.current ??
      (playing && segs && segs.length && clockRef.current
        ? sampleSegs(segs, clockRef.current.t)
        : staticRef.current);
    const eff = fullPose(pose);
    const tc = constrictionFromPose(eff); // 협착점(좁은 틈)

    const dtl = Math.min(dt, 0.05);
    for (let i = 0; i < N; i++) {
      // 벤투리: 좁은 협착 틈을 지날 때 가속.
      let sp = speeds[i] * (1 + Math.max(0, 1 - Math.abs(phases[i] - tc) / 0.12) * 1.3);
      let p = phases[i] + sp * dtl * 0.5;
      if (p > 1) p -= 1;
      phases[i] = p;
      const uc = Math.min(0.999, Math.max(0, p));
      S_CURVE.getPointAt(uc, tmp);
      let x = tmp.x, y = tmp.y;
      const z = tmp.z + 0.02;
      // 난류: 협착점~하류(틈 통과 후)에서 지글거림, 통과 뒤 더 흩어짐.
      if (p > tc - 0.06) {
        const amp = 0.018 * (p > tc ? 2 : 1);
        x += (Math.random() - 0.5) * amp;
        y += (Math.random() - 0.5) * amp;
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
        size={0.03}
        sizeAttenuation
        transparent
        opacity={0.85}
        depthTest={false}
        depthWrite={false}
        color={AIR_ORAL}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
