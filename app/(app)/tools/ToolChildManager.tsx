"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ToolChild = { id: number; name: string; memo: string | null; createdAt: string };

export default function ToolChildManager() {
  const [children, setChildren] = useState<ToolChild[] | null>(null);
  const [newName, setNewName] = useState("");
  const [newMemo, setNewMemo] = useState("");
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/tool-children")
      .then((r) => (r.ok ? r.json() : { children: [] }))
      .then((d) => setChildren(d.children ?? []))
      .catch(() => setChildren([]));
  }, []);

  async function add() {
    if (!newName.trim()) { setErr("이름을 입력하세요."); return; }
    setAdding(true); setErr("");
    try {
      const r = await fetch("/api/tool-children", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), memo: newMemo.trim() || undefined }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error ?? "추가 실패"); return; }
      setChildren((prev) => [...(prev ?? []), d.child]);
      setNewName(""); setNewMemo(""); setShowForm(false);
    } catch { setErr("추가 중 오류가 발생했어요."); }
    finally { setAdding(false); }
  }

  async function remove(id: number, name: string) {
    if (!window.confirm(`'${name}' 대상자와 모든 측정 기록을 삭제할까요? 되돌릴 수 없어요.`)) return;
    await fetch(`/api/tool-children?id=${id}`, { method: "DELETE" }).catch(() => {});
    setChildren((prev) => (prev ?? []).filter((c) => c.id !== id));
  }

  return (
    <section style={{ marginTop: 40, paddingTop: 32, borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>바로툴 대상자</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--text-mute)" }}>
            내 아동과 별개로 관리하는 개인 명단 — 바로툴 모니터링에 사용해요
          </p>
        </div>
        <button
          className="btn btn-ghost"
          style={{ fontSize: 13, padding: "6px 14px" }}
          onClick={() => { setShowForm((v) => !v); setErr(""); }}
        >
          {showForm ? "취소" : "+ 추가"}
        </button>
      </div>

      {showForm && (
        <div style={{ marginBottom: 14, padding: "14px 16px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div className="field" style={{ flex: "1 1 160px", margin: 0 }}>
              <label className="label" style={{ fontSize: 11 }}>이름 *</label>
              <input
                className="input"
                placeholder="홍길동"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
                style={{ fontSize: 13 }}
              />
            </div>
            <div className="field" style={{ flex: "2 1 220px", margin: 0 }}>
              <label className="label" style={{ fontSize: 11 }}>메모 (선택)</label>
              <input
                className="input"
                placeholder="생년월일, 진단명 등"
                value={newMemo}
                onChange={(e) => setNewMemo(e.target.value)}
                style={{ fontSize: 13 }}
              />
            </div>
          </div>
          {err && <p style={{ margin: 0, fontSize: 12, color: "var(--error)" }}>{err}</p>}
          <div>
            <button className="btn btn-primary" onClick={add} disabled={adding} style={{ fontSize: 13 }}>
              {adding ? "추가 중…" : "추가"}
            </button>
          </div>
        </div>
      )}

      {children === null ? (
        <p style={{ fontSize: 13, color: "var(--text-mute)" }}>불러오는 중…</p>
      ) : children.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-mute)" }}>
          아직 추가된 대상자가 없어요.{" "}
          <button
            onClick={() => setShowForm(true)}
            style={{ background: "none", border: "none", color: "var(--primary)", cursor: "pointer", fontSize: 13, padding: 0 }}
          >
            + 추가
          </button>
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
          {children.map((c) => (
            <div key={c.id} style={{
              padding: "12px 14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)",
              display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link
                  href={`/monitor/${c.id}`}
                  style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", textDecoration: "none", display: "block" }}
                >
                  {c.name}
                  <span style={{ marginLeft: 5, fontSize: 11, color: "var(--primary)", fontWeight: 400 }}>→ 모니터링</span>
                </Link>
                {c.memo && (
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-mute)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.memo}
                  </p>
                )}
              </div>
              <button
                onClick={() => remove(c.id, c.name)}
                style={{ background: "none", border: "none", fontSize: 12, color: "var(--text-mute)", cursor: "pointer", flexShrink: 0, padding: 0 }}
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
