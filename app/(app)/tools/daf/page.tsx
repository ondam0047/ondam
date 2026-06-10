import ToolHeader from "../ToolHeader";
import DafClient from "./DafClient";

export const dynamic = "force-dynamic";

export default function DafPage() {
  return (
    <>
      <ToolHeader
        title="DAF 훈련 보조"
        subtitle="자기 목소리를 약간 늦게(지연 청각 피드백) 들려주는 도구예요. 천천히·또박또박 말하는 연습을 보조합니다. 반드시 이어폰·헤드셋을 착용하세요."
      />
      <DafClient />
    </>
  );
}
