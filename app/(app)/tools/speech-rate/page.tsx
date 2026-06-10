import ToolHeader from "../ToolHeader";
import SpeechRateClient from "./SpeechRateClient";

export const dynamic = "force-dynamic";

export default function SpeechRatePage() {
  return (
    <>
      <ToolHeader
        title="말속도 측정"
        subtitle="아래 문장을 녹음하며 읽으면 초당 음절수(SPS)로 말속도를 측정하고, 목표 속도와 비교해 알려줘요."
      />
      <SpeechRateClient />
    </>
  );
}
