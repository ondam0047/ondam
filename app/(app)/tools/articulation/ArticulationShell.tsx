"use client";

// 바로조음(조음기관 3D) — 통합 셸. 세 도구를 한 진입점 안에서 탭으로 나눈다.
//  · 비교(CompareViewer): 목표↔실제 조음 자세 비교
//  · 훈련(ArticulationTrainer): 음운변동 대립쌍 + 오류→목표 3D 애니메이션
//  · 음소산출(RiggedViewer): head-rigged.glb로 한국어 자음·모음·이중모음 산출
// WebGL Canvas는 활성 탭 것만 마운트한다(비활성 탭은 언마운트 → GPU 절약).
// (바로일지 이식: 홈 링크/타이틀은 상위 ToolHeader가 담당하므로 여기선 탭+패널만.)

import dynamic from "next/dynamic";
import { useState } from "react";

const CompareViewer = dynamic(() => import("@/components/CompareViewer"), {
  ssr: false,
});
const ArticulationTrainer = dynamic(
  () => import("@/components/articulationTrainer/ArticulationTrainer"),
  { ssr: false },
);
const RiggedViewer = dynamic(() => import("@/components/RiggedViewer"), {
  ssr: false,
});

type TabId = "compare" | "train" | "produce";

const TABS: { id: TabId; label: string; sub: string; desc: string }[] = [
  {
    id: "compare",
    label: "비교",
    sub: "목표 vs 실제",
    desc: "아동이 산출한 음소의 조음 자세를 목표 음소와 나란히 비교합니다. 조음 자세 라이브러리를 재사용해 두 자세를 3D로 보여주고 조음 요소별 차이를 정리합니다.",
  },
  {
    id: "train",
    label: "훈련",
    sub: "음운변동 · 대립쌍",
    desc: "음운변동(마찰음 파열음화·연구개음 전방화·ㄹ 탄설/설측 등)별로 대립쌍 대조와 오류→목표 3D 애니메이션으로 조음위치를 가르칩니다. 임상가가 필요한 변동·대립쌍을 직접 만들어 쓸 수 있습니다.",
  },
  {
    id: "produce",
    label: "음소산출",
    sub: "자음·모음·이중모음",
    desc: "리거 납품 head-rigged.glb로 한국어 자음·모음·이중모음을 산출합니다. 음소→블렌드셰이프 매핑·이중모음 보간·입술 투명도·턱 추종을 웹 코드에서 처리합니다.",
  },
];

export default function ArticulationShell() {
  const [tab, setTab] = useState<TabId>("train");
  const active = TABS.find((t) => t.id === tab)!;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              "rounded-lg px-3 py-1.5 text-sm font-medium transition " +
              (tab === t.id
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100")
            }
          >
            {t.label}
            <span className="ml-1.5 hidden text-xs font-normal opacity-70 sm:inline">
              {t.sub}
            </span>
          </button>
        ))}
      </div>

      <p className="text-xs text-slate-500 sm:text-sm">{active.desc}</p>

      {tab === "compare" && <CompareViewer />}
      {tab === "train" && <ArticulationTrainer />}
      {tab === "produce" && <RiggedViewer />}
    </div>
  );
}
