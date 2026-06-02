"use client";

import { useMemo, useState } from "react";

// 회기 시간대를 직접 타이핑하지 않고 시작·종료 시각을 골라 칩으로 추가.
// 저장 형식은 기존과 동일한 콤마 문자열("HH:MM~HH:MM, ...") — 숨은 input 으로 제출.
function parse(initial: string): string[] {
  return initial
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export default function SlotsEditor({ initial }: { initial: string }) {
  const [slots, setSlots] = useState<string[]>(() => parse(initial));
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [err, setErr] = useState("");

  const sorted = useMemo(
    () => [...slots].sort((a, b) => toMinutes(a.split("~")[0]) - toMinutes(b.split("~")[0])),
    [slots],
  );

  function add() {
    setErr("");
    if (!start || !end) {
      setErr("시작·종료 시각을 모두 골라주세요.");
      return;
    }
    if (toMinutes(end) <= toMinutes(start)) {
      setErr("종료 시각이 시작보다 늦어야 해요.");
      return;
    }
    const slot = `${start}~${end}`;
    if (slots.includes(slot)) {
      setErr("이미 추가된 시간대예요.");
      return;
    }
    setSlots((prev) => [...prev, slot]);
    setEnd("");
  }

  function remove(slot: string) {
    setSlots((prev) => prev.filter((s) => s !== slot));
  }

  return (
    <div>
      <input type="hidden" name="slots" value={sorted.join(",")} />

      <div style={{ display: "flex", alignItems: "end", gap: 8, flexWrap: "wrap" }}>
        <div className="field" style={{ margin: 0 }}>
          <label style={{ fontSize: 12 }}>시작</label>
          <input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} style={{ width: 130 }} />
        </div>
        <span style={{ paddingBottom: 10 }}>~</span>
        <div className="field" style={{ margin: 0 }}>
          <label style={{ fontSize: 12 }}>종료</label>
          <input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} style={{ width: 130 }} />
        </div>
        <button type="button" className="btn btn-ghost" onClick={add} style={{ marginBottom: 1 }}>
          + 추가
        </button>
      </div>

      {err && <div className="flash warn" style={{ marginTop: 10 }}>{err}</div>}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
        {sorted.length === 0 && (
          <span className="sub-mute" style={{ fontSize: 13 }}>아직 추가된 시간대가 없어요. 위에서 시작·종료를 골라 추가하세요.</span>
        )}
        {sorted.map((s) => (
          <span
            key={s}
            className="badge badge-primary"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, padding: "6px 10px" }}
          >
            {s}
            <button
              type="button"
              onClick={() => remove(s)}
              aria-label={`${s} 삭제`}
              style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: 15, lineHeight: 1, padding: 0 }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
