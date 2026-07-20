"use client";

// 음운변동 훈련용 단순 시상면 조음뷰 — 겹쳐보기(overlay) 대신 "오류→목표 애니메이션 전환".
// 근거(DYNARTmo, Kröger 2025): 아동에겐 단순화 2D 시상면 + 색 신호 + 애니메이션이 겹쳐보기보다
// 인지부하가 낮다. 여기선 단일 3D 모델을 사지탈로 고정(회전 잠금)하고, 오류 자세↔목표 자세를
// 부드럽게 오가며(loop), 움직이는 조음기관만 에메랄드로 강조한다.
//  · mode="transition": 오류↔목표 전환 반복(교정 방향 시연)
//  · mode="target": 목표 자세 정지(“내 차례” 모델)  · mode="error": 오류 자세 정지

import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, OrbitControls } from "@react-three/drei";
import { fullPose, type Pose } from "@/components/articulator/phonemeMap";
import {
  ClockDriver,
  HL_EMERALD,
  Lights,
  StaticArticulator,
  gestureEnvelope,
  type Clock,
  type Highlight,
  type PlayState,
  type Seg,
} from "@/components/articulator/renderCore";
import TrainerAirflow from "./TrainerAirflow";

// 사지탈 초기 카메라: +Z에서 XY 시상면을 정면으로 봄(입술=+X 오른쪽).
// 측면(사지탈)을 처음부터 보여주되, OrbitControls로 3D 회전도 가능하게 한다.
const SAG_CAM = { position: [0, 0, 3] as [number, number, number], fov: 35, near: 0.01, far: 100 };

export type SagittalMode = "transition" | "target" | "error";

export default function SagittalArticulator({
  errorPose,
  targetPose,
  targetPhoneId,
  mode = "transition",
  highlight,
  showArt = true,
  lipOpacity = 0.55,
  speed = 0.8,
  airflow = false,
  livePoseRef,
}: {
  errorPose: Pose;
  targetPose: Pose;
  targetPhoneId: string; // gestureEnvelope용 (예: "c_s")
  mode?: SagittalMode;
  highlight?: Highlight; // 움직이는 조음기관(computeDiffs에서 유도)
  showArt?: boolean; // KP fade: 끄면 혀·입술 숨김(단면만)
  lipOpacity?: number;
  speed?: number;
  airflow?: boolean; // 마찰음 계열: 기류(공기 흐름) 입자 표시
  // 실시간 외부 구동 포즈(마이크 음향→혀 위치 바이오피드백). 설정 시 재생/정적 대신 이 포즈 렌더.
  livePoseRef?: React.RefObject<Pose | null>;
}) {
  const clockRef = useRef<Clock>({ t: 0 });
  const playRef = useRef<PlayState>({ playing: false, speed, loop: true, total: 0 });
  const segsRef = useRef<Seg[] | null>(null);

  // 오류→목표 루프 타임라인: [오류 유지]→[전이]→[목표 유지]→[복귀].
  const { segs, total } = useMemo(() => {
    const env = gestureEnvelope(targetPhoneId);
    const moveDur = Math.max(env.moveDur, 0.5); // 교육용: 전이가 충분히 보이게
    const err = fullPose(errorPose);
    const tgt = fullPose(targetPose);
    const s: Seg[] = [
      { pose: err, dur: 0.6 }, // 오류 유지
      { pose: tgt, dur: moveDur, ease: env.moveEase }, // 오류 → 목표 전이
      { pose: tgt, dur: 0.7 }, // 목표 유지
      { pose: err, dur: moveDur }, // 목표 → 오류 복귀
    ];
    return { segs: s, total: s.reduce((a, x) => a + x.dur, 0) };
  }, [errorPose, targetPose, targetPhoneId]);

  useEffect(() => {
    segsRef.current = segs;
    playRef.current.total = total;
    clockRef.current.t = 0;
  }, [segs, total]);

  useEffect(() => {
    playRef.current.playing = mode === "transition";
    if (mode !== "transition") clockRef.current.t = 0;
  }, [mode]);

  useEffect(() => {
    playRef.current.speed = speed;
  }, [speed]);

  const staticPose = mode === "error" ? errorPose : targetPose;
  const hl = mode === "transition" ? highlight : undefined;

  const bg = "radial-gradient(circle at 50% 40%, #f1f5f9 0%, #e2e8f0 60%, #cbd5e1 100%)";

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl" style={{ background: bg }}>
      <Canvas camera={SAG_CAM} dpr={[1, 2]} gl={{ alpha: true, antialias: true }}>
        <Lights />
        <ClockDriver clockRef={clockRef} playRef={playRef} onEnd={() => undefined} />
        <Suspense fallback={null}>
          <Bounds fit clip margin={0.75}>
            <StaticArticulator
              pose={staticPose}
              lipOpacity={lipOpacity}
              showArt={showArt}
              highlight={hl}
              hlColor={HL_EMERALD}
              segsRef={segsRef}
              clockRef={clockRef}
              playRef={playRef}
              livePoseRef={livePoseRef}
            />
          </Bounds>
        </Suspense>
        {/* 기류(마찰음 계열) — Bounds 밖(모델과 같은 월드좌표). 협착점은 현재 혀 자세에서 유도. */}
        {airflow && (
          <TrainerAirflow
            segsRef={segsRef}
            clockRef={clockRef}
            playRef={playRef}
            staticPose={staticPose}
            livePoseRef={livePoseRef}
          />
        )}
        {/* 측면(사지탈)을 기본으로 보되 3D 회전·줌 가능. */}
        <OrbitControls enablePan enableZoom enableRotate minDistance={0.5} maxDistance={20} makeDefault />
      </Canvas>
    </div>
  );
}
