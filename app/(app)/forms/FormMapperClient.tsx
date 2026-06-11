"use client";

import { useState } from "react";

type Cell = { r: number; c: number; cs: number; rs: number; text: string; role: string | null };
type AnalyzeResult = { coverage: Record<string, boolean>; grid: Cell[][] };

const FIELD_LABEL: Record<string, string> = {
  org: "기관명", name: "이름", birth: "생년월일", date: "날짜",
  start: "시작시간", end: "종료시간", voucher: "바우처(분)", extra: "추가구매",
  amount: "금액", result: "결과표",
};

export default function FormMapperClient() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function analyze() {
    if (!file) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/forms/analyze", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "분석 실패");
      setResult(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석 중 문제가 생겼어요.");
    } finally {
      setLoading(false);
    }
  }

  async function downloadSample() {
    if (!file) return;
    setDownloading(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/forms/sample", { method: "POST", body: fd });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || "샘플 생성 실패"); }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${file.name.replace(/\.hwpx$/i, "")}_샘플채움.hwpx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "샘플 생성 중 문제가 생겼어요.");
    } finally {
      setDownloading(false);
    }
  }

  const missing = result ? Object.entries(result.coverage).filter(([, v]) => !v).map(([k]) => FIELD_LABEL[k] ?? k) : [];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <div className="card-body" style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <label className="btn" style={{ cursor: "pointer" }}>
              {file ? "다른 파일 선택" : ".hwpx 양식 선택"}
              <input type="file" accept=".hwpx" style={{ display: "none" }}
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); setError(null); }} />
            </label>
            {file && <span style={{ fontSize: 13, color: "var(--text-soft)" }}>{file.name}</span>}
            <button className="btn btn-primary" onClick={analyze} disabled={!file || loading}>
              {loading ? "분석 중…" : "자동 매핑 분석"}
            </button>
            {result && (
              <button className="btn" onClick={downloadSample} disabled={downloading}>
                {downloading ? "생성 중…" : "샘플로 채워 받기 (.hwpx)"}
              </button>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-mute)", lineHeight: 1.6 }}>
            편집 가능한 <b>.hwpx</b> 빈 양식만 분석돼요(.hwp·스캔·PDF 미지원). 분석 후 <b>샘플로 채워 받기</b>로
            실제 한글 파일에 더미 데이터가 제대로 들어가는지 먼저 확인하세요.
          </p>
        </div>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: 10, fontSize: 13.5, lineHeight: 1.6, background: "#F6E4DE", color: "#8A2F1C", border: "1px solid #E6C3B8" }}>
          {error}
        </div>
      )}

      {result && (
        <>
          <div className="card">
            <div className="card-body" style={{ display: "grid", gap: 10 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>인식 결과</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {Object.entries(result.coverage).map(([k, ok]) => (
                  <span key={k} className="badge" style={{
                    fontSize: 12, padding: "4px 10px", borderColor: "transparent",
                    background: ok ? "#DDEBD3" : "#F6E4DE", color: ok ? "#3F6132" : "#8A2F1C",
                  }}>
                    {ok ? "✓" : "✗"} {FIELD_LABEL[k] ?? k}
                  </span>
                ))}
              </div>
              {missing.length > 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: "#8A6422" }}>
                  ⚠ 못 찾은 칸: {missing.join(", ")} — 이 양식은 자동 인식이 일부 안 됐어요. 샘플로 확인 후 보정이 필요합니다.
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: "var(--primary)" }}>
                  ✓ 핵심 칸을 모두 인식했어요. 샘플로 채워 받아 실제로 맞는지 확인하세요.
                </p>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-body" style={{ display: "grid", gap: 16, overflowX: "auto" }}>
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-mute)" }}>
                양식 표 미리보기 — <span style={{ background: "var(--primary-soft)", color: "var(--primary)", padding: "1px 6px", borderRadius: 4, fontWeight: 700 }}>색칠된 칸</span>이 자동 인식된 입력 위치예요.
              </p>
              {result.grid.map((cells, ti) => (
                <div key={ti}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-soft)", marginBottom: 4 }}>표 {ti + 1}</div>
                  <TableView cells={cells} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TableView({ cells }: { cells: Cell[] }) {
  if (cells.length === 0) return null;
  const maxR = Math.max(...cells.map((c) => c.r + c.rs));
  const maxC = Math.max(...cells.map((c) => c.c + c.cs));
  const at = new Map<string, Cell>();
  cells.forEach((c) => at.set(`${c.r},${c.c}`, c));
  const covered = new Set<string>();
  const rows: React.ReactNode[] = [];
  for (let r = 0; r < maxR; r++) {
    const tds: React.ReactNode[] = [];
    for (let c = 0; c < maxC; c++) {
      if (covered.has(`${r},${c}`)) continue;
      const cell = at.get(`${r},${c}`);
      if (cell) {
        for (let rr = r; rr < r + cell.rs; rr++)
          for (let cc = c; cc < c + cell.cs; cc++)
            if (!(rr === r && cc === c)) covered.add(`${rr},${cc}`);
        const hl = !!cell.role;
        tds.push(
          <td key={c} colSpan={cell.cs} rowSpan={cell.rs}
            style={{
              border: "1px solid var(--border)", padding: "3px 5px", fontSize: 11, verticalAlign: "top",
              background: hl ? "var(--primary-soft)" : "var(--surface)",
              minWidth: 40, maxWidth: 160,
            }}>
            {hl && (
              <div style={{ fontSize: 9, fontWeight: 800, color: "var(--primary)", marginBottom: 1 }}>{cell.role}</div>
            )}
            <div style={{ color: cell.text ? "var(--text)" : "var(--text-mute)", whiteSpace: "normal", wordBreak: "break-all" }}>
              {cell.text || (hl ? "" : "·")}
            </div>
          </td>,
        );
      } else {
        tds.push(<td key={c} style={{ border: "1px solid var(--border)", background: "var(--surface-2)" }} />);
      }
    }
    rows.push(<tr key={r}>{tds}</tr>);
  }
  return (
    <table style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
      <tbody>{rows}</tbody>
    </table>
  );
}
