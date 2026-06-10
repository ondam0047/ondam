import ToolHeader from "../ToolHeader";
import FluencyClient from "./FluencyClient";

export const dynamic = "force-dynamic";

export default function FluencyPage() {
  return (
    <>
      <ToolHeader
        title="유창성 자가 모니터링"
        subtitle="말을 녹음하면 전사(말한 내용)를 받아 적고, 간투사·반복·수정 같은 말 흐름 패턴을 직접 표시해 빈도와 비율을 스스로 점검할 수 있어요."
      />
      <FluencyClient />
    </>
  );
}
