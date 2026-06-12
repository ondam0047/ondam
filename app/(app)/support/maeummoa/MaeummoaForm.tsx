"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Session = { date: string; time: string; content: string; memo: string };
type Saved = { id: number; student: string; updatedAt: string; payload: string };
const MAX_SESS = 16; // 4회 × 4장 (페이지당 4회)

const emptyForm = (therapist: string, place: string) => ({
  year: "2025", month: "3", domain: "언어치료", therapist, student: "", school: "", place, weekly: "", goal: "",
});

export default function MaeummoaForm({
  therapist, place, saved = [],
}: { therapist: string; place: string; saved?: Saved[] }) {
  const router = useRouter();
  const [form, setForm] = useState(emptyForm(therapist, place));
  const [sessions, setSessions] = useState<Session[]>([{ date: "", time: "", content: "", memo: "" }]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const setSess = (i: number, k: keyof Session, v: string) =>
    setSessions((arr) => arr.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  const addRow = () => setSessions((a) => (a.length < MAX_SESS ? [...a, { date: "", time: "", content: "", memo: "" }] : a));
  const delRow = (i: number) => setSessions((a) => a.filter((_, j) => j !== i));

  const payload = () => ({
    year: Number(form.year) || 2025, month: Number(form.month) || 1,
    domain: form.domain, therapist: form.therapist, student: form.student,
    school: form.school, place: form.place, weekly: form.weekly, goal: form.goal,
    sessions: sessions.filter((s) => s.date || s.time || s.content || s.memo),
  });

  function newDoc() {
    setForm(emptyForm(therapist, place));
    setSessions([{ date: "", time: "", content: "", memo: "" }]);
    setEditingId(null); setMsg(""); setErr("");
  }

  function loadRecord(r: Saved) {
    try {
      const d = JSON.parse(r.payload);
      setForm({
        year: String(d.year ?? "2025"), month: String(d.month ?? "3"),
        domain: d.domain ?? "언어치료", therapist: d.therapist ?? therapist,
        student: d.student ?? r.student, school: d.school ?? "",
        place: d.place ?? place, weekly: d.weekly ?? "", goal: d.goal ?? "",
      });
      const ss: Session[] = Array.isArray(d.sessions) && d.sessions.length
        ? d.sessions.map((s: Session) => ({ date: s.date ?? "", time: s.time ?? "", content: s.content ?? "", memo: s.memo ?? "" }))
        : [{ date: "", time: "", content: "", memo: "" }];
      setSessions(ss);
      setEditingId(r.id); setErr(""); setMsg(`'${r.student}' 불러옴 — 수정 후 저장/출력하세요.`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch { setErr("저장본을 불러오지 못했어요."); }
  }

  async function save() {
    setErr(""); setMsg("");
    if (!form.student.trim()) { setErr("학생명을 입력하세요."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/support/maeummoa/save", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId ?? undefined, student: form.student, payload: payload() }),
      });
      if (!res.ok) { setErr("저장 실패 (" + res.status + ")"); return; }
      const { id } = await res.json();
      setEditingId(id); setMsg("저장됐어요.");
      router.refresh();
    } catch { setErr("저장 중 오류가 발생했어요."); }
    finally { setBusy(false); }
  }

  async function remove(id: number) {
    if (!confirm("이 저장본을 삭제할까요?")) return;
    await fetch("/api/support/maeummoa/delete", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (editingId === id) newDoc();
    router.refresh();
  }

  async function download() {
    setErr(""); setMsg("");
    if (!form.student.trim()) { setErr("학생명을 입력하세요."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/support/maeummoa/hwpx", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      if (!res.ok) { setErr("출력 실패 (" + res.status + ")"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${form.student || "치료지원일지"}_${String(form.month).padStart(2, "0")}월_치료지원일지.hwpx`;
      a.click(); URL.revokeObjectURL(url);
    } catch { setErr("출력 중 오류가 발생했어요."); }
    finally { setBusy(false); }
  }

  const L: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 700, marginBottom: 4, color: "var(--text-soft)" };
  const cell = (label: string, node: React.ReactNode) => (
    <div className="field" style={{ marginBottom: 12 }}><label style={L}>{label}</label>{node}</div>
  );

  return (
    <>
      <div className="section-head">
        <div>
          <h2>교육청 치료지원 일지 (마음모아)</h2>
          <p>작성 후 한글(.hwpx) 출력. 저장하면 다음에 불러와 수정할 수 있어요. <Link href="/support">← 기타지원사업</Link></p>
        </div>
        <button className="btn btn-sm" style={{ alignSelf: "center" }} onClick={newDoc}>+ 새로 작성</button>
      </div>

      {saved.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <h3 style={{ marginTop: 0, marginBottom: 10 }}>저장된 아동 ({saved.length})</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {saved.map((r) => (
              <div key={r.id}
                style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--border)", borderRadius: 999, padding: "4px 6px 4px 12px",
                  background: editingId === r.id ? "var(--primary-soft)" : "var(--surface)" }}>
                <button className="btn btn-sm btn-ghost" style={{ padding: "2px 4px" }} onClick={() => loadRecord(r)}>
                  <b>{r.student}</b> <span style={{ color: "var(--text-mute)", fontSize: 11 }}>{r.updatedAt}</span>
                </button>
                <button className="btn btn-sm btn-ghost" title="삭제" style={{ padding: "2px 6px", color: "var(--danger, #B8453A)" }} onClick={() => remove(r.id)}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>기본 정보 {editingId && <span className="badge badge-primary" style={{ marginLeft: 6 }}>수정 중</span>}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          {cell("학년도", <input className="input" value={form.year} onChange={set("year")} />)}
          {cell("월", <input className="input" value={form.month} onChange={set("month")} />)}
          {cell("영역", <input className="input" value={form.domain} onChange={set("domain")} />)}
          {cell("치료사", <input className="input" value={form.therapist} onChange={set("therapist")} />)}
          {cell("학생명", <input className="input" value={form.student} onChange={set("student")} placeholder="예: 김도윤" />)}
          {cell("학교 / 학년", <input className="input" value={form.school} onChange={set("school")} placeholder="예: 바로초 / 3학년" />)}
          {cell("장소", <input className="input" value={form.place} onChange={set("place")} />)}
          {cell("요일 / 시간", <input className="input" value={form.weekly} onChange={set("weekly")} placeholder="예: 화 16:00~16:50" />)}
        </div>
        {cell("월 치료지원 목표", <input className="input" value={form.goal} onChange={set("goal")} />)}
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>회기 ({sessions.length}) <span style={{ fontWeight: 400, fontSize: 12, color: "var(--text-mute)" }}>· 4회마다 다음 장</span></h3>
          <button className="btn btn-sm" onClick={addRow} disabled={sessions.length >= MAX_SESS}>+ 회기 추가</button>
        </div>
        {sessions.map((s, i) => (
          <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>{cell("날짜", <input className="input" value={s.date} onChange={(e) => setSess(i, "date", e.target.value)} />)}</div>
              <div style={{ flex: 1 }}>{cell("시간", <input className="input" value={s.time} onChange={(e) => setSess(i, "time", e.target.value)} />)}</div>
              {sessions.length > 1 && <button className="btn btn-sm btn-ghost" style={{ alignSelf: "end", marginBottom: 12 }} onClick={() => delRow(i)}>삭제</button>}
            </div>
            {cell("특이사항 (일시칸 시간 아래 # 로)", <input className="input" value={s.memo} onChange={(e) => setSess(i, "memo", e.target.value)} placeholder="없으면 비워두세요" />)}
            <label style={L}>내용 (활동, 최대 3줄)</label>
            <textarea className="input" rows={3} value={s.content}
              onChange={(e) => setSess(i, "content", e.target.value)}
              style={{ resize: "vertical", lineHeight: 1.6 }} />
          </div>
        ))}
      </div>

      {err && <div className="flash warn" style={{ marginBottom: 12 }}>{err}</div>}
      {msg && <div className="flash" style={{ marginBottom: 12 }}>{msg}</div>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="btn" onClick={save} disabled={busy}>{editingId ? "저장(수정)" : "저장"}</button>
        <button className="btn btn-primary" onClick={download} disabled={busy} style={{ minWidth: 180 }}>
          {busy ? "처리 중…" : "한글(.hwpx) 출력 ↓"}
        </button>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-mute)", marginTop: 10 }}>
        * 한 달치 일지. 회기 4개마다 다음 장으로 넘어가요(최대 4장·16회기). 내용은 한 칸에 최대 3줄. 날짜 25-03-04 · 시간 16:00-16:50 형식.
        저장하면 위 &lt;저장된 아동&gt;에서 불러와 수정할 수 있어요.
      </p>
    </>
  );
}
