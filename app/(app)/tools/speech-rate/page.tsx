import ToolHeader from "../ToolHeader";
import SpeechRateClient from "./SpeechRateClient";

export const dynamic = "force-dynamic";

export default function SpeechRatePage() {
  return (
    <>
      <ToolHeader
        title="말속도 측정"
        subtitle="한 번 녹음하거나 녹음 파일을 올리면 전체속도·조음속도·쉼 구간을 함께 보여줍니다. 쉼은 자동으로 분할되고, 실시간 녹음 시 음성 인식으로 음절 수까지 자동 산출합니다."
      />
      <SpeechRateClient />
    </>
  );
}
