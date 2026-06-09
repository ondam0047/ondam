"use client";

// 기록지 서식 선택 + 미리보기(빈 양식).
// 선택을 바꾸면 해당 양식의 미리보기 이미지(페이지별)가 즉시 바뀐다. 클릭하면 확대.
// 이미지는 public/forms/preview-{key}-{page}.png (한컴에서 정리한 빈 양식 → PDF → PNG).
// select 의 name="recordForm" 은 그대로라 폼 저장(updateCenter)에 정상 반영된다.

import { useState } from "react";
import { RECORD_FORMS } from "@/lib/record-forms";

// 양식별 페이지 수
const PAGES: Record<string, number> = {
  standard: 1, dongtan: 1, namyangju: 1,
};

export default function RecordFormField({ defaultValue }: { defaultValue: string }) {
  // 삭제된 양식(구버전 선택값)은 표준(서식A)으로 폴백
  const initial = RECORD_FORMS.some((f) => f.key === defaultValue) ? defaultValue : "standard";
  const [form, setForm] = useState(initial);
  const [zoom, setZoom] = useState<string | null>(null);
  const label = RECORD_FORMS.find((f) => f.key === form)?.label ?? form;
  const pages = PAGES[form] ?? 1;
  const pageList = Array.from({ length: pages }, (_, i) => i + 1);

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

      {/* 미리보기 (페이지별) */}
      <div style={{ marginTop: 10 }}>
        <div className="sub-mute" style={{ fontSize: 11, marginBottom: 6 }}>
          미리보기 · {label}{pages > 1 ? ` · ${pages}페이지` : ""}{" "}
          <span style={{ opacity: 0.7 }}>(클릭하면 크게)</span>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {pageList.map((pg) => {
            const src = `/forms/preview-${form}-${pg}.png`;
            return (
              <button
                key={pg}
                type="button"
                onClick={() => setZoom(src)}
                title={pages > 1 ? `${pg}페이지` : undefined}
                style={{
                  position: "relative", display: "block", padding: 0,
                  border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden",
                  cursor: "zoom-in", background: "#fff", lineHeight: 0,
                  width: "100%", maxWidth: 230,
                }}
              >
                <img
                  src={src}
                  alt={`${label} 기록지 미리보기${pages > 1 ? ` ${pg}페이지` : ""}`}
                  style={{ width: "100%", height: "auto", display: "block" }}
                />
                {pages > 1 && (
                  <span style={{
                    position: "absolute", left: 6, top: 6,
                    background: "rgba(0,0,0,.6)", color: "#fff",
                    fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
                  }}>{pg}p</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {zoom && (
        <div
          onClick={() => setZoom(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,.72)",
            display: "grid", placeItems: "center", zIndex: 1000,
            cursor: "zoom-out", padding: 20,
          }}
        >
          <img
            src={zoom}
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
