"use client";

// 기록지 서식 선택 + 미리보기.
// 선택을 바꾸면 해당 양식의 미리보기 이미지(.hwpx 내장 썸네일에서 추출, public/forms/)가 즉시 바뀐다.
// select 의 name="recordForm" 은 그대로라 폼 저장(updateCenter)에 정상 반영된다.

import { useState } from "react";
import { RECORD_FORMS } from "@/lib/record-forms";

export default function RecordFormField({ defaultValue }: { defaultValue: string }) {
  const [form, setForm] = useState(defaultValue || "standard");
  const [zoom, setZoom] = useState(false);
  const label = RECORD_FORMS.find((f) => f.key === form)?.label ?? form;

  return (
    <div className="field">
      <label>기록지 서식</label>
      <select
        className="select"
        name="recordForm"
        value={form}
        onChange={(e) => setForm(e.target.value)}
      >
        {RECORD_FORMS.map((f) => (
          <option key={f.key} value={f.key}>{f.label}</option>
        ))}
      </select>
      <div className="sub-mute" style={{ fontSize: 11, marginTop: 4 }}>
        지역마다 양식이 달라요. 우리 지역 양식을 고르면 기록지를 그 서식으로 받아요.
      </div>

      {/* 미리보기 */}
      <div style={{ marginTop: 10 }}>
        <div className="sub-mute" style={{ fontSize: 11, marginBottom: 6 }}>
          미리보기 · {label} <span style={{ opacity: 0.7 }}>(클릭하면 크게)</span>
        </div>
        <button
          type="button"
          onClick={() => setZoom(true)}
          style={{
            display: "block", padding: 0, border: "1px solid var(--border)",
            borderRadius: 8, overflow: "hidden", cursor: "zoom-in",
            background: "#fff", lineHeight: 0, width: "100%", maxWidth: 280,
          }}
        >
          <img
            src={`/forms/preview-${form}.png`}
            alt={`${label} 기록지 미리보기`}
            style={{ width: "100%", height: "auto", display: "block" }}
          />
        </button>
      </div>

      {zoom && (
        <div
          onClick={() => setZoom(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,.72)",
            display: "grid", placeItems: "center", zIndex: 1000,
            cursor: "zoom-out", padding: 20,
          }}
        >
          <img
            src={`/forms/preview-${form}.png`}
            alt={`${label} 기록지 미리보기(확대)`}
            style={{
              maxWidth: "min(820px, 95vw)", maxHeight: "92vh",
              width: "auto", height: "auto", borderRadius: 8,
              background: "#fff", boxShadow: "0 20px 60px rgba(0,0,0,.5)",
            }}
          />
        </div>
      )}
    </div>
  );
}
