import FormMapperClient from "./FormMapperClient";

export const dynamic = "force-dynamic";

export default function FormsPage() {
  return (
    <>
      <div className="section-head">
        <div>
          <h2>기록지 양식 매핑 (실험)</h2>
          <p>센터 기록지(.hwpx)를 올리면 자동으로 칸을 인식해요. 샘플로 채워보고 맞는지 먼저 확인하세요.</p>
        </div>
      </div>
      <FormMapperClient />
    </>
  );
}
