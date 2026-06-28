"use client";

import { useCallback, useEffect, useState } from "react";
import { useBetaUx } from "../BetaUxContext";
import { rolesForForm } from "@/lib/record-roles";

type Cell = { r: number; c: number; cs: number; rs: number; text: string; role: string | null };
type Spec = { schedule?: Array<{ role: string }>; detail?: unknown[]; extraSessionCols?: number[]; extraResultRows?: number[] };
type AnalyzeResult = { coverage: Record<string, boolean>; grid: Cell[][]; spec?: Spec; cached?: { overrides: Record<string, string> } | null };
type Suggestion = { table: number; row: number; col: number; p?: number; role: string; confidence: number };

// 캐시/AI 가 주는 4-요소 키(t,r,c,p)를 매퍼가 쓰는 3-요소 키(t,r,c)로 정규화.
function trcKey(t: number, r: number, c: number) { return `${t},${r},${c}`; }

const FIELD_LABEL: Record<string, string> = {
  org: "기관명", name: "이름", birth: "생년월일", date: "날짜",
  start: "시작시간", end: "종료시간", voucher: "바우처(분)", extra: "추가구매",
  amount: "금액", result: "결과표",
};

export default function FormMapperClient() {
  const betaUx = useBetaUx();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  // AI 매핑은 보통 30~80초 걸려 — 멈춘 줄 오해 않도록 경과 초를 보여준다.
  const [aiElapsed, setAiElapsed] = useState(0);
  // AI 가 신뢰도 낮게(<0.6) 제안한 칸 — 사람이 꼭 확인하도록 표시. key="t,r,c"
  const [lowConf, setLowConf] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  // 저장된 양식(사용자별 다수)
  const [saved, setSaved] = useState<Array<{ id: number; kind: string; name: string }>>([]);
  const [formName, setFormName] = useState("");
  const [kind, setKind] = useState<"record" | "schedule">("record");
  const [savingForm, setSavingForm] = useState(false);
  // 셀프 보정: 칸 클릭으로 역할 지정/해제. key="t,r,c" → 역할(빈문자열=해제)
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [picker, setPicker] = useState<{ t: number; r: number; c: number; text: string; x: number; y: number } | null>(null);

  // AI 매핑 동안 1초마다 경과 초 증가(끝나면 0으로 리셋).
  useEffect(() => {
    if (!aiLoading) { setAiElapsed(0); return; }
    const t = setInterval(() => setAiElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [aiLoading]);

  const loadSaved = useCallback(() => {
    fetch("/api/forms/saved").then((r) => (r.ok ? r.json() : { forms: [] })).then((d) => setSaved(d.forms ?? [])).catch(() => {});
  }, []);
  useEffect(() => { loadSaved(); }, [loadSaved]);

  async function analyze() {
    if (!file) return;
    setLoading(true); setError(null); setResult(null); setOverrides({}); setLowConf(new Set()); setPicker(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/forms/analyze", { method: "POST", body: fd });
      const d = await r.json() as AnalyzeResult & { error?: string };
      if (!r.ok) throw new Error(d.error || "분석 실패");
      setResult(d);
      const hasRecord = d.coverage && (d.coverage.date || d.coverage.result);
      const k = hasRecord ? "record" : (d.spec?.schedule?.length ? "schedule" : "record");
      setKind(k);
      if (file && !formName) setFormName(file.name.replace(/\.hwpx$/i, ""));
      // 학습 캐시 적중(같은 구조 양식을 전에 매핑) → 그 매핑 자동 적용. 아니면 베타계정은 AI 자동.
      const cached = d.cached?.overrides;
      if (cached && Object.keys(cached).length) {
        const norm: Record<string, string> = {};
        for (const [key, role] of Object.entries(cached)) {
          const [t, rr, c] = key.split(",").map(Number);
          norm[trcKey(t, rr, c)] = role;
        }
        setOverrides(norm);
      } else if (betaUx) {
        await runAutoMap(d.grid, k);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석 중 문제가 생겼어요.");
    } finally {
      setLoading(false);
    }
  }

  // AI 자동매핑 — 규칙 엔진이 못 잡은 칸까지 LLM 이 역할 제안(좌표 환각 차단·개인정보 마스킹은 서버에서).
  // 제안을 overrides 에 병합하고, 신뢰도<0.6 칸은 lowConf 로 표시(사람이 확인).
  async function runAutoMap(grid?: Cell[][], formTypeArg?: "record" | "schedule") {
    const g = grid ?? result?.grid;
    if (!g || !g.length) return;
    setAiLoading(true); setError(null);
    try {
      const r = await fetch("/api/forms/automap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grid: g, formType: formTypeArg ?? kind }),
      });
      const d = await r.json() as { suggestions?: Suggestion[]; error?: string };
      if (!r.ok) throw new Error(d.error || "AI 매핑 실패");
      const low = new Set<string>();
      setOverrides((prev) => {
        const next = { ...prev };
        for (const s of d.suggestions ?? []) {
          const key = trcKey(s.table, s.row, s.col);
          next[key] = s.role;
          if ((s.confidence ?? 1) < 0.6) low.add(key);
        }
        return next;
      });
      setLowConf(low);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI 매핑 중 문제가 생겼어요.");
    } finally {
      setAiLoading(false);
    }
  }

  async function downloadSample(trim = false) {
    if (!file) return;
    setDownloading(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (overridesArray.length) fd.append("overrides", JSON.stringify(overridesArray));
      const r = await fetch(`/api/forms/sample${trim ? "?trim=1" : ""}`, { method: "POST", body: fd });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || "샘플 생성 실패"); }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${file.name.replace(/\.hwpx$/i, "")}_${trim ? "5칸정리샘플" : "샘플채움"}.hwpx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "샘플 생성 중 문제가 생겼어요.");
    } finally {
      setDownloading(false);
    }
  }

  async function saveForm() {
    if (!file || !formName.trim()) { setError("파일과 이름을 확인하세요."); return; }
    setSavingForm(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", formName.trim());
      fd.append("kind", kind);
      if (overridesArray.length) fd.append("overrides", JSON.stringify(overridesArray));
      const r = await fetch("/api/forms/saved", { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "저장 실패");
      setFormName("");
      loadSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 중 문제가 생겼어요.");
    } finally {
      setSavingForm(false);
    }
  }

  async function deleteForm(id: number) {
    await fetch(`/api/forms/saved?id=${id}`, { method: "DELETE" }).catch(() => {});
    loadSaved();
  }

  // 셀프 보정 — 지정 가능 역할(양식 종류별). 같은 역할을 여러 칸에 지정 가능.
  // 기록지엔 발달바우처 전용 수동 역할(바우처분·추가구매·금액)을 더한다(AI 사전엔 없고 규칙엔진 담당).
  const SCALAR_ROLES = rolesForForm(kind).filter((r) => r.kind === "scalar").map((r) => r.role);
  const ROW_ROLES = kind === "record"
    ? [...rolesForForm("record").filter((r) => r.kind === "row").map((r) => r.role), "바우처(분)", "추가구매", "금액"]
    : rolesForForm(kind).filter((r) => r.kind === "row").map((r) => r.role);
  const effRole = (ti: number, cell: Cell): string | null => {
    const k = `${ti},${cell.r},${cell.c}`;
    return k in overrides ? (overrides[k] || null) : cell.role;
  };
  function assignRole(role: string) {
    if (!picker) return;
    const K = `${picker.t},${picker.r},${picker.c}`;
    setOverrides({ ...overrides, [K]: role }); // role "" = 해제. 중복제거 안 함(다중 허용)
    setPicker(null);
  }
  const overridesArray = Object.entries(overrides).map(([k, role]) => {
    const [t, r, c] = k.split(",").map(Number);
    return { table: t, row: r, col: c, role };
  });

  const KIND_LABEL: Record<string, string> = { record: "기록지", schedule: "일정표" };
  const recordForms = saved.filter((f) => f.kind === "record");
  const scheduleForms = saved.filter((f) => f.kind === "schedule");
  const missing = result ? Object.entries(result.coverage).filter(([, v]) => !v).map(([k]) => FIELD_LABEL[k] ?? k) : [];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* 저장된 양식(기록지/일정표 각각 다수) */}
      <div className="card">
        <div className="card-body" style={{ display: "grid", gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>저장된 양식</h3>
          {(["record", "schedule"] as const).map((k) => {
            const list = k === "record" ? recordForms : scheduleForms;
            return (
              <div key={k}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-soft)", marginBottom: 4 }}>{KIND_LABEL[k]} ({list.length})</div>
                {list.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-mute)" }}>저장된 {KIND_LABEL[k]}가 없어요. 아래에서 양식을 올려 저장하세요. (센터마다 다르면 여러 개 저장)</p>
                ) : (
                  <div style={{ display: "grid", gap: 6 }}>
                    {list.map((f) => (
                      <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", padding: "8px 12px" }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{f.name}</span>
                        <button onClick={() => deleteForm(f.id)} style={{ background: "none", border: "none", fontSize: 12, color: "var(--text-mute)", cursor: "pointer" }}>삭제</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

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
              <button className="btn" onClick={() => runAutoMap()} disabled={aiLoading || loading}
                title="규칙 자동인식이 놓친 칸까지 AI가 역할을 제안해요. 제안 후 칸을 클릭해 고칠 수 있어요.">
                {aiLoading ? `AI 매핑 중… ${aiElapsed}초` : "✨ AI로 칸 자동 매핑"}
              </button>
            )}
            {result && (
              <button className="btn" onClick={() => downloadSample(false)} disabled={downloading}>
                {downloading ? "생성 중…" : "샘플로 채워 받기 (.hwpx)"}
              </button>
            )}
            {result && ((result.spec?.extraSessionCols?.length ?? 0) > 0 || (result.spec?.extraResultRows?.length ?? 0) > 0) && (
              <button className="btn" onClick={() => downloadSample(true)} disabled={downloading}
                title="회기 칸·결과표 행이 5개를 넘는 양식에서 초과분을 제거해 5칸/5행으로 정리(실험)">
                {downloading ? "생성 중…" : `5칸으로 정리해서 받기${(result.spec?.extraSessionCols?.length ?? 0) > 0 ? ` (회기 ${result.spec?.extraSessionCols?.length}칸↓)` : ""}${(result.spec?.extraResultRows?.length ?? 0) > 0 ? ` (결과 ${result.spec?.extraResultRows?.length}행↓)` : ""}`}
              </button>
            )}
          </div>
          {aiLoading && (
            <div role="status" aria-live="polite" style={{
              display: "grid", gap: 8, padding: "12px 14px", borderRadius: 10,
              background: "var(--primary-soft)", border: "1px solid var(--primary)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 700, color: "var(--primary)" }}>
                <span className="ai-spin" style={{
                  width: 14, height: 14, borderRadius: "50%", display: "inline-block",
                  border: "2px solid currentColor", borderTopColor: "transparent",
                }} />
                ✨ AI가 양식 칸을 분석하고 있어요
                <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums", color: "var(--text-soft)", fontWeight: 600 }}>
                  {aiElapsed}초 경과
                </span>
              </div>
              {/* 정확한 진행률은 알 수 없어 — 예상 60초 기준으로 95%까지 서서히 차오르는 표시 */}
              <div style={{ height: 6, borderRadius: 999, background: "rgba(0,0,0,0.08)", overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${Math.min(95, Math.round((aiElapsed / 60) * 95))}%`,
                  background: "var(--primary)", borderRadius: 999, transition: "width 1s linear",
                }} />
              </div>
              <div style={{ fontSize: 12, color: "var(--text-soft)" }}>
                보통 30~80초 걸려요. 창을 닫지 말고 잠시만 기다려 주세요{aiElapsed >= 90 ? " — 양식이 커서 조금 더 걸리고 있어요." : "."}
              </div>
            </div>
          )}
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-mute)", lineHeight: 1.6 }}>
            편집 가능한 <b>.hwpx</b> 빈 양식만 분석돼요(.hwp·스캔·PDF 미지원). 분석 후 <b>샘플로 채워 받기</b>로
            실제 한글 파일에 더미 데이터가 제대로 들어가는지 먼저 확인하세요. <b>✨ AI로 칸 자동 매핑</b>은 30~80초 정도 걸려요.
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
            <div className="card-body" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>이 양식 저장:</span>
              <select value={kind} onChange={(e) => setKind(e.target.value as "record" | "schedule")}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 14, color: "var(--text)" }}>
                <option value="record">기록지</option>
                <option value="schedule">일정표</option>
              </select>
              <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="양식 이름 (예: A센터 기록지)"
                style={{ flex: 1, minWidth: 180, padding: "8px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 14, color: "var(--text)" }} />
              <button className="btn btn-primary" onClick={saveForm} disabled={savingForm || !formName.trim()}>
                {savingForm ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>

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
              {result.spec?.detail && result.spec.detail.length > 0 && (
                <p style={{ margin: 0, fontSize: 13, color: "var(--primary)" }}>＋ 별지(상세 결과표) {result.spec.detail.length}회분 인식</p>
              )}
              {result.spec?.schedule && result.spec.schedule.length > 0 && (
                <p style={{ margin: 0, fontSize: 13, color: "var(--primary)" }}>
                  ＋ 일정표 라벨 칸 {result.spec.schedule.length}개 인식 ({result.spec.schedule.map((s) => s.role).join(", ")})
                </p>
              )}
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
                양식 표 미리보기 — <span style={{ background: "var(--primary-soft)", color: "var(--primary)", padding: "1px 6px", borderRadius: 4, fontWeight: 700 }}>색칠된 칸</span>이 자동 인식된 입력 위치예요. <b>칸을 클릭</b>하면 그 자리에서 역할을 고칠 수 있어요. <b>✨ AI로 칸 자동 매핑</b>으로 규칙이 놓친 칸까지 채울 수 있어요(센터·지자체마다 다른 양식 대응).
              </p>
              {lowConf.size > 0 && (
                <p style={{ margin: 0, fontSize: 12.5, color: "#8A6422" }}>
                  ⚠ AI 신뢰도 낮은 칸 {lowConf.size}개(테두리 주황) — 꼭 클릭해서 맞는지 확인하세요.
                </p>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
                {result.grid.map((cells, ti) => (
                  <div key={ti} style={{ flex: "0 1 auto", maxWidth: "100%" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-soft)", marginBottom: 4 }}>표 {ti + 1}</div>
                    <TableView
                      cells={cells}
                      roleOf={(cell) => effRole(ti, cell)}
                      lowOf={(cell) => lowConf.has(trcKey(ti, cell.r, cell.c))}
                      onCell={(r, c, text, x, y) => setPicker({ t: ti, r, c, text, x, y })}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* 칸 클릭 시 그 자리에 뜨는 역할 선택 팝오버 */}
      {picker && (() => {
        const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
        const vh = typeof window !== "undefined" ? window.innerHeight : 800;
        const below = picker.y < vh * 0.55; // 위쪽 클릭이면 아래로, 아래쪽 클릭이면 위로 펼침
        const left = Math.max(8, Math.min(picker.x + 6, vw - 248));
        const vpos: React.CSSProperties = below
          ? { top: Math.min(picker.y + 6, vh - 60) }
          : { bottom: Math.max(8, vh - picker.y + 6) };
        return (
        <>
          <div onClick={() => setPicker(null)} style={{ position: "fixed", inset: 0, zIndex: 50 }} />
          <div style={{
            position: "fixed", zIndex: 51, left, ...vpos,
            width: 240, maxHeight: "75vh", overflowY: "auto",
            background: "var(--surface)", border: "1px solid var(--primary)",
            borderRadius: 10, boxShadow: "0 6px 20px rgba(0,0,0,0.18)", padding: 10, display: "grid", gap: 8,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-soft)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              “{picker.text || "(빈칸)"}” 역할 지정
            </div>
            <div style={{ fontSize: 11, color: "var(--text-mute)" }}>기본</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SCALAR_ROLES.map((role) => (
                <button key={role} className="btn btn-sm" onClick={() => assignRole(role)}>{role}</button>
              ))}
            </div>
            {ROW_ROLES.length > 0 && (
              <>
                <div style={{ fontSize: 11, color: "var(--text-mute)" }}>회기 행 (칸마다 i번째 회기로 채움)</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {ROW_ROLES.map((role) => (
                    <button key={role} className="btn btn-sm" onClick={() => assignRole(role)}>{role}</button>
                  ))}
                </div>
              </>
            )}
            <div style={{ display: "flex", gap: 6, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
              <button className="btn btn-sm" onClick={() => assignRole("")} style={{ color: "#8A2F1C" }}>역할 비우기</button>
              <button className="btn btn-sm" onClick={() => setPicker(null)}>취소</button>
            </div>
          </div>
        </>
        );
      })()}
    </div>
  );
}

function TableView({ cells, roleOf, lowOf, onCell }: {
  cells: Cell[];
  roleOf: (cell: Cell) => string | null;
  lowOf?: (cell: Cell) => boolean;
  onCell: (r: number, c: number, text: string, x: number, y: number) => void;
}) {
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
        const role = roleOf(cell);
        const hl = !!role;
        const low = hl && !!lowOf?.(cell);
        tds.push(
          <td key={c} colSpan={cell.cs} rowSpan={cell.rs}
            onClick={(e) => onCell(cell.r, cell.c, cell.text, e.clientX, e.clientY)}
            title={low ? "AI 신뢰도 낮음 — 클릭해서 확인/수정" : "클릭해서 역할 지정/해제"}
            style={{
              border: low ? "2px solid #D98324" : "1px solid var(--border)", padding: "3px 5px", fontSize: 11, verticalAlign: "top",
              background: hl ? "var(--primary-soft)" : "var(--surface)",
              minWidth: 40, maxWidth: 160, cursor: "pointer",
            }}>
            {hl && (
              <div style={{ fontSize: 9, fontWeight: 800, color: low ? "#8A6422" : "var(--primary)", marginBottom: 1 }}>{low ? "⚠ " : ""}{role}</div>
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
