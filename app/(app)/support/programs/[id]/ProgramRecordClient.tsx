"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Session = { date: string; startTime: string; endTime: string; content: string };
type Saved = { id: number; student: string; updatedAt: string; payload: string };

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

  const [studentName, setStudentName] = useState("");
  const [therapistName, setTherapistName] = useState(therapist);
  const [orgName, setOrgName] = useState(org);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [sessions, setSessions] = useState<Session[]>([empty()]);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // 양식 업로드 상태
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [uploadErr, setUploadErr] = useState("");
  const [localHasForm, setLocalHasForm] = useState(hasForm);

  // 사업 삭제
  const [delConfirm, setDelConfirm] = useState(false);

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

  async function print() {
    setErr(""); setMsg("");
    if (!studentName.trim()) { setErr("아동 이름을 입력하세요."); return; }
    if (!localHasForm) { setErr("기록지 양식이 등록되어 있지 않습니다. 아래에서 양식을 등록해주세요."); return; }
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
        setErr(d.error ?? `오류 (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
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

  async function uploadForm(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadErr(""); setUploadMsg(""); setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/support/programs/${programId}`, { method: "PATCH", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "업로드 실패");
      setLocalHasForm(!!d.program.formSpec);
      setUploadMsg("양식이 등록됐어요. 이제 기록지를 출력할 수 있어요.");
      router.refresh();
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : "오류가 발생했어요.");
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function deleteProgram() {
    const res = await fetch(`/api/support/programs/${programId}`, { method: "DELETE" });
    if (res.ok) router.push("/support");
    else setErr("삭제 실패");
  }

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
            )
          }
        </div>
      </div>

      {/* 양식 등록 영역 */}
      <div style={{ background: localHasForm ? "var(--surface-success, var(--surface))" : "var(--surface-warn, var(--surface))", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 18px", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: 14 }}>
              {localHasForm ? "✓ 양식 등록됨" : "양식 미등록"}
            </span>
            <span style={{ marginLeft: 10, fontSize: 12, color: "var(--text-mute)" }}>
              {localHasForm ? ".hwpx 양식이 연결되어 있어요." : ".hwpx 기록지 양식을 등록하면 출력 가능해요."}
            </span>
          </div>
          <label style={{ cursor: "pointer" }}>
            <span className="btn btn-ghost" style={{ fontSize: 13, pointerEvents: "none" }}>
              {uploading ? "업로드 중…" : localHasForm ? "양식 교체" : "양식 등록"}
            </span>
            <input ref={fileRef} type="file" accept=".hwpx" hidden onChange={uploadForm} disabled={uploading} />
          </label>
        </div>
        {uploadMsg && <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--success, green)" }}>{uploadMsg}</p>}
        {uploadErr && <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--error)" }}>{uploadErr}</p>}
        {!localHasForm && (
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--text-mute)", lineHeight: 1.5 }}>
            .hwp는 미지원 — 한글에서 &ldquo;다른 이름으로 저장 → .hwpx&rdquo;로 변환 후 업로드하세요.
          </p>
        )}
      </div>

      {/* 기록지 작성 폼 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 32, alignItems: "start" }}>
        {/* 기본 정보 */}
        <div>
          <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: "var(--text-soft)", letterSpacing: "0.05em", textTransform: "uppercase" }}>기본 정보</p>

          {[
            { label: "아동 이름", value: studentName, set: setStudentName, placeholder: "홍길동", required: true },
            { label: "담당 치료사", value: therapistName, set: setTherapistName, placeholder: "" },
            { label: "기관명", value: orgName, set: setOrgName, placeholder: "" },
          ].map(({ label, value, set, placeholder, required }) => (
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
                <input className="input" placeholder="날짜 (예 3/5)" value={s.date} onChange={(e) => setSess(i, "date", e.target.value)} style={{ fontSize: 12 }} />
                <input className="input" placeholder="시작" value={s.startTime} onChange={(e) => setSess(i, "startTime", e.target.value)} style={{ fontSize: 12, textAlign: "center" }} />
                <input className="input" placeholder="종료" value={s.endTime} onChange={(e) => setSess(i, "endTime", e.target.value)} style={{ fontSize: 12, textAlign: "center" }} />
                <input className="input" placeholder="내용/결과" value={s.content} onChange={(e) => setSess(i, "content", e.target.value)} style={{ fontSize: 12 }} />
                <button onClick={() => delRow(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-mute)", fontSize: 14, padding: 0 }} title="삭제">×</button>
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
              <button
                key={r.id}
                onClick={() => loadRecord(r)}
                style={{
                  textAlign: "left", padding: "12px 14px", borderRadius: 10,
                  border: `2px solid ${editingId === r.id ? "var(--primary)" : "var(--border)"}`,
                  background: editingId === r.id ? "var(--primary-light, var(--surface))" : "var(--surface)",
                  cursor: "pointer", display: "block", width: "100%",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14 }}>{r.student}</div>
                <div style={{ fontSize: 11, color: "var(--text-mute)", marginTop: 2 }}>{r.updatedAt}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
