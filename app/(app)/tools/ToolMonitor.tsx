"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { trendSvg } from "@/lib/voice/report";

type Child = { id: number; name: string; birthDate: string | null };
type SavedSession = {
  id: number;
  createdAt: string;
  note: string | null;
  metrics: Record<string, unknown>;
};
type Series = { key: string; label: string; unit?: string; color?: string; categories?: string[] };

// 바로툴 모듈 공용 — 담당 대상자 선택 + 측정 결과 저장 + 최근 기록 + 추이 그래프.
export default function ToolMonitor({
  module,
  getMetrics,
  renderSummary,
  renderRowChart,
  trend,
  onContext,
}: {
  module: string;
  getMetrics: () => Record<string, number | string> | null;
  renderSummary: (m: Record<string, unknown>) => string;
  renderRowChart?: (m: Record<string, unknown>) => ReactNode;
  trend?: Series;
  onContext?: (ctx: { subject: string | null; clinician: string; chartSvg: string }) => void;
}) {
  const [children, setChildren] = useState<Child[] | null>(null);
  const [therapist, setTherapist] = useState("");
  const [childId, setChildId] = useState<number | null>(null);
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/tools/children")
      .then((r) => (r.ok ? r.json() : { children: [] }))
      .then((d) => {
        if (!alive) return;
        setChildren(d.children ?? []);
        setTherapist(d.therapist ?? "");
      })
      .catch(() => { if (alive) setChildren([]); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // 선택 대상자·치료사·최근5회 그래프 SVG 를 모듈(리포트)로 전달
  useEffect(() => {
    const name = children?.find((c) => c.id === childId)?.name ?? null;
    let chartSvg = "";
    if (trend && childId != null && sessions.length >= 2) {
      const points = sessions.map((s) => ({ t: s.createdAt, v: Number(s.metrics[trend.key]) }));
      chartSvg = trendSvg(points, trend);
    }
    onContext?.({ subject: name, clinician: therapist, chartSvg });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId, sessions, therapist, children]);

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
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
                {/* 추이 그래프 */}
                {trend && <TrendChart sessions={sessions} series={trend} fmtDate={fmtDate} />}

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
                      <div key={s.id} style={{ display: "grid", gap: 6, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", padding: "8px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 12, color: "var(--text-mute)", fontVariantNumeric: "tabular-nums" }}>{fmtDate(s.createdAt)}</span>
                            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{renderSummary(s.metrics)}</span>
                          </div>
                          <button onClick={() => remove(s.id)} style={{ background: "none", border: "none", fontSize: 12, color: "var(--text-mute)", cursor: "pointer", flexShrink: 0 }}>삭제</button>
                        </div>
                        {renderRowChart && renderRowChart(s.metrics)}
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

// 저장된 세션의 한 지표를 시간순 선그래프로. (날짜 점 hover → 수치 툴팁)
function TrendChart({
  sessions,
  series,
  fmtDate,
}: {
  sessions: SavedSession[];
  series: Series;
  fmtDate: (iso: string) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const pts = sessions
    .map((s) => ({ t: s.createdAt, v: Number(s.metrics[series.key]) }))
    .filter((p) => isFinite(p.v));
  if (pts.length < 2) return null;

  const cats = series.categories;
  const W = 600;
  const H = 130;
  const PAD = { top: 16, right: 16, bottom: 26, left: cats ? 64 : 44 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const color = series.color ?? "var(--primary)";

  let min: number, max: number;
  if (cats && cats.length > 0) {
    min = 0.5; max = cats.length + 0.5;
  } else {
    const vals = pts.map((p) => p.v);
    min = Math.min(...vals);
    max = Math.max(...vals);
    if (min === max) { min -= 1; max += 1; }
    const pad = (max - min) * 0.15;
    min -= pad; max += pad;
  }

  const x = (i: number) => PAD.left + (pts.length === 1 ? innerW / 2 : (i / (pts.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH * (1 - (v - min) / (max - min));
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");

  // 값 표기: 범주형이면 범주 라벨, 아니면 숫자(+단위)
  const valLabel = (v: number) =>
    cats && cats.length > 0
      ? cats[Math.min(cats.length - 1, Math.max(0, Math.round(v) - 1))] ?? "-"
      : `${Number.isInteger(v) ? v : v.toFixed(1)}${series.unit ? ` ${series.unit}` : ""}`;

  const gridLevels = cats && cats.length > 0
    ? cats.map((label, idx) => ({ gy: y(idx + 1), label }))
    : [max, (max + min) / 2, min].map((gv) => ({ gy: y(gv), label: gv.toFixed(1) }));

  return (
    <div style={{ marginBottom: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", padding: 10 }}>
      <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 600, color: "var(--text-soft)" }}>
        {series.label} 추이 {series.unit && !cats ? `(${series.unit})` : ""}
        <span style={{ marginLeft: 6, fontWeight: 400, color: "var(--text-mute)" }}>· 점에 마우스를 올리면 수치가 나와요</span>
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
        {gridLevels.map(({ gy, label }, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={gy} y2={gy} stroke="#EBE5D6" strokeDasharray="3 3" />
            <text x={PAD.left - 6} y={gy + 4} textAnchor="end" fontSize={11} fill="var(--text-mute)">{label}</text>
          </g>
        ))}
        <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.v)} r={hover === i ? 5 : 3.5} fill={color} stroke="white" strokeWidth={1.5} />
        ))}
        {/* 처음/마지막 날짜 */}
        <text x={PAD.left} y={H - 8} textAnchor="start" fontSize={10} fill="var(--text-mute)">{fmtDate(pts[0].t).slice(0, 8)}</text>
        <text x={W - PAD.right} y={H - 8} textAnchor="end" fontSize={10} fill="var(--text-mute)">{fmtDate(pts[pts.length - 1].t).slice(0, 8)}</text>

        {/* hover 툴팁 */}
        {hover !== null && (() => {
          const p = pts[hover];
          const cx = x(hover);
          const cy = y(p.v);
          const text = `${fmtDate(p.t).slice(0, 8)} · ${valLabel(p.v)}`;
          const tw = Math.max(64, text.length * 6.6 + 14);
          const tx = Math.min(W - PAD.right - tw, Math.max(PAD.left, cx - tw / 2));
          const ty = Math.max(2, cy - 30);
          return (
            <g pointerEvents="none">
              <line x1={cx} x2={cx} y1={PAD.top} y2={H - PAD.bottom} stroke={color} strokeOpacity={0.35} />
              <rect x={tx} y={ty} width={tw} height={22} rx={5} fill="#1F2317" opacity={0.92} />
              <text x={tx + tw / 2} y={ty + 15} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="#fff">{text}</text>
            </g>
          );
        })()}

        {/* hover 히트영역(넓게) */}
        {pts.map((p, i) => (
          <rect
            key={`hit-${i}`}
            x={x(i) - Math.max(8, innerW / pts.length / 2)}
            y={PAD.top}
            width={Math.max(16, innerW / pts.length)}
            height={innerH}
            fill="transparent"
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover((h) => (h === i ? null : h))}
          />
        ))}
      </svg>
    </div>
  );
}
