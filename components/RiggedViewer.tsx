"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  Bounds,
  GizmoHelper,
  GizmoViewport,
  Line,
  OrbitControls,
  useGLTF,
} from "@react-three/drei";
import * as THREE from "three";
import {
  CONSONANTS,
  DIPHTHONGS,
  VOWELS,
  LIP_OPACITY,
  VELUM_INVERTED,
  VELUM_CLOSE,
  VELUM_CLOSED_MIN,
  IDLE_POSE,
  mannerOf,
  fullPose,
  lerp,
  lerpPose,
  type Pose,
  type Manner,
} from "@/components/articulator/phonemeMap";

const MODEL_URL = "/models/head-rigged.glb?v=36";

// The lips mesh is split into upper/lower halves (lips_upper is drawn with depth
// priority so it hides the lower lip's overlap at closure — "윗입술 우선").
const isLipMesh = (n: string) => n === "lips_upper" || n === "lips_lower";

const EXPECTED: Record<string, string[]> = {
  tongue: [
    "tongue_tip_up",
    "tongue_tip_down",
    "tongue_front_up",
    "tongue_back_up",
    "tongue_retract",
    "tongue_groove",
    "tongue_lateral_channel",
  ],
  lips_upper: ["lips_closed", "lips_round", "lips_spread", "lips_jaw_open"],
  lips_lower: ["lips_closed", "lips_round", "lips_spread", "lips_jaw_open"],
  head: ["jaw_open", "velum_open"],
};

const ZERO = fullPose({});

// ── articulatory gesture timeline ───────────────────────────────────────────
// Each phoneme plays as a sequence of eased segments (onset → hold → release),
// so motion is smooth and stops actually burst open.
// ease?: 세그먼트 보간 곡선 선택. 기본은 smooth01(ease-in-out). "out"=ease-out
// (빠르게 출발→목표에서 감속) — 파열 폐쇄처럼 혀가 "탁" 붙는 느낌에 사용.
type Seg = { pose: Pose; op: number; dur: number; ease?: "out" };
type Seq = {
  segs: Seg[];
  loop: boolean;
  start: Pose;
  startOp: number;
  i: number;
  elapsed: number;
  active: boolean;
};

function consonantGesture(c: (typeof CONSONANTS)[number]): {
  segs: Seg[];
  loop: boolean;
} {
  const P = fullPose(c.pose);
  const op = c.opacity;
  switch (mannerOf(c.manner)) {
    case "stop":
      // Close → brief occlusion → release → return to (slightly-open) rest. The
      // closure phase forms the contact (ㅂ lips, ㄷ tip↔alveolar, ㄱ dorsum↔velum);
      // then it opens back to rest — a stop is a transient, not a held posture.
      if (c.id === "k") {
        // ㄱㅋㄲ(연구개)만: 혀 뒤가 연구개까지 크게 올라오는 움직임이라 빠르면 뚝뚝 끊겨 보임.
        // 다른 파열음은 그대로 두고 velar만 전환을 길게(≈2배) 잡아 천천히·부드럽게 상승/개방.
        return {
          segs: [
            // ease-out: 혀가 빠르게 출발해 연구개 접촉에서 감속 → "탁" 붙되 팝 없이 연속.
            { pose: P, op, dur: 0.16, ease: "out" }, // 또렷하게 상승해 연구개 폐쇄 형성
            { pose: P, op, dur: 0.24 }, // 접촉 유지
            { pose: fullPose({ jaw_open: 0.12 }), op, dur: 0.13 }, // 개방
            { pose: IDLE_POSE, op: LIP_OPACITY.idle, dur: 0.28 }, // 휴지 복귀
          ],
          loop: false,
        };
      }
      return {
        segs: [
          { pose: P, op, dur: 0.16 }, // form closure
          { pose: P, op, dur: 0.18 }, // occlusion (hold contact briefly)
          { pose: fullPose({ jaw_open: 0.14 }), op, dur: 0.09 }, // release burst
          { pose: IDLE_POSE, op: LIP_OPACITY.idle, dur: 0.22 }, // back to rest
        ],
        loop: false,
      };
    case "affricate": {
      // ㅈㅊㅉ 치경경구개 파찰: 폐쇄(혀 앞날 접촉) → 느린 개방(마찰)으로 끊김 없이 흐르게.
      // 입은 벌리지 않고(턱 X) 휴지보다 살짝 다물린 채 마찰 — jaw_open 대신 lips_closed.
      const fric = fullPose({ tongue_front_up: 0.55, tongue_groove: 1, lips_closed: 0.5 });
      return {
        segs: [
          // 지연개방성(delayed release): 빠른 폐쇄 → 긴 접촉 유지 → 느린 마찰 개방
          { pose: P, op, dur: 0.1 }, // ① 빠르게 상승해 접촉(혀 앞날이 재빨리 붙음)
          { pose: P, op, dur: 0.4 }, // ② 접촉을 오래 유지(폐쇄 구간)
          { pose: fric, op, dur: 0.55 }, // ③ 느린 마찰 개방 — 혀가 천천히 떨어짐
          { pose: IDLE_POSE, op: LIP_OPACITY.idle, dur: 0.24 }, // ④ 휴지 복귀
        ],
        loop: false,
      };
    }
    case "nasal": {
      // oral closure releases but the velum stays open through the murmur
      const rel = fullPose({ ...c.pose, lips_closed: 0, tongue_tip_up: 0, jaw_open: 0.1 });
      return {
        segs: [
          { pose: P, op, dur: 0.18 },
          { pose: P, op, dur: 0.5 }, // nasal murmur
          { pose: rel, op, dur: 0.15 },
          { pose: IDLE_POSE, op: LIP_OPACITY.idle, dur: 0.25 },
        ],
        loop: false,
      };
    }
    case "fricative":
      // 마찰음(ㅅㅆ): 지속음 — 좁은 틈으로 기류가 계속 흐른다(loop). 다른 음소/휴지 전까지 지속.
      return {
        segs: [
          { pose: P, op, dur: 0.2 }, // 접근(협착 형성)
          { pose: P, op, dur: 0.6 }, // 마찰 지속(반복)
        ],
        loop: true,
      };
    case "tap":
      // 탄설: tip rises to the alveolar ridge, holds 0.5s, then lowers — once.
      return {
        segs: [
          { pose: P, op, dur: 0.15 }, // rise (tongue tip up)
          { pose: P, op, dur: 0.5 }, // hold 0.5s
          { pose: IDLE_POSE, op: LIP_OPACITY.idle, dur: 0.2 }, // lower
        ],
        loop: false,
      };
    case "lateral":
      // 설측: 지속음 — 혀끝 접촉 자세를 유지하고 기류가 계속 흐른다(loop=true).
      // 다른 음소를 누르거나 휴지 전까지 자세·기류 지속.
      return {
        segs: [
          { pose: P, op, dur: 0.2 }, // 접촉으로 상승
          { pose: P, op, dur: 0.6 }, // 유지(반복)
        ],
        loop: true,
      };
    default: // glottal ㅎ
      return {
        segs: [
          { pose: P, op, dur: 0.15 },
          { pose: P, op, dur: 0.2 },
          { pose: IDLE_POSE, op: LIP_OPACITY.idle, dur: 0.2 },
        ],
        loop: false,
      };
  }
}

const Z = new THREE.Vector3(0, 0, 1);

type Jaw = {
  on: boolean;
  pivotX: number;
  pivotY: number;
  maxDeg: number;
  tongue: number;
  lips: number;
};

// Web-side placement of the new lips mesh so it sits in front of (not overlapping)
// the head's sagittal-section lips. Clean fix = rigger removes the head lips.
type LipFit = { fwd: number; up: number; scale: number };

// Same idea for the tongue: at rest it pokes through the teeth, so nudge it
// back/down and scale until it sits behind the teeth inside the oral cavity.
// This is the base rest position; all tongue gestures build on top of it.
type TongueFit = { fwd: number; up: number; scale: number };

type Found = { mesh: string; targets: string[] };
type Base = {
  mesh: THREE.Mesh;
  name: string;
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  baseVerts: Float32Array | null;
  lipMats: THREE.Material[];
  centroid: THREE.Vector3;
};

function smooth01(t: number) {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
}

// ease-out: 빠르게 출발해 목표에서 감속. 시작 기울기가 급해 "탁" 붙는 느낌(팝 없이 연속).
function easeOut01(t: number) {
  t = Math.min(1, Math.max(0, t));
  return 1 - (1 - t) * (1 - t);
}

// ─────────────────────────────────────────────────────────────────────────────
// 기류(airflow) 시각화 — 성문→인두→(연구개 분기)→구강/비강 경로를 따라 흐르는 입자.
// ⚠️ 경로 좌표는 glTF 시상면(XY평면, z≈0, +X=전방/입술) 기준 근사값 — 스크린샷으로 미세조정 예정.
type AirState = {
  on: boolean;
  manner: Manner | "vowel";
  id: string;
  oralCurve: THREE.CatmullRomCurve3; // 공유 기본 구강 경로(음소별 경로 없을 때 폴백)
  nasalCurve: THREE.CatmullRomCurve3;
  constrictionById: Record<string, number>; // 음소별 협착점 u 오버라이드(있으면 constrictionU 대신 사용)
  oralPathById: Record<string, THREE.CatmullRomCurve3>; // 음소별 구강 경로 오버라이드
  diphFrom: THREE.CatmullRomCurve3 | null; // 이중모음: 시작 단모음 경로
  diphTo: THREE.CatmullRomCurve3 | null; // 이중모음: 도착 단모음 경로 (from→to 보간)
};

