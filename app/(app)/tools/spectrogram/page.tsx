import ToolHeader from "../ToolHeader";
import SpectrogramClient from "./SpectrogramClient";

export const dynamic = "force-dynamic";

export default function SpectrogramPage() {
  return (
    <>
      <ToolHeader
        title="/s/ 스펙트로그램"
        subtitle="마찰음을 길게 내면 스펙트럼 중심(centroid) 주파수를 실시간으로 잡아 /s/·/ɕ/·/ʃ/ 구간 게이지에 표시해요. 중심이 높을수록 표준 /s/에 가깝습니다. 누적 분포·체류율로 조음 학습을 도와요."
      />
      <SpectrogramClient />
    </>
  );
}
