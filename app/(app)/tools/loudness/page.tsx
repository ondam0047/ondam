import ToolHeader from "../ToolHeader";
import LoudnessClient from "./LoudnessClient";

export const dynamic = "force-dynamic";

export default function LoudnessPage() {
  return (
    <>
      <ToolHeader
        title="실시간 음도·강도 시각화"
        subtitle="마이크로 들어오는 목소리의 높낮이(음도)와 크기(강도)를 실시간으로 보여줘요. 대상자에게 시각적 피드백을 줄 때 활용하세요."
      />
      <LoudnessClient />
    </>
  );
}