// 성문(후두 하후방)에서 인두를 타고 올라와 연구개 포트에서 구강/비강으로 갈라진다.
// 좌표 = 사용자가 3D 편집기(클릭 배치)로 빈 기도 공간을 직접 찍은 실측 경로(2026-07-14, z=0 시상면 레이캐스트).
const ORAL_PATH: [number, number, number][] = [
  [-0.279, -0.536, 0], [-0.252, -0.411, 0], [-0.237, -0.26, 0], [-0.235, -0.156, 0],
  [-0.256, -0.12, 0], [-0.283, -0.068, 0], [-0.297, -0.021, 0], [-0.307, 0.025, 0],
  [-0.306, 0.056, 0], [-0.284, 0.082, 0], [-0.262, 0.116, 0], [-0.247, 0.158, 0],
  [-0.24, 0.198, 0], [-0.221, 0.225, 0], [-0.188, 0.242, 0], [-0.143, 0.246, 0],
  [-0.093, 0.233, 0], [-0.04, 0.214, 0], [0.032, 0.197, 0], [0.077, 0.198, 0],
  [0.133, 0.196, 0], [0.176, 0.187, 0], [0.221, 0.161, 0], [0.254, 0.146, 0],
  [0.297, 0.145, 0], [0.344, 0.14, 0], [0.383, 0.133, 0], [0.437, 0.134, 0], [0.526, 0.132, 0],
];
const NASAL_PATH: [number, number, number][] = [
  [-0.277, -0.518, 0], [-0.272, -0.436, 0], [-0.259, -0.366, 0], [-0.246, -0.269, 0],
  [-0.242, -0.191, 0], [-0.252, -0.119, 0], [-0.298, -0.084, 0], [-0.307, -0.023, 0],
  [-0.305, 0.032, 0], [-0.316, 0.079, 0], [-0.321, 0.132, 0], [-0.32, 0.18, 0],
  [-0.318, 0.236, 0], [-0.316, 0.282, 0], [-0.29, 0.332, 0], [-0.254, 0.365, 0],
  [-0.197, 0.387, 0], [-0.144, 0.399, 0], [-0.101, 0.399, 0], [-0.042, 0.403, 0],
  [0.022, 0.411, 0], [0.109, 0.42, 0], [0.21, 0.424, 0], [0.284, 0.424, 0],
  [0.362, 0.396, 0], [0.39, 0.368, 0], [0.403, 0.326, 0], [0.423, 0.302, 0],
  [0.446, 0.279, 0], [0.475, 0.256, 0], [0.509, 0.245, 0],
];
const makeCurve = (pts: [number, number, number][]) =>
  new THREE.CatmullRomCurve3(
    pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
    false,
    "catmullrom",
    0.5,
  );
const ORAL_CURVE = makeCurve(ORAL_PATH);
const NASAL_CURVE = makeCurve(NASAL_PATH);
const AIR_ORAL = new THREE.Color(0x66ddff);
const AIR_NASAL = new THREE.Color(0xffb861);

// 음소별 구강 기류 경로(혀 위치가 반영된 채널). 사용자가 3D 편집기로 직접 그림(2026-07-14).
// 여기 없는 음소는 공유 ORAL_PATH 사용. 협착점 u는 각 음소의 "자기 경로" 기준.
const ORAL_PATH_BY_ID: Record<string, [number, number, number][]> = {
  t: [[-0.274, -0.51, 0], [-0.257, -0.444, 0], [-0.248, -0.353, 0], [-0.242, -0.241, 0], [-0.239, -0.17, 0], [-0.264, -0.11, 0], [-0.293, -0.048, 0], [-0.309, 0.029, 0], [-0.295, 0.091, 0], [-0.272, 0.145, 0], [-0.258, 0.202, 0], [-0.23, 0.241, 0], [-0.176, 0.27, 0], [-0.108, 0.281, 0], [-0.048, 0.298, 0], [0.011, 0.315, 0], [0.065, 0.307, 0], [0.116, 0.27, 0], [0.156, 0.239, 0], [0.176, 0.199, 0], [0.226, 0.15, 0], [0.287, 0.141, 0], [0.336, 0.141, 0]],
  s: [[-0.274, -0.503, 0], [-0.265, -0.462, 0], [-0.255, -0.391, 0], [-0.244, -0.345, 0], [-0.24, -0.304, 0], [-0.237, -0.246, 0], [-0.237, -0.187, 0], [-0.247, -0.138, 0], [-0.273, -0.1, 0], [-0.299, -0.052, 0], [-0.296, -0.018, 0], [-0.293, 0.051, 0], [-0.29, 0.103, 0], [-0.278, 0.162, 0], [-0.253, 0.198, 0], [-0.22, 0.247, 0], [-0.172, 0.272, 0], [-0.121, 0.286, 0], [-0.078, 0.297, 0], [-0.027, 0.311, 0], [0.02, 0.316, 0], [0.06, 0.315, 0], [0.097, 0.312, 0], [0.133, 0.299, 0], [0.158, 0.288, 0], [0.185, 0.266, 0], [0.201, 0.245, 0], [0.22, 0.21, 0], [0.248, 0.187, 0], [0.278, 0.169, 0], [0.31, 0.153, 0], [0.356, 0.144, 0], [0.385, 0.138, 0], [0.435, 0.142, 0], [0.477, 0.138, 0]],
  k: [[-0.275, -0.527, 0], [-0.236, -0.151, 0], [-0.277, -0.091, 0], [-0.296, -0.019, 0], [-0.302, 0.053, 0], [-0.304, 0.121, 0], [-0.304, 0.174, 0], [-0.298, 0.226, 0], [-0.285, 0.267, 0], [-0.264, 0.299, 0], [-0.215, 0.327, 0], [-0.169, 0.333, 0], [-0.127, 0.331, 0], [-0.08, 0.301, 0], [-0.033, 0.276, 0], [0.002, 0.267, 0], [0.083, 0.229, 0], [0.121, 0.202, 0], [0.162, 0.169, 0], [0.22, 0.146, 0], [0.266, 0.139, 0], [0.34, 0.12, 0], [0.401, 0.123, 0]],
  r_tap: [[-0.278, -0.517, 0], [-0.238, -0.156, 0], [-0.269, -0.097, 0], [-0.295, -0.053, 0], [-0.305, -0.01, 0], [-0.304, 0.041, 0], [-0.291, 0.09, 0], [-0.274, 0.131, 0], [-0.251, 0.179, 0], [-0.227, 0.226, 0], [-0.193, 0.241, 0], [-0.16, 0.25, 0], [-0.115, 0.247, 0], [-0.088, 0.244, 0], [-0.045, 0.244, 0], [-0.015, 0.251, 0], [0.015, 0.261, 0], [0.059, 0.275, 0], [0.103, 0.284, 0], [0.131, 0.293, 0], [0.162, 0.284, 0], [0.181, 0.268, 0], [0.191, 0.249, 0], [0.193, 0.224, 0], [0.201, 0.197, 0], [0.203, 0.166, 0], [0.226, 0.143, 0], [0.251, 0.138, 0], [0.309, 0.128, 0], [0.389, 0.121, 0], [0.512, 0.123, 0]],
  c: [[-0.28, -0.523, 0], [-0.239, -0.136, 0], [-0.279, -0.076, 0], [-0.302, -0.015, 0], [-0.303, 0.065, 0], [-0.285, 0.16, 0], [-0.263, 0.201, 0], [-0.222, 0.241, 0], [-0.165, 0.274, 0], [-0.127, 0.293, 0], [-0.085, 0.316, 0], [-0.032, 0.316, 0], [0.03, 0.306, 0], [0.096, 0.293, 0], [0.138, 0.277, 0], [0.166, 0.26, 0], [0.188, 0.237, 0], [0.205, 0.195, 0], [0.235, 0.148, 0], [0.282, 0.146, 0], [0.322, 0.144, 0], [0.376, 0.137, 0], [0.42, 0.135, 0], [0.484, 0.142, 0]],
  p: [[-0.276, -0.524, 0], [-0.24, -0.129, 0], [-0.306, -0.022, 0], [-0.305, 0.057, 0], [-0.283, 0.095, 0], [-0.266, 0.143, 0], [-0.261, 0.183, 0], [-0.232, 0.228, 0], [-0.167, 0.247, 0], [-0.114, 0.248, 0], [-0.067, 0.227, 0], [0.006, 0.208, 0], [0.073, 0.205, 0], [0.125, 0.2, 0], [0.192, 0.175, 0], [0.236, 0.153, 0], [0.282, 0.15, 0], [0.35, 0.142, 0], [0.382, 0.139, 0], [0.434, 0.139, 0], [0.475, 0.139, 0], [0.508, 0.142, 0]],
  l: [[-0.275, -0.526, 0], [-0.239, -0.133, 0], [-0.299, -0.056, 0], [-0.301, 0.06, 0], [-0.289, 0.154, 0], [-0.252, 0.227, 0], [-0.193, 0.256, 0], [-0.145, 0.247, 0], [-0.095, 0.217, 0], [0.02, 0.157, 0], [0.082, 0.139, 0], [0.139, 0.139, 0], [0.222, 0.13, 0], [0.303, 0.129, 0], [0.375, 0.123, 0], [0.441, 0.117, 0]],
  o: [[-0.281, -0.51, 0], [-0.233, -0.145, 0], [-0.287, -0.087, 0], [-0.311, 0.003, 0], [-0.303, 0.076, 0], [-0.294, 0.172, 0], [-0.283, 0.22, 0], [-0.253, 0.258, 0], [-0.193, 0.274, 0], [-0.142, 0.273, 0], [-0.052, 0.221, 0], [-0.014, 0.213, 0], [0.086, 0.204, 0], [0.17, 0.196, 0], [0.208, 0.177, 0], [0.237, 0.162, 0], [0.298, 0.154, 0], [0.416, 0.139, 0], [0.48, 0.139, 0], [0.514, 0.144, 0]],
  u: [[-0.279, -0.512, 0], [-0.24, -0.124, 0], [-0.287, -0.098, 0], [-0.306, 0.025, 0], [-0.306, 0.071, 0], [-0.291, 0.137, 0], [-0.276, 0.202, 0], [-0.243, 0.272, 0], [-0.2, 0.291, 0], [-0.104, 0.256, 0], [-0.05, 0.229, 0], [0.026, 0.196, 0], [0.1, 0.199, 0], [0.161, 0.192, 0], [0.198, 0.172, 0], [0.245, 0.156, 0], [0.318, 0.149, 0], [0.405, 0.129, 0], [0.465, 0.136, 0], [0.527, 0.138, 0]],
  eu: [[-0.273, -0.508, 0], [-0.248, -0.147, 0], [-0.288, -0.063, 0], [-0.304, 0.029, 0], [-0.304, 0.087, 0], [-0.29, 0.151, 0], [-0.271, 0.208, 0], [-0.238, 0.251, 0], [-0.177, 0.277, 0], [-0.126, 0.274, 0], [-0.066, 0.234, 0], [-0.023, 0.207, 0], [0.041, 0.207, 0], [0.114, 0.199, 0], [0.166, 0.186, 0], [0.221, 0.167, 0], [0.305, 0.157, 0], [0.366, 0.149, 0], [0.427, 0.146, 0], [0.471, 0.145, 0], [0.511, 0.143, 0]],
  i: [[-0.268, -0.509, 0], [-0.224, -0.224, 0], [-0.235, -0.126, 0], [-0.299, 0.018, 0], [-0.296, 0.094, 0], [-0.274, 0.157, 0], [-0.241, 0.228, 0], [-0.182, 0.281, 0], [-0.125, 0.293, 0], [-0.063, 0.307, 0], [-0.001, 0.31, 0], [0.042, 0.312, 0], [0.099, 0.302, 0], [0.148, 0.28, 0], [0.187, 0.257, 0], [0.196, 0.218, 0], [0.221, 0.175, 0], [0.245, 0.156, 0], [0.326, 0.156, 0], [0.405, 0.156, 0], [0.451, 0.153, 0]],
  e: [[-0.271, -0.502, 0], [-0.241, -0.14, 0], [-0.29, -0.061, 0], [-0.306, 0.005, 0], [-0.3, 0.065, 0], [-0.288, 0.145, 0], [-0.275, 0.206, 0], [-0.229, 0.243, 0], [-0.174, 0.261, 0], [-0.036, 0.242, 0], [0.007, 0.226, 0], [0.061, 0.21, 0], [0.124, 0.201, 0], [0.192, 0.18, 0], [0.211, 0.153, 0], [0.269, 0.15, 0], [0.352, 0.139, 0], [0.456, 0.138, 0], [0.495, 0.141, 0]],
  ae: [[-0.273, -0.511, 0], [-0.237, -0.147, 0], [-0.291, -0.064, 0], [-0.312, -0.003, 0], [-0.311, 0.053, 0], [-0.312, 0.12, 0], [-0.282, 0.167, 0], [-0.253, 0.23, 0], [-0.218, 0.26, 0], [-0.137, 0.266, 0], [-0.077, 0.256, 0], [-0.023, 0.24, 0], [0.048, 0.229, 0], [0.097, 0.216, 0], [0.144, 0.2, 0], [0.199, 0.186, 0], [0.24, 0.156, 0], [0.424, 0.144, 0], [0.494, 0.147, 0]],
};
const ORAL_CURVE_BY_ID: Record<string, THREE.CatmullRomCurve3> = Object.fromEntries(
  Object.entries(ORAL_PATH_BY_ID).map(([k, v]) => [k, makeCurve(v)]),
);
// 음소별 협착점(각 음소의 자기 경로 기준 u). 사용자 지정.
const CONSTRICTION_BY_ID: Record<string, number> = { t: 0.763, s: 0.803, k: 0.543, r_tap: 0.723, c: 0.61, p: 0.88, l: 0.697 };

