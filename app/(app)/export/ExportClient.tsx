"use client";

import { useMemo, useState } from "react";

type Item = { childServiceId: number; name: string; serviceType: string };
type MonthGroup = { ym: string; year: number; month: number; items: Item[] };
type Kind = "schedule" | "record";

export default function ExportClient({
  scheduleMonths,
  recordMonths,
}: {
  scheduleMonths: MonthGroup[];
  recordMonths: MonthGroup[];
}) {
  const [kind, setKind] = useState<Kind>("schedule");
  const months = kind === "schedule" ? scheduleMonths : recordMonths;

  const [ym, setYm] = useState<string>(months[0]?.ym ?? "");
  const group = useMemo(() => months.find((m) => m.ym === ym) ?? months[0], [months, ym]);

  // 선택된 childServiceId 집합. 월/종류 바뀌면 초기화 위해 key 로 관리.
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [downloading, setDownloading] = useState(false);

  // 종류 전환 시 그 종류의 첫 달로 리셋
  function switchKind(k: Kind) {
    setKind(k);
    const first = (k === "schedule" ? scheduleMonths : recordMonths)[0]?.ym ?? "";
    setYm(first);
    setSelected(new Set());
  }
  function switchMonth(v: string) {
    setYm(v);
    setSelected(new Set());
  }

  const allIds = group?.items.map((it) => it.childServiceId) ?? [];
  const allChecked = allIds.length > 0 && allIds.every((id) => selected.has(id));

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(allIds));
  }

  async function download() {
    if (!group || selected.size === 0) return;
    setDownloading(true);
    try {
      const ids = [...selected].join(",");
      const base = kind === "schedule" ? "/api/schedule/hwpx-bulk" : "/api/record/hwpx-bulk";
      const url = `${base}?year=${group.year}&month=${group.month}&ids=${ids}`;
      const res = await fetch(url);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        alert("다운로드 실패: " + (e.error ?? res.status));
        return;
      }
      const blob = await res.blob();
      const isZip = blob.type === "application/zip";
      const label = kind === "schedule" ? "일정표" : "기록지";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${group.year}년${String(group.month).padStart(2, "0")}월_${label}_모음.${isZip ? "zip" : "hwpx"}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <div className="section-head">
        <div>
          <h2>한꺼번에 다운로드</h2>
          <p>월과 아동을 골라 저장된 일정표·기록지를 한 번에 받습니다.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          {/* 종류 선택 */}
          <div className="field" style={{ marginBottom: 14 }}>
            <label>무엇을 받을까요?</label>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className={"btn " + (kind === "schedule" ? "btn-primary" : "btn-ghost")}
                onClick={() => switchKind("schedule")}
              >일정표</button>
              <button
                type="button"
                className={"btn " + (kind === "record" ? "btn-primary" : "btn-ghost")}
                onClick={() => switchKind("record")}
              >기록지</button>
            </div>
          </div>

          {months.length === 0 ? (
            <div className="tip">
              아직 저장된 {kind === "schedule" ? "일정표" : "기록지"}가 없어요.
              먼저 {kind === "schedule" ? "일정표를 만들고 저장" : "기록지를 작성하고 저장"}하세요.
            </div>
          ) : (
            <>
              {/* 월 선택 */}
              <div className="field" style={{ marginBottom: 14, maxWidth: 280 }}>
                <label>월 선택</label>
                <select className="select" value={ym} onChange={(e) => switchMonth(e.target.value)}>
                  {months.map((m) => (
                    <option key={m.ym} value={m.ym}>
                      {m.year}년 {m.month}월 ({m.items.length}명)
                    </option>
                  ))}
                </select>
              </div>

              {/* 아동 선택 */}
              <div className="field">
                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>아동 선택 <span className="sub-mute">({selected.size}/{allIds.length}명)</span></span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={toggleAll}>
                    {allChecked ? "전체 해제" : "전체 선택"}
                  </button>
                </label>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                  gap: 8,
                  marginTop: 6,
                }}>
                  {group?.items.map((it) => {
                    const on = selected.has(it.childServiceId);
                    return (
                      <label
                        key={it.childServiceId}
                        className="modal-check"
                        style={{
                          padding: "10px 12px",
                          background: on ? "var(--primary-soft)" : "var(--surface-2)",
                          border: "1px solid " + (on ? "var(--primary)" : "var(--border)"),
                          borderRadius: "var(--r-sm)",
                          cursor: "pointer",
                        }}
                      >
                        <input type="checkbox" checked={on} onChange={() => toggle(it.childServiceId)} />
                        <span style={{ fontWeight: 600 }}>{it.name}</span>
                        <span className="sub-mute" style={{ fontSize: 11.5, marginLeft: 4 }}>{it.serviceType}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="divider" />

              <button
                className="btn btn-primary"
                onClick={download}
                disabled={downloading || selected.size === 0}
              >
                {downloading
                  ? "생성 중..."
                  : `선택한 ${selected.size}명 ${kind === "schedule" ? "일정표" : "기록지"} 다운로드`}
              </button>
              {selected.size === 0 && (
                <span className="sub-mute" style={{ marginLeft: 10, fontSize: 12.5 }}>
                  받을 아동을 한 명 이상 선택하세요.
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
