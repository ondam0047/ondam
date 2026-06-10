"use client";

import { useCallback, useEffect, useState } from "react";

type Child = { id: number; name: string; birthDate: string | null };
type SavedSession = {
  id: number;
  createdAt: string;
  note: string | null;
  metrics: Record<string, unknown>;
};

// 바로툴 모듈 공용 — 담당 대상자 선택 + 측정 결과 저장 + 최근 기록(추이).
// getMetrics: 현재 측정 요약을 저장용 객체로 반환(저장할 게 없으면 null).
// renderSummary: 저장된 한 세션의 metrics 를 한 줄 요약 문자열로.
export default function ToolMonitor({
  module,
  getMetrics,
  renderSummary,
}: {
  module: string;
  getMetrics: () => Record<string, number | string> | null;
  renderSummary: (m: Record<string, unknown>) => string;
}) {
  const [children, setChildren] = useState<Child[] | null>(null);
  const [childId, setChildId] = useState<number | null>(null);
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // 대상자 목록 1회 로드
  useEffect(() => {
    let alive = true;
    fetch("/api/tools/children")
      .then((r) => (r.ok ? r.json() : { children: [] }))
      .then((d) => { if (alive) setChildren(d.children ?? []); })
      .catch(() => { if (alive) setChildren([]); });
    return () => { alive = false; };
  }, []);

  const loadSessions = useCallback((cid: number) => {
    setLoadingList(true);
    fetch(`/api/tools/session?childId=${cid}&module=${encodeURIComponent(module)}`)
      .then((r) => (r.ok ? r.json() : { sessions: [] }))
      .then((d) => setSessions(d.sessions ?? []))
      .catch(() => setSessions([]))
      .finally(() => setLoadingList(false));
  }, [module]);

  useEffect(() => {
    if (childId != null) loadSessions(childId);
    else setSessions([]);
  }, [childId, loadSessions]);

  const save = useCallback(async () => {
    if (childId == null) { setMsg("먼저 대상자를 선택하세요."); return; }
    const metrics = getMetrics();
    if (!metrics) { setMsg("저장할 측정 결과가 없어요."); return; }
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch("/api/tools/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childId, module, metrics }),
      });
      if (!r.ok) throw new Error();
      setMsg("저장했어요.");
      loadSessions(childId);
      window.setTimeout(() => setMsg(null), 2000);
    } catch {
      setMsg("저장에 실패했어요. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }, [childId, getMetrics, module, loadSessions]);

  const remove = useCallback(async (id: number) => {
    await fetch(`/api/tools/session?id=${id}`, { method: "DELETE" }).catch(() => {});
    if (childId != null) loadSessions(childId);
  }, [childId, loadSessions]);

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear().toString().slice(2)}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <div className="card">
      <div className="card-body" style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>대상자 모니터링</h3>
          <span style={{ fontSize: 12, color: "var(--text-mute)" }}>측정 결과를 대상자별로 저장해 추이를 봐요</span>
        </div>

        {children === null ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-mute)" }}>대상자 목록 불러오는 중…</p>
        ) : children.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-mute)" }}>
            담당 대상자가 없어요. <b>내 아동</b>에서 먼저 대상자를 등록하세요.
          </p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <select
                value={childId ?? ""}
                onChange={(e) => setChildId(e.target.value ? Number(e.target.value) : null)}
                style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 14, color: "var(--text)", minWidth: 180 }}
              >
                <option value="">대상자 선택…</option>
                {children.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.birthDate ? ` (${c.birthDate})` : ""}</option>
                ))}
              </select>
              <button className="btn btn-primary" onClick={save} disabled={saving || childId == null}>
                {saving ? "저장 중…" : "이 대상자에 저장"}
              </button>
              {msg && <span style={{ fontSize: 13, color: "var(--primary)" }}>{msg}</span>}
            </div>

            {childId != null && (
              <div>
                <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 600, color: "var(--text-soft)" }}>
                  최근 기록 {sessions.length > 0 ? `(${sessions.length})` : ""}
                </p>
                {loadingList ? (
                  <p style={{ margin: 0, fontSize: 13, color: "var(--text-mute)" }}>불러오는 중…</p>
                ) : sessions.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13, color: "var(--text-mute)" }}>아직 저장된 기록이 없어요.</p>
                ) : (
                  <div style={{ display: "grid", gap: 6 }}>
                    {[...sessions].reverse().map((s) => (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", padding: "8px 12px" }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12, color: "var(--text-mute)", fontVariantNumeric: "tabular-nums" }}>{fmtDate(s.createdAt)}</span>
                          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{renderSummary(s.metrics)}</span>
                        </div>
                        <button onClick={() => remove(s.id)} style={{ background: "none", border: "none", fontSize: 12, color: "var(--text-mute)", cursor: "pointer" }}>삭제</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
