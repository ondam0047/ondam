"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ── 매핑 관련 타입 ──────────────────────────────────────────────
type Cell = { r: number; c: number; cs: number; rs: number; text: string; role: string | null };
type MapResult = { coverage: Record<string, boolean>; grid: Cell[][] };
type Picker = { t: number; r: number; c: number; text: string; x: number; y: number };

const FIELD_LABEL: Record<string, string> = {
  org: "기관명", name: "이름", therapist: "치료사",
  date: "날짜", start: "시작시간", end: "종료시간", result: "결과표",
};
const SCALAR_ROLES = ["기관명", "대상자이름", "치료사이름", "생년월일"];
const ROW_ROLES    = ["날짜", "시작", "종료", "결과"];

// ── 기록지 회기 타입 ────────────────────────────────────────────
type Session = { date: string; startTime: string; endTime: string; content: string };
type Saved   = { id: number; student: string; updatedAt: string; payload: string };

const empty = (): Session => ({ date: "", startTime: "", endTime: "", content: "" });

type Props = {
  programId: number;
  programName: string;
  hasForm: boolean;
  therapist: string;
  org: string;
  saved: Saved[];
};

export default function ProgramRecordClient({ programId, programName, hasForm, therapist, org, saved }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  // ── 기록지 작성 ─────────────────────────────────────────────
  const [studentName,   setStudentName]   = useState("");
  const [therapistName, setTherapistName] = useState(therapist);
  const [orgName,       setOrgName]       = useState(org);
  const [year,  setYear]  = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [sessions, setSessions] = useState<Session[]>([empty()]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy,  setBusy]  = useState(false);
  const [msg,   setMsg]   = useState("");
  const [err,   setErr]   = useState("");

  // ── 양식 등록/매핑 ──────────────────────────────────────────
  const [localHasForm, setLocalHasForm] = useState(hasForm);
  const [mapFile,      setMapFile]      = useState<File | null>(null);
  const [mapResult,    setMapResult]    = useState<MapResult | null>(null);
  const [mapOverrides, setMapOverrides] = useState<Record<string, string>>({});
  const [picker,       setPicker]       = useState<Picker | null>(null);
  const [analyzing,    setAnalyzing]    = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [mapMsg,       setMapMsg]       = useState("");
  const [mapErr,       setMapErr]       = useState("");

  // ── 삭제 확인 ───────────────────────────────────────────────
  const [delConfirm, setDelConfirm] = useState(false);

  // ── 세션 조작 ───────────────────────────────────────────────
  const setSess = (i: number, k: keyof Session, v: string) =>
    setSessions((a) => a.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  const addRow = () => setSessions((a) => [...a, empty()]);
  const delRow = (i: number) => setSessions((a) => a.filter((_, j) => j !== i));

  function newDoc() {
    setStudentName(""); setSessions([empty()]); setEditingId(null); setMsg(""); setErr("");
  }

  function loadRecord(r: Saved) {
    try {
      const d = JSON.parse(r.payload);
      setStudentName(d.studentName ?? r.student);
      setTherapistName(d.therapistName ?? therapist);
      setOrgName(d.org ?? org);
      setYear(String(d.year ?? new Date().getFullYear()));
      setMonth(String(d.month ?? new Date().getMonth() + 1));
      const ss: Session[] = Array.isArray(d.sessions) && d.sessions.length
        ? d.sessions.map((s: Session) => ({
            date: s.date ?? "", startTime: s.startTime ?? "",
            endTime: s.endTime ?? "", content: s.content ?? "",
          }))
        : [empty()];
      setSessions(ss);
      setEditingId(r.id); setErr(""); setMsg(`'${r.student}' 불러옴 — 수정 후 출력하세요.`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch { setErr("저장본을 불러오지 못했어요."); }
  }

  // ── 기록지 출력 ─────────────────────────────────────────────
  async function print() {
    setErr(""); setMsg("");
    if (!studentName.trim()) { setErr("아동 이름을 입력하세요."); return; }
    if (!localHasForm) { setErr("기록지 양식이 등록되어 있지 않습니다."); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/support/programs/${programId}/record`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName: studentName.trim(),
          therapistName: therapistName.trim(),
          org: orgName.trim(),
          year: Number(year) || new Date().getFullYear(),
          month: Number(month) || new Date().getMonth() + 1,
          sessions: sessions.filter((s) => s.date || s.content),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? `오류 (${res.status})`); return;
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      const disp = res.headers.get("Content-Disposition") ?? "";
      const match = disp.match(/filename\*=UTF-8''(.+)/);
      a.href = url;
      a.download = match ? decodeURIComponent(match[1]) : `${programName}_${studentName}.hwpx`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg("출력 파일이 다운로드됐어요.");
      router.refresh();
    } catch { setErr("출력 중 오류가 발생했어요."); }
    finally { setBusy(false); }
  }

  // ── 양식 파일 선택 → 자동분석 ───────────────────────────────
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMapFile(file);
    setMapResult(null);
    setMapOverrides({});
    setPicker(null);
    setMapMsg(""); setMapErr("");
    setAnalyzing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/forms/analyze", { method: "POST", body: fd });
      const d   = await res.json();
      if (!res.ok) throw new Error(d.error ?? "분석 실패");
      setMapResult(d);
    } catch (e) {
      setMapErr(e instanceof Error ? e.message : "분석 중 오류가 발생했어요.");
    } finally {
      setAnalyzing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // ── 매핑 저장 ────────────────────────────────────────────────
  async function saveMapping() {
    if (!mapFile) return;
    setSaving(true); setMapErr(""); setMapMsg("");
    try {
      const overridesArray = Object.entries(mapOverrides)
        .map(([k, role]) => { const [t, r, c] = k.split(",").map(Number); return { table: t, row: r, col: c, role }; });
      const fd = new FormData();
      fd.append("file", mapFile);
      if (overridesArray.length) fd.append("overrides", JSON.stringify(overridesArray));
      const res = await fetch(`/api/support/programs/${programId}`, { method: "PATCH", body: fd });
      const d   = await res.json();
      if (!res.ok) throw new Error(d.error ?? "저장 실패");
      setLocalHasForm(!!d.program.formSpec);
      setMapMsg("양식이 저장됐어요. 이제 기록지를 출력할 수 있어요.");
      setMapFile(null); setMapResult(null); setMapOverrides({});
      router.refresh();
    } catch (e) {
      setMapErr(e instanceof Error ? e.message : "저장 중 오류가 발생했어요.");
    } finally { setSaving(false); }
  }

  function cancelMapping() {
    setMapFile(null); setMapResult(null); setMapOverrides({});
    setMapMsg(""); setMapErr(""); setPicker(null);
  }

  // ── 셀 역할 보정 ─────────────────────────────────────────────
  const effRole = (ti: number, cell: Cell): string | null => {
    const k = `${ti},${cell.r},${cell.c}`;
    return k in mapOverrides ? (mapOverrides[k] || null) : cell.role;
  };
  function assignRole(role: string) {
    if (!picker) return;
    const k = `${picker.t},${picker.r},${picker.c}`;
    setMapOverrides({ ...mapOverrides, [k]: role });
    setPicker(null);
  }

  // ── 사업 삭제 ────────────────────────────────────────────────
  async function deleteProgram() {
    const res = await fetch(`/api/support/programs/${programId}`, { method: "DELETE" });
    if (res.ok) router.push("/support");
    else setErr("삭제 실패");
  }

  const missing = mapResult
    ? Object.entries(mapResult.coverage).filter(([, v]) => !v).map(([k]) => FIELD_LABEL[k] ?? k)
    : [];

  return (
    <>
      {/* 헤더 */}
      <div className="section-head">
        <div>
          <h2>{programName}</h2>
          <p>기록지를 작성하고 한글(.hwpx)로 출력해요.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/support" className="btn btn-ghost" style={{ fontSize: 13 }}>← 목록</Link>
          {!delConfirm
            ? <button className="btn btn-ghost" style={{ fontSize: 13, color: "var(--error)" }} onClick={() => setDelConfirm(true)}>사업 삭제</button>
            : (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--error)" }}>정말 삭제?</span>
                <button className="btn btn-ghost" style={{ fontSize: 12, color: "var(--error)" }} onClick={deleteProgram}>삭제</button>
                <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setDelConfirm(false)}>취소</button>
              </span>
            )}
        </div>
      </div>

      {/* 양식 등록 영역 */}
      <div style={{ border: "1px solid var(--border)", borderRadius: 12, marginBottom: 24, overflow: "hidden" }}>
        {/* 상태 바 */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap",
          gap: 10, padding: "12px 16px",
          background: localHasForm ? "var(--surface-success, var(--surface))" : "var(--surface-warn, var(--surface))",
        }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{localHasForm ? "✓ 양식 등록됨" : "양식 미등록"}</span>
            <span style={{ marginLeft: 10, fontSize: 12, color: "var(--text-mute)" }}>
              {localHasForm ? ".hwpx 양식이 연결되어 있어요." : ".hwpx 기록지 양식을 등록하면 출력 가능해요."}
            </span>
          </div>
          {!mapFile && (
            <label style={{ cursor: "pointer" }}>
              <span className="btn btn-ghost" style={{ fontSize: 13, pointerEvents: "none" }}>
                {analyzing ? "분석 중…" : localHasForm ? "양식 교체" : "양식 등록"}
              </span>
              <input ref={fileRef} type="file" accept=".hwpx" hidden onChange={handleFileSelect} disabled={analyzing} />
            </label>
          )}
        </div>

        {/* 분석 전 안내 */}
        {!mapFile && !localHasForm && (
          <p style={{ margin: 0, padding: "8px 16px", fontSize: 12, color: "var(--text-mute)", lineHeight: 1.5, borderTop: "1px solid var(--border)" }}>
            .hwp는 미지원 — 한글에서 &ldquo;다른 이름으로 저장 → .hwpx&rdquo;로 변환 후 업로드하세요.
          </p>
        )}

        {mapMsg && <p style={{ margin: 0, padding: "8px 16px", fontSize: 12, color: "var(--success, green)", borderTop: "1px solid var(--border)" }}>{mapMsg}</p>}
        {mapErr && <p style={{ margin: 0, padding: "8px 16px", fontSize: 12, color: "var(--error)", borderTop: "1px solid var(--border)" }}>{mapErr}</p>}

        {/* 분석 결과 + 매핑 편집기 */}
        {mapFile && mapResult && (
          <div style={{ borderTop: "1px solid var(--border)", padding: 16, display: "grid", gap: 16 }}>
            {/* 커버리지 */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>자동 매핑 결과</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {Object.entries(mapResult.coverage).map(([k, ok]) => (
                  <span key={k} style={{
                    fontSize: 12, padding: "3px 9px", borderRadius: 20,
                    background: ok ? "#DDEBD3" : "#F6E4DE",
                    color: ok ? "#3F6132" : "#8A2F1C",
                    fontWeight: 600,
                  }}>
                    {ok ? "✓" : "✗"} {FIELD_LABEL[k] ?? k}
                  </span>
                ))}
              </div>
              {missing.length > 0
                ? <p style={{ margin: "8px 0 0", fontSize: 12, color: "#8A6422" }}>⚠ 못 찾은 칸: {missing.join(", ")} — 아래 표에서 해당 칸을 클릭해 역할을 직접 지정하세요.</p>
                : <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--primary)" }}>✓ 핵심 칸을 모두 인식했어요.</p>
              }
            </div>

            {/* 표 그리드 */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>양식 미리보기 — 칸을 클릭해 역할을 수정할 수 있어요</div>
              <div style={{ overflowX: "auto" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
                  {mapResult.grid.map((cells, ti) => (
                    <div key={ti} style={{ flex: "0 1 auto" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-mute)", marginBottom: 4 }}>표 {ti + 1}</div>
                      <TableView
                        cells={cells}
                        roleOf={(cell) => effRole(ti, cell)}
                        onCell={(r, c, text, x, y) => setPicker({ t: ti, r, c, text, x, y })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 저장/취소 */}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" onClick={saveMapping} disabled={saving}>
                {saving ? "저장 중…" : "이 매핑으로 저장"}
              </button>
              <button className="btn btn-ghost" onClick={cancelMapping}>취소</button>
            </div>
          </div>
        )}
      </div>

      {/* 기록지 작성 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 32, alignItems: "start" }}>
        <div>
          <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: "var(--text-soft)", letterSpacing: "0.05em", textTransform: "uppercase" }}>기본 정보</p>

          {([
            { label: "아동 이름", value: studentName, set: setStudentName, placeholder: "홍길동", required: true },
            { label: "담당 치료사", value: therapistName, set: setTherapistName, placeholder: "" },
            { label: "기관명", value: orgName, set: setOrgName, placeholder: "" },
          ] as { label: string; value: string; set: (v: string) => void; placeholder: string; required?: boolean }[]).map(({ label, value, set, placeholder, required }) => (
            <div key={label} className="field" style={{ marginBottom: 12 }}>
              <label className="label">{label}{required && <span style={{ color: "var(--error)", marginLeft: 2 }}>*</span>}</label>
              <input className="input" value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder} />
            </div>
          ))}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div className="field">
              <label className="label">연도</label>
              <input className="input" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2025" style={{ textAlign: "center" }} />
            </div>
            <div className="field">
              <label className="label">월</label>
              <input className="input" value={month} onChange={(e) => setMonth(e.target.value)} placeholder="1" style={{ textAlign: "center" }} />
            </div>
          </div>

          {msg && <p style={{ marginTop: 12, fontSize: 12, color: "var(--success, green)" }}>{msg}</p>}
          {err && <p style={{ marginTop: 12, fontSize: 12, color: "var(--error)" }}>{err}</p>}

          <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
            <button className="btn btn-primary" onClick={print} disabled={busy || !localHasForm} style={{ flex: 1 }}>
              {busy ? "생성 중…" : "기록지 출력"}
            </button>
            <button className="btn btn-ghost" onClick={newDoc} style={{ fontSize: 13 }}>초기화</button>
          </div>
        </div>

        {/* 회기 목록 */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--text-soft)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
              회기 ({sessions.length})
            </p>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={addRow}>+ 행 추가</button>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {sessions.map((s, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 1fr 28px", gap: 6, alignItems: "center" }}>
                <input className="input" placeholder="날짜" value={s.date} onChange={(e) => setSess(i, "date", e.target.value)} style={{ fontSize: 12 }} />
                <input className="input" placeholder="시작" value={s.startTime} onChange={(e) => setSess(i, "startTime", e.target.value)} style={{ fontSize: 12, textAlign: "center" }} />
                <input className="input" placeholder="종료" value={s.endTime} onChange={(e) => setSess(i, "endTime", e.target.value)} style={{ fontSize: 12, textAlign: "center" }} />
                <input className="input" placeholder="내용/결과" value={s.content} onChange={(e) => setSess(i, "content", e.target.value)} style={{ fontSize: 12 }} />
                <button onClick={() => delRow(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-mute)", fontSize: 14, padding: 0 }}>×</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 저장된 기록 */}
      {saved.length > 0 && (
        <div style={{ marginTop: 40 }}>
          <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: "var(--text-soft)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
            저장된 기록 ({saved.length})
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
            {saved.map((r) => (
              <button key={r.id} onClick={() => loadRecord(r)} style={{
                textAlign: "left", padding: "12px 14px", borderRadius: 10,
                border: `2px solid ${editingId === r.id ? "var(--primary)" : "var(--border)"}`,
                background: editingId === r.id ? "var(--primary-light, var(--surface))" : "var(--surface)",
                cursor: "pointer", display: "block", width: "100%",
              }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{r.student}</div>
                <div style={{ fontSize: 11, color: "var(--text-mute)", marginTop: 2 }}>{r.updatedAt}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 역할 선택 팝오버 */}
      {picker && (() => {
        const vw = typeof window !== "undefined" ? window.innerWidth  : 1200;
        const vh = typeof window !== "undefined" ? window.innerHeight : 800;
        const below = picker.y < vh * 0.55;
        const left  = Math.max(8, Math.min(picker.x + 6, vw - 250));
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
              borderRadius: 10, boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
              padding: 10, display: "grid", gap: 8,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-soft)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                &ldquo;{picker.text || "(빈칸)"}&rdquo; 역할 지정
              </div>
              <div style={{ fontSize: 11, color: "var(--text-mute)" }}>기본</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {SCALAR_ROLES.map((role) => (
                  <button key={role} className="btn btn-sm" onClick={() => assignRole(role)}>{role}</button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-mute)" }}>회기 행</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {ROW_ROLES.map((role) => (
                  <button key={role} className="btn btn-sm" onClick={() => assignRole(role)}>{role}</button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                <button className="btn btn-sm" onClick={() => assignRole("")} style={{ color: "var(--error)" }}>역할 비우기</button>
                <button className="btn btn-sm" onClick={() => setPicker(null)}>취소</button>
              </div>
            </div>
          </>
        );
      })()}
    </>
  );
}

// ── 표 그리드 렌더러 ─────────────────────────────────────────────
function TableView({ cells, roleOf, onCell }: {
  cells: Cell[];
  roleOf: (cell: Cell) => string | null;
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
        tds.push(
          <td key={c} colSpan={cell.cs} rowSpan={cell.rs}
            onClick={(e) => onCell(cell.r, cell.c, cell.text, e.clientX, e.clientY)}
            title="클릭해서 역할 지정/해제"
            style={{
              border: "1px solid var(--border)", padding: "3px 5px", fontSize: 11, verticalAlign: "top",
              background: role ? "var(--primary-soft)" : "var(--surface)",
              minWidth: 36, maxWidth: 160, cursor: "pointer",
            }}>
            {role && <div style={{ fontSize: 9, fontWeight: 800, color: "var(--primary)", marginBottom: 1 }}>{role}</div>}
            <div style={{ color: cell.text ? "var(--text)" : "var(--text-mute)", whiteSpace: "normal", wordBreak: "break-all" }}>
              {cell.text || (role ? "" : "·")}
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