// 조음위치별 폐쇄/협착 지점(구강 경로상 arc-length u: 0=성문 … 1=입술). null=개방(폐쇄 없음).
// 난기류(ㅅㅆ·ㅈㅉㅊ)는 사용자 지정대로 치조(u≈0.87~0.9)에 위치.
function constrictionU(manner: Manner | "vowel", id: string): number | null {
  if (manner === "nasal") return null; // 비강 경로(구강 협착은 route로 처리)
  switch (id) {
    case "p": return 0.98; // 양순(입술)
    case "t": return 0.92; // 치조 파열
    case "s": return 0.92; // 치조 마찰(ㅅㅆ 난류)
    case "c": return 0.84; // 치경경구개 파찰(ㅈㅉㅊ 난류, 치조 살짝 뒤)
    case "k": return 0.62; // 연구개
    default: return null; // ㄹ(설측=side flow 별도)·탄설·ㅎ·모음·활음
  }
}

function Airflow({
  seq,
  air,
}: {
  seq: React.RefObject<Seq>;
  air: React.RefObject<AirState>;
}) {
  const N = 72;
  const ptsRef = useRef<THREE.Points>(null);
  const geomRef = useRef<THREE.BufferGeometry>(null);
  const phases = useRef(Float32Array.from({ length: N }, (_, i) => i / N)).current;
  const speeds = useRef(Float32Array.from({ length: N }, (_, i) => 0.85 + ((i * 37) % 40) / 60)).current;
  const positions = useRef(new Float32Array(N * 3)).current;
  const tmp = useRef(new THREE.Vector3()).current;
  const tmp2 = useRef(new THREE.Vector3()).current;
  const rampAcc = useRef(0); // 제스처 시작 후 경과(스핀업용)
  const lastId = useRef("");
  const wasVisible = useRef(false);

  useFrame((_, dt) => {
    const grp = ptsRef.current;
    const geo = geomRef.current;
    if (!grp || !geo) return;
    const a = air.current;
    const s = seq.current;
    const vis = a.on && s.active; // 제스처 진행 중에만 흐름
    grp.visible = vis;
    if (!vis) {
      wasVisible.current = false;
      return;
    }

    // 스핀업: 새 음소 시작 시 혀가 자리잡는 동안 기류가 느리게 시작 → 정상 속도로.
    // 제스처가 새로 나타나거나(직전 프레임 비가시) 음소가 바뀌면 리셋(세그먼트/루프 경계에선 유지).
    if (!wasVisible.current || a.id !== lastId.current) {
      lastId.current = a.id;
      rampAcc.current = 0;
    }
    wasVisible.current = true;
    rampAcc.current += Math.min(dt, 0.05);
    const rampDur = (s.segs[0]?.dur ?? 0.2) * 1.3;
    const spin = 0.12 + 0.88 * smooth01(Math.min(1, rampAcc.current / rampDur));

    // 이중모음: from→to 단모음 경로 보간. 혀의 활음은 seg1(from자세→to자세 전이)에서 일어나므로
    // 기류 경로도 seg1 동안 보간. seg0(시작모음 접근)엔 from경로 유지, seg2+엔 to경로.
    const isDiph = a.manner !== "nasal" && !!(a.diphFrom && a.diphTo);
    let diphB = 0;
    if (isDiph) {
      if (s.i === 0) diphB = 0;
      else if (s.i === 1 && s.segs[1]) diphB = smooth01(Math.min(1, s.elapsed / s.segs[1].dur));
      else diphB = 1;
    }

    const nasal = a.manner === "nasal";
    // 음소별 경로가 있으면 그걸, 없으면 공유 기본 경로.
    const curve = nasal ? a.nasalCurve : a.oralPathById[a.id] ?? a.oralCurve;
    const tc = nasal ? null : a.constrictionById[a.id] ?? constrictionU(a.manner, a.id);
    // 파열/파찰: 폐쇄 구간(seg 0~1)엔 협착점에서 막힘 → 개방(seg 2)에서 버스트.
    const blocked = (a.manner === "stop" || a.manner === "affricate") && s.i <= 1;
    // 마찰(및 파찰 개방부): 협착점 부근 난류(지글거림).
    const turbulent = a.manner === "fricative" || (a.manner === "affricate" && s.i >= 2);
    // 설측(ㄹ): 혀끝은 치조에 닿고 기류가 혀 양옆(±Z)으로 갈라져 지나감.
    const lateral = a.manner === "lateral";
    // 파열 개방 순간(release 세그먼트): 축적된 기류가 빠르게 분출(버스트).
    const bursting = a.manner === "stop" && s.i === 2;
    const dtl = Math.min(dt, 0.05);

    for (let i = 0; i < N; i++) {
      let sp = speeds[i] * spin; // 스핀업: 혀가 자리잡는 동안 느리게 시작
      // 마찰: 좁은 협착 틈(혀·입천장 사이)을 지날 때 가속(벤투리 효과).
      if (turbulent && tc != null) {
        sp *= 1 + Math.max(0, 1 - Math.abs(phases[i] - tc) / 0.12) * 1.3;
      }
      if (bursting) sp *= 2.6; // 개방 분출
      let p = phases[i] + sp * dtl;
      if (p > 1) p -= 1;
      phases[i] = p;
      let u = p;
      if (blocked && tc != null && u > tc) u = tc; // 폐쇄: 협착점 앞에서 정체(압력 축적)
      const uc = Math.min(0.999, Math.max(0, u));
      if (isDiph) {
        a.diphFrom!.getPointAt(uc, tmp);
        a.diphTo!.getPointAt(uc, tmp2);
        tmp.lerp(tmp2, diphB); // from→to 보간
      } else {
        curve.getPointAt(uc, tmp);
      }
      let x = tmp.x, y = tmp.y, z = tmp.z + 0.02;
      // 마찰 난류: 협착점~하류(틈 통과 후)에서 지글거림, 통과 뒤 더 흩어짐.
      if (turbulent && tc != null && u > tc - 0.06) {
        const amp = 0.018 * (u > tc ? 2 : 1);
        x += (Math.random() - 0.5) * amp;
        y += (Math.random() - 0.5) * amp;
      }
      if (lateral) {
        // 설측: 혀끝 접촉점(=협착점 tc)에서 기류가 혀 양옆으로 갈라짐.
        // ⚠️ 좌우 대칭: ±Z(좌우)와 ±Y(위아래)를 독립 분리(4분면) → 양측이 같은 높이 범위.
        const zSide = i % 2 === 0 ? 1 : -1;
        const ySide = Math.floor(i / 2) % 2 === 0 ? 1 : -1;
        const fork = Math.max(0, 1 - Math.abs(u - (tc ?? 0.85)) / 0.22);
        z += zSide * 0.15 * fork; // 진짜 좌우(정면/회전 시 보임)
        y += ySide * 0.045 * fork; // 시상면 가시성용 상하 스프레드(좌우 대칭)
      }
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
    }
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (grp.material as THREE.PointsMaterial).color.copy(nasal ? AIR_NASAL : AIR_ORAL);
  });

  return (
    <points ref={ptsRef} renderOrder={999} frustumCulled={false}>
      <bufferGeometry ref={geomRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={N} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        size={0.032}
        sizeAttenuation
        transparent
        opacity={0.85}
        depthTest={false}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// 기류 경로 편집기: 시상면(z=0) 클릭 평면 + 경로선/점 + 음소 협착점 마커.
// 드래그(회전)와 클릭(배치)을 포인터 이동거리로 구분한다(5px 미만 = 클릭).
// target "oral"/"nasal" = 경로 점 배치, "constriction" = 선택 음소의 협착점 지정.
function PathEditor({
  air,
  editPts,
  phonemePts,
  target,
  sel,
  onPlace,
  rev,
}: {
  air: React.RefObject<AirState>;
  editPts: React.RefObject<{ oral: [number, number][]; nasal: [number, number][] }>;
  phonemePts: React.RefObject<Record<string, [number, number][]>>;
  target: "oral" | "nasal" | "phonemePath" | "constriction";
  sel: string;
  onPlace: (x: number, y: number) => void;
  rev: number; // 변경 시 리렌더 트리거
}) {
  const down = useRef<[number, number] | null>(null);
  void rev;
  const oralPts = air.current.oralCurve.getPoints(60).map((p) => [p.x, p.y, 0.015] as [number, number, number]);
  const nasalPts = air.current.nasalCurve.getPoints(60).map((p) => [p.x, p.y, 0.015] as [number, number, number]);
  const editArr =
    target === "constriction"
      ? []
      : target === "phonemePath"
        ? (sel ? phonemePts.current[sel] ?? [] : [])
        : editPts.current[target];
  const editColor = target === "nasal" ? "#fb923c" : target === "phonemePath" ? "#22c55e" : "#22d3ee";
  // 선택 음소의 협착점 위치(그 음소 곡선 기준)
  let consPos: [number, number, number] | null = null;
  if (target === "constriction" && sel) {
    const u = air.current.constrictionById[sel] ?? constrictionU("stop", sel);
    if (u != null) {
      const c = air.current.oralPathById[sel] ?? air.current.oralCurve;
      const p = c.getPointAt(Math.min(0.999, Math.max(0, u)));
      consPos = [p.x, p.y, 0.06];
    }
  }
  return (
    <group renderOrder={1000}>
      <mesh
        position={[0, 0, 0]}
        onPointerDown={(e) => {
          down.current = [e.nativeEvent.clientX, e.nativeEvent.clientY];
        }}
        onPointerUp={(e) => {
          const d = down.current;
          down.current = null;
          if (!d) return;
          const dist = Math.hypot(e.nativeEvent.clientX - d[0], e.nativeEvent.clientY - d[1]);
          if (dist < 5) {
            e.stopPropagation();
            onPlace(e.point.x, e.point.y);
          }
        }}
      >
        <planeGeometry args={[6, 6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {/* 참조: 현재 구강/비강 경로선 */}
      <Line points={oralPts} color="#22d3ee" lineWidth={1.5} depthTest={false} />
      <Line points={nasalPts} color="#fb923c" lineWidth={1.5} depthTest={false} />
      {/* 편집 중 경로의 배치 점 + 선 */}
      {editArr.length >= 2 && (
        <Line
          points={editArr.map((p) => [p[0], p[1], 0.035] as [number, number, number])}
          color={editColor}
          lineWidth={2.5}
          depthTest={false}
        />
      )}
      {editArr.map((p, i) => (
        <mesh key={i} position={[p[0], p[1], 0.04]} renderOrder={1001}>
          <sphereGeometry args={[0.013, 12, 12]} />
          <meshBasicMaterial color={editColor} depthTest={false} />
        </mesh>
      ))}
      {/* 선택 음소의 협착점(자홍) */}
      {consPos && (
        <mesh position={consPos} renderOrder={1002}>
          <sphereGeometry args={[0.02, 16, 16]} />
          <meshBasicMaterial color="#e011a6" depthTest={false} />
        </mesh>
      )}
    </group>
  );
}

function RiggedModel({
  pose,
  jaw,
  fit,
  tfit,
  seq,
  lip,
  live,
  showArt,
  headOpacity,
  onIntrospect,
}: {
  pose: React.RefObject<Pose>;
  jaw: React.RefObject<Jaw>;
  fit: React.RefObject<LipFit>;
  tfit: React.RefObject<TongueFit>;
  seq: React.RefObject<Seq>;
  lip: React.RefObject<{ target: number; cur: number }>;
  live: React.RefObject<Pose>;
  showArt: React.RefObject<boolean>;
  headOpacity: React.RefObject<number>;
  onIntrospect: (found: Found[]) => void;
}) {
  const { scene } = useGLTF(MODEL_URL);
  const bases = useRef<Base[]>([]);

  useEffect(() => {
    const found: Found[] = [];
    bases.current = [];
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.morphTargetDictionary) {
        const posAttr = m.geometry.attributes.position as THREE.BufferAttribute;
        const mats = isLipMesh(m.name)
          ? Array.isArray(m.material)
            ? m.material
            : [m.material]
          : [];
        for (const mt of mats) mt.transparent = true;
        // Upper lip wins the depth test at the closure seam (negative polygon offset
        // biases it toward the camera) so it draws over the lower lip's overlap.
        if (m.name === "lips_upper") {
          for (const mt of mats) {
            const std = mt as THREE.Material;
            std.polygonOffset = true;
            std.polygonOffsetFactor = -4;
            std.polygonOffsetUnits = -4;
          }
        }
        const c = new THREE.Vector3();
        m.geometry.computeBoundingBox();
        m.geometry.boundingBox!.getCenter(c);
        bases.current.push({
          mesh: m,
          name: m.name,
          pos: m.position.clone(),
          quat: m.quaternion.clone(),
          baseVerts:
            isLipMesh(m.name) || m.name === "tongue"
              ? Float32Array.from(posAttr.array as ArrayLike<number>)
              : null,
          lipMats: mats,
          centroid: c,
        });
        found.push({ mesh: m.name, targets: Object.keys(m.morphTargetDictionary) });
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat && "roughness" in mat) {
          mat.side = THREE.DoubleSide;
          mat.roughness = 0.85;
          mat.metalness = 0;
          if (m.name === "head") {
            // The head texture (head_mask) is OPAQUE everywhere (all salmon)
            // EXCEPT the drawn tongue/lips, which are alpha=0. alphaTest turns
            // ONLY those into clean pixel-perfect HOLES (background shows, side
            // view = img01), while everything else — including the perimeter
            // RIM that forms the front "thickness" band — stays solid. The air
            // cavities are real geometry holes, so they stay open regardless.
            // Rendered FLAT (texture as emissive) so flat panels don't catch
            // extra light and show as silhouettes.
            mat.alphaTest = 0.5;
            mat.transparent = true; // 투명도 슬라이더용(opacity는 useFrame서 적용, alphaTest 구멍 유지)
            mat.depthWrite = true;
            mat.emissiveMap = mat.map;
            mat.emissive = new THREE.Color(0xffffff);
            mat.emissiveIntensity = 1;
            mat.color = new THREE.Color(0x000000);
          }
          mat.needsUpdate = true;
        }
      }
    });
    onIntrospect(found);
  }, [scene, onIntrospect]);

  const q = useRef(new THREE.Quaternion()).current;
  const v = useRef(new THREE.Vector3()).current;
  const pivot = useRef(new THREE.Vector3()).current;
  const eff = useRef<Pose>(fullPose({})).current;

  useFrame((_, dt) => {
    const j = jaw.current;
    const s = seq.current;
    const lp = lip.current;
    const f = fit.current;
    let lipTarget = lp.target;

    // 1) resolve effective pose from the gesture timeline (or static hold)
    if (s.active && s.segs.length) {
      s.elapsed += dt;
      while (s.i < s.segs.length && s.elapsed > s.segs[s.i].dur) {
        s.elapsed -= s.segs[s.i].dur;
        s.i++;
        if (s.i >= s.segs.length) {
          if (s.loop) {
            s.i = 0;
            s.start = s.segs[s.segs.length - 1].pose;
            s.startOp = s.segs[s.segs.length - 1].op;
          } else {
            // settle: hold the final segment statically
            const last = s.segs[s.segs.length - 1];
            pose.current = { ...last.pose };
            lp.target = last.op;
            s.active = false;
          }
        }
      }
      if (s.active) {
        const seg = s.segs[s.i];
        const from = s.i === 0 ? s.start : s.segs[s.i - 1].pose;
        const fromOp = s.i === 0 ? s.startOp : s.segs[s.i - 1].op;
        const raw = seg.dur > 0 ? s.elapsed / seg.dur : 1;
        const t = seg.ease === "out" ? easeOut01(raw) : smooth01(raw);
        const p = lerpPose(from, seg.pose, t);
        for (const m in p) eff[m] = p[m];
        lipTarget = lerp(fromOp, seg.op, t);
      } else {
        for (const m in pose.current) eff[m] = pose.current[m];
        lipTarget = lp.target;
      }
    } else {
      for (const m in pose.current) eff[m] = pose.current[m];
      lipTarget = lp.target;
    }
    for (const m in eff) live.current[m] = eff[m]; // snapshot for smooth interrupts

    // 2) lip opacity (smoothed)
    lp.cur += (lipTarget - lp.cur) * Math.min(1, dt * 8);

    // 3) jaw coupling values
    const jawW = eff["jaw_open"] ?? 0;
    // lower-lip drop is the rigger's `lips_jaw_open` morph, coupled to jaw opening.
    // Read the manual override from pose.current (the debug slider writes there) —
    // NOT from the persistent `eff` ref. `lips_jaw_open` is not in MORPHS, so it's
    // never reset by the per-frame pose loop; taking Math.max against the stale eff
    // value made it stick at its peak forever (mouth stayed open across phonemes
    // after any vowel). Recompute fresh each frame so it releases when the jaw shuts.
    const manualJawLip = pose.current["lips_jaw_open"] ?? 0;
    eff["lips_jaw_open"] = j.on
      ? Math.max(manualJawLip, jawW * j.lips)
      : manualJawLip;
    pivot.set(j.pivotX, j.pivotY, 0);
    const maxRad = THREE.MathUtils.degToRad(j.maxDeg) * jawW;

    for (const b of bases.current) {
      // show/hide the added 3D tongue & lips meshes (head section stays visible)
      if (b.name === "tongue" || isLipMesh(b.name)) {
        b.mesh.visible = showArt.current;
      }
      // 사지탈 플랜(head) 투명도 — 슬라이더로 조절.
      if (b.name === "head") {
        const hm = b.mesh.material as THREE.MeshStandardMaterial;
        if (hm && hm.opacity !== headOpacity.current) hm.opacity = headOpacity.current;
      }
      const dict = b.mesh.morphTargetDictionary;
      const inf = b.mesh.morphTargetInfluences;
      if (dict && inf) {
        for (const [name, idx] of Object.entries(dict)) {
          let val = eff[name] ?? 0;
          // ⚠️ inverted key: 개방(semantic 1)=적용 0. 닫힘은 완전 밀폐가 아니라 semantic을
          // VELUM_CLOSED_MIN(0.1)로 floor해 적용 (1-0.1)*VELUM_CLOSE=0.9 까지만 — "닫힘"의 재정의.
          if (name === "velum_open" && VELUM_INVERTED)
            val = (1 - Math.max(VELUM_CLOSED_MIN, val)) * VELUM_CLOSE;
          inf[idx] = val;
        }
      }

      if (b.name === "tongue" && b.baseVerts) {
        // Rest placement at the VERTEX level (scale about centroid + fwd/up
        // offset), so the resting tongue is tucked behind the teeth. BUT the
        // rigger calibrated the ANTERIOR raising morphs (tip→치조, front→경구개)
        // to reach their landmark from the NATIVE rest, so we fade the tuck back
        // toward native as one of those engages — at full weight the tip lands
        // on the ridge/palate, at rest it stays tucked. `tongue_back_up` (velar,
        // ㄱㄲㅋㅇ) is EXCLUDED: it only lifts the dorsum, and un-tucking for it
        // would push the tongue tip forward past the teeth (which should stay
        // put). Its own delta lifts the back on top of the tucked base.
        // v25 rework tongue is baked to display scale + native size, so NO dynamic
        // scaling/tuck (the old v1 tongue poked the teeth and needed shrink-at-rest
        // + restore-on-gesture, which made the tongue visibly grow/shrink as morphs
        // engaged). Apply only a static fwd/up placement offset; size is constant
        // and three.js adds the morph deltas on top.
        const tf = tfit.current;
        const base = b.baseVerts;
        const posAttr = b.mesh.geometry.attributes.position as THREE.BufferAttribute;
        const arr = posAttr.array as Float32Array;
        // ⚠️ tongue_back_up 모프가 three.js에서 1.0으로 하드클램프되어(외삽 안 됨) 아무리
        // 값을 키워도 혀 뒤(dorsum)가 (올라간) 연구개 면에 못 닿는다. 그래서 velar 자세에서는
        // 혀 뒤(로컬 -X)를 기하적으로 추가로 들어올려 연구개에 접촉시킨다. back_up>1의 초과분을
        // 신호로 사용(모음은 ≤0.6이라 리프트 0, ㄱㅋㄲ/ㅇ은 2.0으로 full 리프트). 접촉량은
        // VELAR_DORSUM_LIFT로 미세조정. (모프 자체는 여전히 1.0으로 dorsum 기본 형태를 만든다.)
        const backUp = eff["tongue_back_up"] ?? 0;
        // ⚠️ tongue_back_up 모프가 three.js에서 1.0으로 하드클램프되어(외삽 안 됨) 혀 뒤가 (올라간)
        // 연구개까지 못 닿는다 → back_up을 크게(2.0) 준 velar 자세에서만 혀 뒤(로컬 -X)를 기하적으로
        // 추가로 들어올려 접촉시킨다. ㄱ은 back_up 2.0(리프트 ON), ㅇ은 사용자 지정 0.71(<0.9라 리프트
        // OFF → 혀가 낮게 내려온 연구개에 맞춰 낮음). 모음(≤0.6)도 제외.
        // ⚠️ 예전엔 backUp>=0.9 ? 0.05 : 0 이진 게이트라, 애니메이션 중 back_up이 0.9를
        // 넘는 순간 리프트가 0→0.05로 툭 튀어 "뚝뚝 끊겨" 보였다. 0.75~1.0 구간에서 연속으로
        // 램프시켜 팝 제거(ㅇ 0.71·모음 ≤0.6은 여전히 0, ㄱ 1.0은 full).
        const dlift = Math.min(1, Math.max(0, (backUp - 0.75) / 0.25)) * 0.05;
        for (let i = 0; i < arr.length; i += 3) {
          const lx = base[i]; // 로컬 X: +전방(치조) / −후방(연구개쪽)
          const post = Math.min(1, Math.max(0, (-0.02 - lx) / 0.21));
          arr[i] = base[i] + tf.fwd;
          arr[i + 1] = base[i + 1] + tf.up + post * dlift;
          arr[i + 2] = base[i + 2];
        }
        posAttr.needsUpdate = true;
        b.mesh.scale.setScalar(1);
        // jaw-follow: rotate the whole tongue about the hinge (node level)
        if (j.on && j.tongue > 0 && maxRad !== 0) {
          q.setFromAxisAngle(Z, -maxRad * j.tongue);
          v.copy(b.pos).sub(pivot).applyQuaternion(q).add(pivot);
          b.mesh.position.copy(v);
          b.mesh.quaternion.copy(q).multiply(b.quat);
        } else {
          b.mesh.position.copy(b.pos);
          b.mesh.quaternion.copy(b.quat);
        }
      } else if (isLipMesh(b.name)) {
        for (const mt of b.lipMats) (mt as THREE.Material).opacity = lp.cur;
        // placement: forward/up offset + scale about the lip centroid
        const C = b.centroid;
        b.mesh.scale.setScalar(f.scale);
        b.mesh.position.set(
          C.x * (1 - f.scale) + f.fwd,
          C.y * (1 - f.scale) + f.up,
          C.z * (1 - f.scale),
        );
        // lower-lip drop on jaw open is now the rigger's `lips_jaw_open` morph
        // (driven above), so the old vertex-deform hack is gone.
      }
    }
  });

  return <primitive object={scene} />;
}

function Slider({
  label,
  min = 0,
  max = 1,
  step = 0.01,
  value,
  warn,
  onChange,
}: {
  label: string;
  min?: number;
  max?: number;
  step?: number;
  value: number;
  warn?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-slate-700">
      <span className={"w-40 truncate font-mono " + (warn ? "text-rose-600" : "")}>
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1"
      />
      <span className="w-12 text-right tabular-nums">{value.toFixed(3)}</span>
    </label>
  );
}

function Btn({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={
        "rounded-md px-2 py-1.5 text-sm font-medium transition " +
        (active
          ? "bg-slate-900 text-white"
          : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50")
      }
    >
      {children}
    </button>
  );
}

// dev=false(기본): 공개용 음소산출 — +Z 측면에서 시작, 디버그 컨트롤(혀·입술 표시,
//   공기 흐름, 기류 경로 편집, 입술·혀 맞춤, 턱 추종, 수동 모프, 타깃 검증 배지) 숨김.
// dev=true: 리거 검증용 — 위 컨트롤 전부 노출(/articulator-verify, 허브 미노출 라우트).
export default function RiggedViewer({ dev = false }: { dev?: boolean } = {}) {
  const pose = useRef<Pose>({ ...IDLE_POSE });
  const live = useRef<Pose>({ ...IDLE_POSE });
  const jaw = useRef<Jaw>({
    on: true,
    pivotX: -0.15,
    pivotY: 0.25,
    maxDeg: 18,
    tongue: 1.0,
    lips: 1.0,
  });
  // v2.5: rigger removed the head's original lips, so the temporary forward
  // offset that hid the z-fighting is no longer needed (default 0).
  const fit = useRef<LipFit>({ fwd: 0, up: 0, scale: 1.0 });
  // v17 restored v1's COMPLETE tongue primitive (indices+UV+normals+7 morphs).
  // Native rest pokes the tip past the front teeth, so we shrink slightly about
  // the centroid (scale 0.85, NO fwd offset). Shrinking pulls the tip back behind
  // the teeth while pulling the root FORWARD (away from the pharynx) — a back
  // offset would do the opposite and block the pharynx. Morph deltas are added
  // unscaled, so gestures still reach the ridge/velum.
  const tfit = useRef<TongueFit>({ fwd: 0, up: 0, scale: 1.0 });
  const seq = useRef<Seq>({
    segs: [],
    loop: false,
    start: ZERO,
    startOp: 1,
    i: 0,
    elapsed: 0,
    active: false,
  });
  const lip = useRef({ target: 1, cur: 1 });
  // show/hide the added 3D tongue & lips meshes. Default ON (they are the
  // articulators). Toggle OFF to verify the sagittal head section is clean
  // (the rigger's drawn tongue/lips were removed from the head texture).
  const showArt = useRef(true);
  const headOpacity = useRef(1); // 사지탈 플랜(head) 투명도
  // 기류(airflow) 표시 상태 + 현재 재생 음소의 조음방법/ id (경로·거동 결정).
  const air = useRef<AirState>({
    on: true,
    manner: "vowel",
    id: "",
    oralCurve: ORAL_CURVE,
    nasalCurve: NASAL_CURVE,
    constrictionById: { ...CONSTRICTION_BY_ID },
    oralPathById: { ...ORAL_CURVE_BY_ID },
    diphFrom: null,
    diphTo: null,
  });
  // 기류 경로 편집(클릭 배치)용 점 목록. 공유(oral/nasal) + 음소별(byId).
  const editPts = useRef<{ oral: [number, number][]; nasal: [number, number][] }>({
    oral: [],
    nasal: [],
  });
  const phonemePts = useRef<Record<string, [number, number][]>>({});

  const [pathEdit, setPathEdit] = useState(false);
  const [editTarget, setEditTarget] = useState<
    "oral" | "nasal" | "phonemePath" | "constriction"
  >("oral");
  const [editRev, setEditRev] = useState(0);
  const [coordsText, setCoordsText] = useState("");

  const [, force] = useState(0);
  const [found, setFound] = useState<Found[] | null>(null);
  const [sel, setSel] = useState<string>("idle");
  const [autoRotate, setAutoRotate] = useState(false);
  const [showJaw, setShowJaw] = useState(false);
  const [showFit, setShowFit] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [loopDiph, setLoopDiph] = useState(false);

  const j = jaw.current;
  const f = fit.current;
  const tf = tfit.current;

  const playSeq = (segs: Seg[], loop: boolean, op0: number) => {
    seq.current = {
      segs,
      loop,
      start: { ...live.current },
      startOp: lip.current.cur,
      i: 0,
      elapsed: 0,
      active: segs.length > 0,
    };
    lip.current.target = op0;
    force((n) => n + 1);
  };

  const idle = () => {
    seq.current.active = false;
    pose.current = { ...IDLE_POSE }; // rest: velum open
    lip.current.target = LIP_OPACITY.idle;
    setSel("idle");
    force((n) => n + 1);
  };

  // 편집 모드: 애니메이션 없이 음소 자세를 그대로 정지 → 혀·입술이 고정돼 경로를 정확히 클릭 가능.
  const holdStatic = (p: Pose, opacity: number) => {
    seq.current.active = false;
    pose.current = { ...fullPose(p) };
    live.current = { ...pose.current };
    lip.current.target = opacity;
    lip.current.cur = opacity;
    force((n) => n + 1);
  };

  const playConsonant = (id: string) => {
    const c = CONSONANTS.find((x) => x.id === id)!;
    air.current.manner = mannerOf(c.manner);
    air.current.id = c.id;
    air.current.diphFrom = air.current.diphTo = null;
    setSel(id);
    if (pathEdit) return holdStatic(c.pose, c.opacity); // 편집 중엔 정지 유지
    const g = consonantGesture(c);
    playSeq(g.segs, g.loop, c.opacity);
  };

  const playVowel = (id: string) => {
    const vw = VOWELS[id];
    air.current.manner = "vowel";
    air.current.id = id;
    air.current.diphFrom = air.current.diphTo = null;
    setSel(id);
    if (pathEdit) return holdStatic(vw.pose, vw.opacity);
    playSeq(
      [
        { pose: fullPose(vw.pose), op: vw.opacity, dur: 0.2 }, // move to vowel
        { pose: fullPose(vw.pose), op: vw.opacity, dur: 0.5 }, // hold the vowel
        { pose: IDLE_POSE, op: LIP_OPACITY.idle, dur: 0.35 }, // return to rest
      ],
      false,
      vw.opacity,
    );
  };

  const playDiphthong = (id: string) => {
    const d = DIPHTHONGS.find((x) => x.id === id)!;
    air.current.manner = "vowel";
    air.current.id = id;
    // 이중모음 기류: 시작 단모음 → 도착 단모음 경로로 보간(경로 없는 모음은 공유 폴백).
    air.current.diphFrom = air.current.oralPathById[d.from] ?? ORAL_CURVE;
    air.current.diphTo = air.current.oralPathById[d.to] ?? ORAL_CURVE;
    const a = VOWELS[d.from];
    const b = VOWELS[d.to];
    setSel(id);
    if (pathEdit) return holdStatic(b.pose, b.opacity); // 편집 중엔 핵모음 자세로 정지
    playSeq(
      [
        { pose: fullPose(a.pose), op: a.opacity, dur: 0.14 },
        { pose: fullPose(b.pose), op: b.opacity, dur: 0.5 },
        { pose: fullPose(b.pose), op: b.opacity, dur: 0.2 },
      ],
      loopDiph,
      a.opacity,
    );
  };

  const ddkSelected = () => {
    const c = CONSONANTS.find((x) => x.id === sel);
    if (!c) return;
    // tight closure↔gap loop; no return-to-rest so the velum doesn't flicker
    // open between repetitions of an oral stop (퍼터커 stays oral).
    const P = fullPose(c.pose);
    const gap = fullPose({ jaw_open: 0.1 });
    playSeq(
      [
        { pose: P, op: c.opacity, dur: 0.14 },
        { pose: gap, op: c.opacity, dur: 0.16 },
      ],
      true,
      c.opacity,
    );
  };

  const setMorph = (name: string, v: number) => {
    seq.current.active = false;
    pose.current = { ...pose.current, [name]: v };
    setSel("");
    force((n) => n + 1);
  };

  // ── 기류 경로 편집(클릭 배치) ──
  const rebuildCurve = (t: "oral" | "nasal") => {
    const arr = editPts.current[t];
    const curve =
      arr.length >= 2
        ? makeCurve(arr.map(([x, y]) => [x, y, 0] as [number, number, number]))
        : t === "oral"
          ? ORAL_CURVE
          : NASAL_CURVE;
    if (t === "oral") air.current.oralCurve = curve;
    else air.current.nasalCurve = curve;
  };
  const rebuildPhonemeCurve = (id: string) => {
    const arr = phonemePts.current[id] ?? [];
    if (arr.length >= 2)
      air.current.oralPathById[id] = makeCurve(arr.map(([x, y]) => [x, y, 0] as [number, number, number]));
    else delete air.current.oralPathById[id]; // 점 부족하면 공유 기본 경로로 폴백
  };
  // 선택 음소의 편집 대상 구강 곡선(음소별 있으면 그것, 없으면 공유).
  const phonemeCurveFor = (id: string) => air.current.oralPathById[id] ?? air.current.oralCurve;
  const refreshCoords = () => {
    const fmt = (a: [number, number][]) =>
      "[" + a.map(([x, y]) => `[${x.toFixed(3)}, ${y.toFixed(3)}, 0]`).join(", ") + "]";
    const cons = Object.entries(air.current.constrictionById)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    const perPh = Object.entries(phonemePts.current)
      .filter(([, a]) => a.length >= 2)
      .map(([k, a]) => `  ${k}: ${fmt(a)}`)
      .join("\n");
    const txt =
      `ORAL_PATH = ${fmt(editPts.current.oral)}\n\nNASAL_PATH = ${fmt(editPts.current.nasal)}` +
      `\n\n협착점 = { ${cons} }` +
      `\n\n음소별 경로 =\n${perPh}`;
    setCoordsText(txt);
    console.log("[airflow]\n" + txt);
  };
  // 곡선상 클릭점에 가장 가까운 u 찾기.
  const nearestU = (curve: THREE.CatmullRomCurve3, x: number, y: number) => {
    const pt = new THREE.Vector3();
    let bestU = 0;
    let bestD = Infinity;
    for (let k = 0; k <= 300; k++) {
      curve.getPointAt(k / 300, pt);
      const d = (pt.x - x) ** 2 + (pt.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        bestU = k / 300;
      }
    }
    return +bestU.toFixed(3);
  };
  const placePoint = (x: number, y: number) => {
    if (editTarget === "constriction") {
      if (!sel) return; // 선택 음소의 협착점: 그 음소 곡선상 가장 가까운 u.
      air.current.constrictionById[sel] = nearestU(phonemeCurveFor(sel), x, y);
    } else if (editTarget === "phonemePath") {
      if (!sel) return; // 선택 음소의 경로에 점 추가.
      (phonemePts.current[sel] ??= []).push([+x.toFixed(3), +y.toFixed(3)]);
      rebuildPhonemeCurve(sel);
    } else {
      editPts.current[editTarget].push([+x.toFixed(3), +y.toFixed(3)]);
      rebuildCurve(editTarget);
    }
    refreshCoords();
    setEditRev((n) => n + 1);
  };
  const undoPoint = () => {
    if (editTarget === "constriction") {
      if (sel) delete air.current.constrictionById[sel];
    } else if (editTarget === "phonemePath") {
      if (sel) {
        phonemePts.current[sel]?.pop();
        rebuildPhonemeCurve(sel);
      }
    } else {
      editPts.current[editTarget].pop();
      rebuildCurve(editTarget);
    }
    refreshCoords();
    setEditRev((n) => n + 1);
  };
  const clearPoints = () => {
    if (editTarget === "constriction") {
      if (sel) delete air.current.constrictionById[sel];
    } else if (editTarget === "phonemePath") {
      if (sel) {
        phonemePts.current[sel] = [];
        rebuildPhonemeCurve(sel);
      }
    } else {
      editPts.current[editTarget] = [];
      rebuildCurve(editTarget);
    }
    refreshCoords();
    setEditRev((n) => n + 1);
  };
  // 현재 기본 경로를 시작점으로 불러오기(그 위에서 수정).
  const loadDefaultPts = () => {
    editPts.current.oral = ORAL_PATH.map(([x, y]) => [x, y]);
    editPts.current.nasal = NASAL_PATH.map(([x, y]) => [x, y]);
    rebuildCurve("oral");
    rebuildCurve("nasal");
    refreshCoords();
    setEditRev((n) => n + 1);
  };
  const setJaw = (p: Partial<Jaw>) => {
    Object.assign(jaw.current, p);
    force((n) => n + 1);
  };
  const setFit = (p: Partial<LipFit>) => {
    Object.assign(fit.current, p);
    force((n) => n + 1);
  };
  const setTfit = (p: Partial<TongueFit>) => {
    Object.assign(tfit.current, p);
    force((n) => n + 1);
  };

  const allFoundNames = found?.flatMap((x) => x.targets) ?? [];
  const expectedFlat = Object.values(EXPECTED).flat();
  const missing = expectedFlat.filter((n) => !allFoundNames.includes(n));
  const extra = allFoundNames.filter((n) => !expectedFlat.includes(n));

  return (
    <div className="flex h-full min-h-[640px] w-full flex-col gap-3 lg:flex-row">
      <div
        className="relative h-[560px] flex-1 overflow-hidden rounded-2xl shadow-inner lg:h-auto"
        style={{
          background:
            "radial-gradient(circle at 50% 38%, #3b3540 0%, #211d26 55%, #14111a 100%)",
        }}
      >
        <Canvas
          camera={{
            position: (dev ? [2.4, 0, 0.5] : [0, 0, 3]) as [number, number, number],
            fov: 35,
            near: 0.01,
            far: 100,
          }}
          dpr={[1, 2]}
          gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
        >
          <ambientLight intensity={0.6} />
          <hemisphereLight args={["#fff1e8", "#2a2030", 0.5]} />
          <directionalLight position={[3, 4, 6]} intensity={1.2} color="#fff2e6" />
          <directionalLight position={[-4, 1.5, 3]} intensity={0.5} color="#cfe0ff" />
          <pointLight position={[2, 0, 4]} intensity={0.5} color="#ffd9c0" />

          <Suspense fallback={null}>
            {/* fit ONCE on load; NO `observe` — else every phoneme morph changes the
                bbox and re-fits, wiping the user's zoom/pan/rotate. */}
            <Bounds fit clip margin={1.15}>
              <RiggedModel
                pose={pose}
                jaw={jaw}
                fit={fit}
                tfit={tfit}
                seq={seq}
                lip={lip}
                live={live}
                showArt={showArt}
                headOpacity={headOpacity}
                onIntrospect={setFound}
              />
            </Bounds>
          </Suspense>

          {/* 기류 입자 — Bounds 밖(모델과 같은 월드좌표, 카메라만 모델에 맞춰짐). */}
          <Airflow seq={seq} air={air} />
          {pathEdit && (
            <PathEditor
              air={air}
              editPts={editPts}
              phonemePts={phonemePts}
              target={editTarget}
              sel={sel}
              onPlace={placePoint}
              rev={editRev}
            />
          )}

          <OrbitControls
            enablePan
            enableZoom
            enableRotate
            autoRotate={autoRotate}
            autoRotateSpeed={0.6}
            minDistance={0.5}
            maxDistance={20}
            makeDefault
          />
          <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
            <GizmoViewport
              axisColors={["#ef4444", "#22c55e", "#3b82f6"]}
              labelColor="#0f172a"
            />
          </GizmoHelper>
        </Canvas>

        <div className="pointer-events-none absolute left-4 top-4 rounded-md bg-white/70 px-3 py-2 text-xs text-slate-700 backdrop-blur">
          <div className="font-semibold">조음기관 음소 산출</div>
          <div>· 드래그: 회전 · 휠: 줌 · 우드래그: 이동</div>
        </div>
      </div>

      <div className="flex w-full max-w-md flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm lg:w-[24rem]">
        {dev && (
          <div className="rounded-lg bg-slate-50 p-2 text-xs">
            {found === null ? (
              <span className="text-slate-500">모델 로드 중…</span>
            ) : missing.length === 0 && extra.length === 0 ? (
              <span className="font-semibold text-emerald-600">
                ✓ head-rigged.glb · 13개 타깃 정상
              </span>
            ) : (
              <span className="text-rose-600">
                {missing.length > 0 && `누락: ${missing.join(", ")} `}
                {extra.length > 0 && `예상밖: ${extra.join(", ")}`}
              </span>
            )}
          </div>
        )}

        <div>
          <div className="mb-1 text-xs font-semibold text-slate-700">자음 (11그룹)</div>
          <div className="grid grid-cols-4 gap-1.5">
            {CONSONANTS.map((c) => (
              <Btn
                key={c.id}
                active={sel === c.id}
                onClick={() => playConsonant(c.id)}
                title={`${c.manner}${c.note ? " — " + c.note : ""}`}
              >
                {c.label}
              </Btn>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 text-xs font-semibold text-slate-700">단모음 (8)</div>
          <div className="grid grid-cols-8 gap-1.5">
            {Object.values(VOWELS).map((vw) => (
              <Btn
                key={vw.id}
                active={sel === vw.id}
                onClick={() => playVowel(vw.id)}
                title={vw.feature}
              >
                {vw.label}
              </Btn>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-700">
            <span>이중모음 (보간)</span>
            <label className="flex items-center gap-1 font-normal text-slate-500">
              <input
                type="checkbox"
                checked={loopDiph}
                onChange={(e) => setLoopDiph(e.target.checked)}
              />
              반복
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DIPHTHONGS.map((d) => (
              <Btn key={d.id} active={sel === d.id} onClick={() => playDiphthong(d.id)}>
                {d.label}
              </Btn>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={idle}
            className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          >
            휴지 (idle)
          </button>
          <button
            onClick={ddkSelected}
            className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700"
            title="선택한 자음을 반복 조음 (DDK)"
          >
            ▶ DDK 반복
          </button>
        </div>

        {dev && (
          <label className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={showArt.current}
              onChange={(e) => {
                showArt.current = e.target.checked;
                force((n) => n + 1);
              }}
            />
            3D 혀·입술 표시 <span className="text-xs text-slate-400">(끄면 단면만)</span>
          </label>
        )}

        <label className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <span className="whitespace-nowrap">사지탈 투명도</span>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            defaultValue={1}
            className="flex-1"
            onChange={(e) => {
              headOpacity.current = parseFloat(e.target.value);
            }}
          />
        </label>

        {dev && (
        <label className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <input
            type="checkbox"
            defaultChecked={air.current.on}
            onChange={(e) => {
              air.current.on = e.target.checked;
              force((n) => n + 1);
            }}
          />
          공기 흐름 표시{" "}
          <span className="text-xs text-slate-400">(구강=청록·비강=주황, 파열=버스트·마찰=난류)</span>
        </label>
        )}

        {/* 기류 경로 편집 — 빈 기도 공간을 클릭해 정확한 경로 배치 */}
        {dev && (
        <div className="rounded-lg bg-cyan-50 p-2">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={pathEdit}
              onChange={(e) => {
                setPathEdit(e.target.checked);
                if (e.target.checked && !coordsText) refreshCoords();
              }}
            />
            기류 경로 편집 (클릭 배치)
          </label>
          {pathEdit && (
            <div className="mt-2 flex flex-col gap-2">
              <div className="text-[11px] text-slate-500">
                {editTarget === "constriction"
                  ? "음소 선택 후, 경로 위에서 난류/버스트가 일어날 지점을 클릭(자홍 마커)."
                  : editTarget === "phonemePath"
                    ? "음소 선택 후, 그 음소의 기류 경로(혀 위 채널)를 성문→입 순서로 클릭해 그림(초록)."
                    : "시상면으로 맞춘 뒤, 성문→인두→(포트)→구강/비강 순서로 빈 공간을 클릭. 드래그는 회전."}
              </div>
              <div className="grid grid-cols-2 gap-1">
                {(["oral", "nasal", "phonemePath", "constriction"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setEditTarget(t)}
                    className={
                      "rounded px-2 py-1 text-xs font-medium " +
                      (editTarget === t
                        ? t === "oral"
                          ? "bg-cyan-500 text-white"
                          : t === "nasal"
                            ? "bg-orange-500 text-white"
                            : t === "phonemePath"
                              ? "bg-green-600 text-white"
                              : "bg-fuchsia-600 text-white"
                        : "bg-white text-slate-600 ring-1 ring-slate-200")
                    }
                  >
                    {t === "oral"
                      ? `구강공유 (${editPts.current.oral.length})`
                      : t === "nasal"
                        ? `비강공유 (${editPts.current.nasal.length})`
                        : t === "phonemePath"
                          ? "음소경로"
                          : "음소협착"}
                  </button>
                ))}
              </div>
              {(editTarget === "constriction" || editTarget === "phonemePath") && (
                <div className="rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
                  현재 음소: <b className="text-slate-800">{sel || "(없음 — 음소 버튼 클릭)"}</b>
                  {editTarget === "phonemePath" && sel && (
                    <span> · 경로점 {phonemePts.current[sel]?.length ?? 0}개</span>
                  )}
                  {editTarget === "constriction" && sel && air.current.constrictionById[sel] != null && (
                    <span> · 협착 u={air.current.constrictionById[sel]}</span>
                  )}
                </div>
              )}
              <div className="flex gap-1">
                <button onClick={undoPoint} className="flex-1 rounded bg-white px-2 py-1 text-xs ring-1 ring-slate-200">
                  실행취소
                </button>
                <button onClick={clearPoints} className="flex-1 rounded bg-white px-2 py-1 text-xs ring-1 ring-slate-200">
                  지우기
                </button>
                <button onClick={loadDefaultPts} className="flex-1 rounded bg-white px-2 py-1 text-xs ring-1 ring-slate-200">
                  기본불러오기
                </button>
              </div>
              <textarea
                readOnly
                value={coordsText}
                onFocus={(e) => e.target.select()}
                className="h-24 w-full resize-none rounded bg-white p-1.5 font-mono text-[10px] text-slate-700 ring-1 ring-slate-200"
                placeholder="배치한 점의 좌표가 여기 표시됩니다 (복사해서 전달)"
              />
            </div>
          )}
        </div>
        )}

        {/* lips placement (fix overlap with head's sagittal lips) */}
        {dev && (
        <div className="rounded-lg bg-sky-50 p-2">
          <button
            onClick={() => setShowFit((s) => !s)}
            className="flex w-full items-center justify-between text-xs font-semibold text-slate-700"
          >
            <span>입술·혀 맞춤 (겹침 해소)</span>
            <span className="text-slate-400">{showFit ? "▲" : "▼"}</span>
          </button>
          {showFit && (
            <div className="mt-2 flex flex-col gap-1.5">
              <div className="text-[11px] font-semibold text-slate-600">입술</div>
              <Slider label="앞으로(X)" min={-0.05} max={0.15} step={0.002} value={f.fwd} onChange={(v) => setFit({ fwd: v })} />
              <Slider label="상하(Y)" min={-0.08} max={0.08} step={0.002} value={f.up} onChange={(v) => setFit({ up: v })} />
              <Slider label="크기" min={0.7} max={1.4} step={0.01} value={f.scale} onChange={(v) => setFit({ scale: v })} />
              <div className="mt-1 text-[11px] font-semibold text-slate-600">혀 (치아 뒤로)</div>
              <Slider label="앞뒤(X)" min={-0.3} max={0.08} step={0.002} value={tf.fwd} onChange={(v) => setTfit({ fwd: v })} />
              <Slider label="상하(Y)" min={-0.12} max={0.12} step={0.002} value={tf.up} onChange={(v) => setTfit({ up: v })} />
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>크기</span>
                <span className="font-mono">1.000 (고정 · 네이티브)</span>
              </div>
              <p className="text-[11px] text-slate-500">
                새 입술·혀가 사지철 머리의 그려진 부위/치아와 겹치지 않게 맞춥니다.
                혀가 치아를 뚫으면 앞뒤(X)를 음수로 당겨 구강 안으로 넣으세요.
                완전한 해결은 리거가 머리 원본 입술·혀를 제거하는 것(요청서 v2.5).
              </p>
            </div>
          )}
        </div>
        )}

        {/* jaw tuning */}
        {dev && (
        <div className="rounded-lg bg-amber-50 p-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <input type="checkbox" checked={j.on} onChange={(e) => setJaw({ on: e.target.checked })} />
            턱 추종 (아랫입술·혀)
            <button
              onClick={() => setShowJaw((s) => !s)}
              className="ml-auto rounded bg-white px-1.5 py-0.5 text-[11px] font-normal text-slate-600 ring-1 ring-slate-200"
            >
              {showJaw ? "접기" : "튜닝"}
            </button>
          </label>
          {showJaw && (
            <div className="mt-2 flex flex-col gap-1.5">
              <Slider label="입술 추종 (jaw_open 모프)" value={j.lips} onChange={(v) => setJaw({ lips: v })} />
              <Slider label="혀 추종" value={j.tongue} onChange={(v) => setJaw({ tongue: v })} />
              <Slider label="개구 각도°" min={0} max={35} step={0.5} value={j.maxDeg} onChange={(v) => setJaw({ maxDeg: v })} />
              <Slider label="힌지 X" min={-0.5} max={0.3} step={0.005} value={j.pivotX} onChange={(v) => setJaw({ pivotX: v })} />
              <Slider label="힌지 Y" min={-0.2} max={0.6} step={0.005} value={j.pivotY} onChange={(v) => setJaw({ pivotY: v })} />
            </div>
          )}
        </div>
        )}

        {/* manual morph sliders */}
        {dev && (
        <div className="rounded-lg bg-slate-50 p-2">
          <button
            onClick={() => setShowManual((s) => !s)}
            className="flex w-full items-center justify-between text-xs font-semibold text-slate-700"
          >
            <span>수동 모프 (디버그)</span>
            <span className="text-slate-400">{showManual ? "▲" : "▼"}</span>
          </button>
          {showManual && found && (
            <div className="mt-2 flex flex-col gap-2">
              {found.map((ff) => (
                <div key={ff.mesh}>
                  <div className="text-[11px] font-medium text-slate-500">{ff.mesh}</div>
                  {ff.targets.map((name) => (
                    <Slider
                      key={name}
                      label={name}
                      warn={!expectedFlat.includes(name)}
                      value={pose.current[name] ?? 0}
                      onChange={(v) => setMorph(name, v)}
                    />
                  ))}
                </div>
              ))}
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" checked={autoRotate} onChange={(e) => setAutoRotate(e.target.checked)} />
                자동 회전
              </label>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}

useGLTF.preload(MODEL_URL);
