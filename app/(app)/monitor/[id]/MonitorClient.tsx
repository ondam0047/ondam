"use client";

import { useState } from "react";
import Link from "next/link";
import { TrendChart, type Series } from "@/app/(app)/tools/ToolMonitor";

type SavedSession = { id: number; createdAt: string; note: string | null; metrics: Record<string, unknown> };

type Props = {
  name: string;
  memo: string | null;
  grouped: Record<string, SavedSession[]>;
  toolChildId: number;
};

const MODULE_INFO: Record<string, { label: string; trends: Series[] }> = {
  mpt: {
    label: "MPT (지속발성)",
    trends: [{ key: "avg", label: "평균 MPT", unit: "초" }],
  },
  loudness: {
    label: "음도·강도",
    trends: [
      { key: "meanF0", label: "평균 음도", unit: "Hz", color: "#7C3AED" },
      { key: "meanDb", label: "평균 강도", unit: "dB", color: "#0369A1" },
    ],
  },
  "speech-rate": {
    label: "말속도",
    trends: [
      { key: "sps",    label: "말속도(전체)",     unit: "SPS", color: "#2563EB" },
      { key: "artSps", label: "조음속도(쉼 제외)", unit: "SPS", color: "#5A6E3D" },
    ],
  },
  fluency: {
    label: "유창성",
    trends: [{ key: "per100", label: "100음절당 비유창성", unit: "회" }],
  },
  pacing: {
    label: "페이싱",
    trends: [{ key: "measuredSps", label: "측정 말속도", unit: "음절/초" }],
  },
  spectrogram: {
    label: "스펙트로그램",
    trends: [{ key: "targetPct", label: "목표음 체류율", unit: "%" }],
  },
};

const MODULES_ORDER = ["mpt", "loudness", "speech-rate", "fluency", "pacing", "spectrogram"];

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear().toString().slice(2)}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function renderSummary(module: string, m: Record<string, unknown>): string {
  switch (module) {
    case "mpt":         return `평균 ${m.avg ?? "-"}초 · 최고 ${m.best ?? "-"}초`;
    case "loudness":    return `${m.meanF0 ?? "-"}Hz · ${m.meanDb ?? "-"}dB`;
    case "speech-rate": return `${m.sps ?? "-"} SPS (조음 ${m.artSps ?? "-"})`;
    case "fluency":     return `${m.total ?? "-"}회${m.per100 ? ` · 100음절당 ${m.per100}` : ""}`;
    case "pacing":      return `측정 ${m.measuredSps ?? "-"} / 목표 ${m.targetSps ?? "-"} 음절/초`;
    case "spectrogram": return `중심 ${m.centroid ?? "-"}Hz · 체류 ${m.targetPct ?? "-"}%`;
    default:            return JSON.stringify(m).slice(0, 40);
  }
}

export default function MonitorClient({ name, memo, grouped, toolChildId }: Props) {
  const [deleting, setDeleting] = useState<number | null>(null);
  const [localGrouped, setLocalGrouped] = useState(grouped);

  async function deleteSession(module: string, id: number) {
    setDeleting(id);
    try {
      await fetch(`/api/tools/session?id=${id}`, { method: "DELETE" });
      setLocalGrouped(prev => ({
        ...prev,
        [module]: (prev[module] ?? []).filter(s => s.id !== id),
      }));
    } finally {
      setDeleting(null);
    }
  }

  const activeModules = MODULES_ORDER.filter(m => (localGrouped[m]?.length ?? 0) > 0);
  const totalSessions = Object.values(localGrouped).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <>
      <div className="section-head">
        <div>
          <h2>{name}</h2>
          {memo && <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--text-soft)" }}>{memo}</p>}
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--text-mute)" }}>
            바로툴 대상자 · 총 {totalSessions}회 측정
          </p>
        </div>
        <Link href="/tools" className="btn btn-ghost" style={{ fontSize: 13, alignSelf: "center" }}>
          ← 바로툴
        </Link>
      </div>

      {activeModules.length === 0 ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
          아직 저장된 측정 기록이 없어요.
          <br />
          바로툴에서 이 대상자를 선택한 뒤 측정 결과를 저장하면 여기에 나타나요.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 32 }}>
          {activeModules.map((mod) => {
            const sessions = localGrouped[mod] ?? [];
            const info = MODULE_INFO[mod] ?? { label: mod, trends: [] };
            return (
              <section key={mod}>
                <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 800 }}>
                  {info.label}
                  <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: "var(--text-mute)" }}>
                    {sessions.length}회
                  </span>
                </h3>

                {/* 추이 그래프 */}
                {info.trends.map((series) => (
                  <TrendChart key={series.key} sessions={sessions} series={series} fmtDate={fmtDate} />
                ))}

                {/* 최근 기록 */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))", gap: 8 }}>
                  {[...sessions].reverse().slice(0, 6).map((s) => (
                    <div key={s.id} style={{
                      borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)",
                      padding: "8px 12px", display: "grid", gap: 4,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontSize: 11, color: "var(--text-mute)", fontVariantNumeric: "tabular-nums" }}>
                          {fmtDate(s.createdAt)}
                        </span>
                        <button
                          onClick={() => deleteSession(mod, s.id)}
                          disabled={deleting === s.id}
                          style={{ background: "none", border: "none", fontSize: 11, color: "var(--text-mute)", cursor: "pointer", padding: 0 }}
                        >
                          삭제
                        </button>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{renderSummary(mod, s.metrics)}</span>
                      {s.note && <span style={{ fontSize: 11, color: "var(--text-soft)" }}>{s.note}</span>}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* 이 대상자의 기타지원사업 링크 (하단 안내) */}
      <div style={{ marginTop: 40, padding: "14px 16px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, color: "var(--text-soft)" }}>
        <b>{name}</b>의 기타지원사업 기록지를 작성하려면{" "}
        <Link href="/support" style={{ color: "var(--primary)" }}>기타지원사업</Link>
        에서 아동을 연결할 수 있어요.
      </div>
    </>
  );
}
