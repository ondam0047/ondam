import ToolHeader from "../ToolHeader";
import PacingClient from "./PacingClient";

export const dynamic = "force-dynamic";

export default function PacingPage() {
  return (
    <>
      <ToolHeader
        title="말속도 조절 연습"
        subtitle="시각·청각·혼합 단서로 목표 말속도에 맞춰 끊어 읽기 연습을 해요."
      />
      <PacingClient />
    </>
  );
}
