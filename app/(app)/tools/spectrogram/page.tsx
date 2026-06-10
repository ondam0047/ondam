import ToolHeader from "../ToolHeader";
import SpectrogramClient from "./SpectrogramClient";

export const dynamic = "force-dynamic";

export default function SpectrogramPage() {
  return (
    <>
      <ToolHeader
        title="/s/ 스펙트로그램"
        subtitle="마이크 소리의 주파수 성분을 실시간 스펙트로그램으로 보여줘요. /s/ 같은 마찰음은 높은 주파수(4–8kHz)에 에너지가 모여, 소리를 눈으로 구분하는 학습에 활용할 수 있어요."
      />
      <SpectrogramClient />
    </>
  );
}
