import ToolHeader from "../ToolHeader";
import PacingClient from "./PacingClient";

export const dynamic = "force-dynamic";

export default function PacingPage() {
  return (
    <>
      <ToolHeader
        title="말속도 조절 연습"
        subtitle="연습 문장을 어절 단위로 끊어, 목표 속도에 맞춰 청각 신호와 진행 막대로 안내해요. 천천히·또박또박 말하는 연습에 활용하세요."
      />
      <PacingClient />
    </>
  );
}
