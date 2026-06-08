"use client";

// 기록지 서식 선택. select 의 name="recordForm" 은 폼 저장(updateCenter)에 그대로 반영된다.
// (미리보기 이미지는 양식 정리 후 다시 추가 예정 — 빈 양식·다페이지)

import { RECORD_FORMS } from "@/lib/record-forms";

export default function RecordFormField({ defaultValue }: { defaultValue: string }) {
  return (
    <div className="field">
      <label>기록지 서식</label>
      <select className="select" name="recordForm" defaultValue={defaultValue || "standard"}>
        {RECORD_FORMS.map((f) => (
          <option key={f.key} value={f.key}>{f.label}</option>
        ))}
      </select>
      <div className="sub-mute" style={{ fontSize: 11, marginTop: 4 }}>
        지역마다 양식이 달라요. 우리 지역 양식을 고르면 기록지를 그 서식으로 받아요.
      </div>
    </div>
  );
}
