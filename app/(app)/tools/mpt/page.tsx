import ToolHeader from "../ToolHeader";
import MptClient from "./MptClient";

export const dynamic = "force-dynamic";

export default function MptPage() {
  return (
    <>
      <ToolHeader
        title="MPT 측정"
        subtitle="숨을 들이쉰 뒤 “아—” 모음을 최대한 길게 내면, 소리가 유지되는 시간(최대발성지속시간)을 자동으로 측정해요. 보통 3회 측정해 가장 긴 값을 사용합니다."
      />
      <MptClient />
    </>
  );
}
