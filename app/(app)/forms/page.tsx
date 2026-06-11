import FormMapperClient from "./FormMapperClient";

export const dynamic = "force-dynamic";

export default function FormsPage() {
  return (
    <>
      <div className="section-head">
        <div>
          <h2>우리 센터 기록지·일정표 양식 저장</h2>
          <p>우리 센터 기록지·일정표(.hwpx)를 올리면 자동으로 칸을 인식해요. 샘플로 채워보고 맞는지 확인한 뒤 저장하면, 일정표·기록지 출력과 일괄 다운로드에 그 양식이 쓰입니다.</p>
        </div>
      </div>
      <FormMapperClient />
    </>
  );
}
