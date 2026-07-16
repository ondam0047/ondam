import ToolHeader from "../ToolHeader";
import ArticulationShell from "./ArticulationShell";

export const dynamic = "force-dynamic";

// 바로조음 — 조음기관 3D 학습 자료. 비교·훈련·음소산출 3탭.
// WebGL(three.js)은 클라이언트 전용이라 셸 내부에서 ssr:false 로 동적 로드.
export default function ArticulationPage() {
  return (
    <>
      <ToolHeader
        title="바로조음 · 조음기관 3D"
        subtitle="한국어 자음·모음의 조음 위치를 3D로 보여줍니다. ‘비교’는 목표와 실제 조음 자세를 나란히, ‘훈련’은 음운변동 대립쌍과 오류→목표 애니메이션으로, ‘음소산출’은 음소별 혀·입술·연구개 움직임과 기류를 보여줘요. 3D 화면은 마우스로 회전, 휠로 확대할 수 있어요."
      />
      <ArticulationShell />
    </>
  );
}
