import ToolHeader from "../ToolHeader";
import LoudnessClient from "./LoudnessClient";

export const dynamic = "force-dynamic";

export default function LoudnessPage() {
  return (
    <>
      <ToolHeader
        title="실시간 음도·강도"
        subtitle="마이크에 발성하거나 녹음 파일을 올리면 기본주파수(F0)와 음성강도(dB)가 두 시계열 그래프에 동시에 표시돼요. 그래프의 가로 막대를 끌어 목표 음역대·강도 구간을 정하고, 그 안에 머문 비율을 확인할 수 있어요."
      />
      <LoudnessClient />
    </>
  );
}
