"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { trendSvg } from "@/lib/voice/report";

type RegisterChild = { id: number; name: string; birthDate: string | null };
type ToolChildEntry = { id: number; name: string; memo: string | null };
type SavedSession = {
  id: number;
  createdAt: string;
  note: string | null;
  metrics: Record<string, unknown>;
};
export type Series = {
  key: string; label: string; unit?: string; color?: string; categories?: string[];
  refKey?: string; refLabel?: string; refColor?: string;
};

// 선택값 인코딩: "c-{id}" = ChildService 아동, "t-{id}" = ToolChild
function encodeKey(type: "c" | "t", id: number) { return `${type}-${id}`; }
function decodeKey(key: string): { type: "c" | "t"; id: number } | null {
  const m = key.match(/^([ct])-(\d+)$/);
  if (!m) return null;
  return { type: m[1] as "c" | "t", id: Number(m[2]) };
}

export default function ToolMonitor({
  module,
  getMetrics,
  renderSummary,
  renderRowChart,
  renderOverview,
  trend,
  trends,
  lockedChildId,
  onContext,
}: {
  module: string;
  getMetrics: () => Record<string, number | string> | null;
  renderSummary: (m: Record<string, unknown>) => string;
  renderRowChart?: (m: Record<string, unknown>) => ReactNode;
  renderOverview?: (sessions: SavedSession[]) => ReactNode;
  trend?: Series;
  trends?: Series[];
  lockedChildId?: number | null;
  onContext?: (ctx: { subject: string | null; clinician: string; chartSvg: string }) => void;
}) {
  const [registerChildren, setRegisterChildren] = useState<RegisterChild[] | null>(null);
  const [toolChildren, setToolChildren] = useState<ToolChildEntry[]>([]);
  const [therapist, setTherapist] = useState("");
  const [selKey, setSelKey] = useState<string>("");
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const locked = lockedChildId !== undefined;
  const lockedKey = locked && lockedChildId != null ? encodeKey("c", lockedChildId) : null;
  const activeKey = locked ? (lockedKey ?? "") : selKey;
  const activeSel = decodeKey(activeKey);

  useEffect(() => {
    let alive = true;
    fetch("/api/tools/children")
      .then((r) => (r.ok ? r.json() : { children: [], toolChildren: [] }))
      .then((d) => {
        if (!alive) return;
        setRegisterChildren(d.children ?? []);
        setToolChildren(d.toolChildren ?? []);
        setTherapist(d.therapist ?? "");
      })
      .catch(() => { if (alive) setRegisterChildren([]); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSessions = useCallback((sel: { type: "c" | "t"; id: number }) => {
    setLoadingList(true);
    const param = sel.type === "t"
      ? `toolChildId=${sel.id}`
      : `childId=${sel.id}`;
    fetch(`/api/tools/session?${param}&module=${encodeURIComponent(module)}`)
      .then((r) => (r.ok ? r.json() : { sessions: [] }))
      .then((d) => setSessions(d.sessions ?? []))
      .catch(() => setSessions([]))
      .finally(() => setLoadingList(false));
  }, [module]);

  useEffect(() => {
    if (activeSel) loadSessions(activeSel);
    else setSessions([]);
  }, [activeKey, loadSessions]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const allChildren: Array<{ id: number; name: string; isToolChild: boolean }> = [
      ...(registerChildren ?? []).map(c => ({ id: c.id, name: c.name, isToolChild: false })),
      ...toolChildren.map(c => ({ id: c.id, name: c.name, isToolChild: true })),
    ];
    const name = activeSel
      ? allChildren.find(c => c.id === activeSel.id && c.isToolChild === (activeSel.type === "t"))?.name ?? null
      : null;
    const mainTrend = trend ?? trends?.[0];
    let chartSvg = "";
    if (mainTrend && activeSel && sessions.length >= 2) {
      const points = sessions.map((s) => ({ t: s.createdAt, v: Number(s.metrics[mainTrend.key]) }));
      chartSvg = trendSvg(points, mainTrend);
    }
    onContext?.({ subject: name, clinician: therapist, chartSvg });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, sessions, therapist, registerChildren, toolChildren]);

  const save = useCallback(async () => {
    if (!activeSel) { setMsg("먼저 대상자를 선택하세요."); return; }
    const metrics = getMetrics();
    if (!metrics) { setMsg("저장할 측정 결과가 없어요."); return; }
    setSaving(true);
    setMsg(null);
    try {
      const body = activeSel.type === "t"
        ? { toolChildId: activeSel.id, module, metrics }
        : { childId: activeSel.id, module, metrics };
      const r = await fetch("/api/tools/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error();
      setMsg("저장했어요.");
      loadSessions(activeSel);
      window.setTimeout(() => setMsg(null), 2000);
    } catch {
      setMsg("저장에 실패했어요. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }, [activeSel, getMetrics, module, loadSessions]);

  const remove = useCallback(async (id: number) => {
    await fetch(`/api/tools/session?id=${id}`, { method: "DELETE" }).catch(() => {});
    if (activeSel) loadSessions(activeSel);
  }, [activeSel, loadSessions]);

  const resetAll = useCallback(async () => {
    if (!activeSel || sessions.length === 0) return;
    if (!window.confirm("이 대상자의 이 도구 추이(저장 기록)를 모두 삭제할까요? 되돌릴 수 없어요.")) return;
    await Promise.all(
      sessions.map((s) => fetch(`/api/tools/session?id=${s.id}`, { method: "DELETE" }).catch(() => {})),
    );
    loadSessions(activeSel);
  }, [activeSel, sessions, loadSessions]);

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear().toString().slice(2)}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const hasAny = (registerChildren?.length ?? 0) > 0 || toolChildren.length > 0;
  const activeToolChild = activeSel?.type === "t" ? toolChildren.find(c => c.id === activeSel.id) : null;
  const activeRegChild = activeSel?.type === "c" ? registerChildren?.find(c => c.id === activeSel.id) : null;
  const activeName = activeToolChild?.name ?? activeRegChild?.name ?? null;

  return (
    <div className="card">
      <div className="card-body" style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
            대상자 모니터링
            {locked && activeSel && (
              <span style={{ marginLeft: 6, color: "var(--primary)" }}>· {activeName ?? ""}</span>
            )}
          </h3>
          <span style={{ fontSize: 12, color: "var(--text-mute)" }}>측정 결과를 대상자별로 저장해 추이를 봐요</span>
        </div>

        {registerChildren === null ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-mute)" }}>대상자 목록 불러오는 중…</p>
        ) : !hasAny ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-mute)" }}>
            담당 대상자가 없어요. <b>내 아동</b>이나 <b>바로툴 대상자</b>를 먼저 등록하세요.
          </p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {!locked && (
                <select
                  value={selKey}
                  onChange={(e) => setSelKey(e.target.value)}
                  style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 14, color: "var(--text)", minWidth: 180 }}
                >
                  <option value="">대상자 선택…</option>
                  {(registerChildren?.length ?? 0) > 0 && (
                    <optgroup label="내 아동">
                      {registerChildren!.map((c) => (
                        <option key={encodeKey("c", c.id)} value={encodeKey("c", c.id)}>
                          {c.name}{c.birthDate ? ` (${c.birthDate})` : ""}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {toolChildren.length > 0 && (
                    <optgroup label="바로툴 대상자">
                      {toolChildren.map((c) => (
                        <option key={encodeKey("t", c.id)} value={encodeKey("t", c.id)}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              )}

              <button className="btn btn-primary" onClick={save} disabled={saving || !activeSel}>
                {saving ? "저장 중…" : locked ? "측정 결과 저장" : "이 대상자에 저장"}
              </button>

              {/* ToolChild 선택 시 모니터링 링크 */}
              {activeSel?.type === "t" && (
                <Link
                  href={`/monitor/${activeSel.id}`}
                  style={{ fontSize: 12, color: "var(--primary)", textDecoration: "none", display: "flex", alignItems: "center", gap: 3 }}
                >
                  모니터링 보기 →
                </Link>
              )}

              {locked && !activeSel && <span style={{ fontSize: 13, color: "var(--text-mute)" }}>위에서 대상자를 선택하세요</span>}
              {msg && <span style={{ fontSize: 13, color: "var(--primary)" }}>{msg}</span>}
            </div>

            {activeSel && (
              <div>
                {renderOverview && renderOverview(sessions)}
                {trends
                  ? trends.map((s) => <TrendChart key={s.key} sessions={sessions} series={s} fmtDate={fmtDate} />)
                  : trend && <TrendChart sessions={sessions} series={trend} fmtDate={fmtDate} />}

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, margin: "0 0 6px" }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--text-soft)" }}>
                    최근 기록 {sessions.length > 0 ? `(최근 ${Math.min(5, sessions.length)}${sessions.length > 5 ? ` / 총 ${sessions.length}` : ""})` : ""}
                    {sessions.length > 0 && <span style={{ fontWeight: 400, color: "var(--text-mute)" }}> · 잘못된 점은 삭제로 수정</span>}
                  </p>
                  {sessions.length > 0 && (
                    <button onClick={resetAll} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 8, padding: "3px 10px", fontSize: 12, color: "var(--text-soft)", cursor: "pointer" }}>
                      추이 전체 초기화
                    </button>
                  )}
                </div>
                {loadingList ? (
                  <p style={{ margin: 0, fontSize: 13, color: "var(--text-mute)" }}>불러오는 중…</p>
                ) : sessions.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13, color: "var(--text-mute)" }}>아직 저장된 기록이 없어요.</p>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 250px), 1fr))", gap: 8, alignItems: "start" }}>
                    {[...sessions].reverse().slice(0, 5).map((s) => (
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

export function TrendChart({
  sessions,
  series,
  fmtDate,
}: {
  sessions: SavedSession[];
  series: Series;
  fmtDate: (iso: string) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const refKey = series.refKey;
  const refColor = series.refColor ?? "#B7956A";
  const pts = sessions
    .map((s) => ({
      t: s.createdAt,
      v: Number(s.metrics[series.key]),
      ref: refKey ? Number(s.metrics[refKey]) : NaN,
    }))
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
    const vals = pts.map((p) => p.v).concat(refKey ? pts.map((p) => p.ref).filter((r) => isFinite(r)) : []);
    min = Math.min(...vals);
    max = Math.max(...vals);
    if (min === max) { min -= 1; max += 1; }
    const pad = (max - min) * 0.15;
    min -= pad; max += pad;
  }

  const x = (i: number) => PAD.left + (pts.length === 1 ? innerW / 2 : (i / (pts.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH * (1 - (v - min) / (max - min));
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
  const refPath = refKey
    ? pts.map((p, i) => (isFinite(p.ref) ? `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.ref).toFixed(1)}` : "")).filter(Boolean).join(" ")
    : "";

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
        {refKey && series.refLabel ? (
          <span style={{ marginLeft: 8, fontWeight: 600 }}>
            <span style={{ color }}>━ {series.label}</span>
            <span style={{ marginLeft: 8, color: refColor }}>┈ {series.refLabel}</span>
          </span>
        ) : (
          <span style={{ marginLeft: 6, fontWeight: 400, color: "var(--text-mute)" }}>· 점에 마우스를 올리면 수치가 나와요</span>
        )}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
        {gridLevels.map(({ gy, label }, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={gy} y2={gy} stroke="#EBE5D6" strokeDasharray="3 3" />
            <text x={PAD.left - 6} y={gy + 4} textAnchor="end" fontSize={11} fill="var(--text-mute)">{label}</text>
          </g>
        ))}
        {refPath && <path d={refPath} fill="none" stroke={refColor} strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" />}
        {refKey && pts.map((p, i) => (isFinite(p.ref) ? <circle key={`r-${i}`} cx={x(i)} cy={y(p.ref)} r={2.5} fill={refColor} /> : null))}
        <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.v)} r={hover === i ? 5 : 3.5} fill={color} stroke="white" strokeWidth={1.5} />
        ))}
        <text x={PAD.left} y={H - 8} textAnchor="start" fontSize={10} fill="var(--text-mute)">{fmtDate(pts[0].t).slice(0, 8)}</text>
        <text x={W - PAD.right} y={H - 8} textAnchor="end" fontSize={10} fill="var(--text-mute)">{fmtDate(pts[pts.length - 1].t).slice(0, 8)}</text>

        {hover !== null && (() => {
          const p = pts[hover];
          const cx = x(hover);
          const cy = y(p.v);
          const refTxt = refKey && isFinite(p.ref) ? ` · ${series.refLabel ?? "기준"} ${valLabel(p.ref)}` : "";
          const text = `${fmtDate(p.t).slice(0, 8)} · ${valLabel(p.v)}${refTxt}`;
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
