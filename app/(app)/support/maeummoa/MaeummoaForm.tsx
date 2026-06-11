"use client";

import { useState } from "react";
import Link from "next/link";

type Session = { date: string; time: string; content: string };
const MAX = 3;

export default function MaeummoaForm({ therapist, place }: { therapist: string; place: string }) {
  const [form, setForm] = useState({
    year: "2025",
    month: "3",
    domain: "언어치료",
    therapist,
    student: "",
    school: "",
    place,
    weekly: "",
    goal: "",
  });
  const [sessions, setSessions] = useState<Session[]>([{ date: "", time: "", content: "" }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const setSess = (i: number, k: keyof Session, v: string) =>
    setSessions((arr) => arr.map((s, j) => (j === i ? { ...s, [k]: v } : s)));

  const addRow = () => setSessions((a) => (a.length < MAX ? [...a, { date: "", time: "", content: "" }] : a));
  const delRow = (i: number) => setSessions((a) => a.filter((_, j) => j !== i));

  async function download() {
    setErr("");
    if (!form.student.trim()) { setErr("학생명을 입력하세요."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/support/maeummoa/hwpx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: Number(form.year) || 2025,
          month: Number(form.month) || 1,
          domain: form.domain,
          therapist: form.therapist,
          student: form.student,
          school: form.school,
          place: form.place,
          weekly: form.weekly,
          goal: form.goal,
          sessions: sessions.filter((s) => s.date || s.time || s.content),
        }),
      });
      if (!res.ok) { setErr("출력 실패 (" + res.status + ")"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${form.student || "치료지원일지"}_${String(form.month).padStart(2, "0")}월_치료지원일지.hwpx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErr("출력 중 오류가 발생했어요.");
    } finally {
      setBusy(false);
    }
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
          <p>작성 후 한글(.hwpx)로 출력해요. <Link href="/support">← 기타지원사업</Link></p>
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>기본 정보</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          {cell("학년도", <input className="input" value={form.year} onChange={set("year")} />)}
          {cell("월", <input className="input" value={form.month} onChange={set("month")} />)}
          {cell("영역", <input className="input" value={form.domain} onChange={set("domain")} />)}
          {cell("치료사", <input className="input" value={form.therapist} onChange={set("therapist")} />)}
          {cell("학생명", <input className="input" value={form.student} onChange={set("student")} placeholder="예: 김도윤" />)}
          {cell("학교 / 학년", <input className="input" value={form.school} onChange={set("school")} placeholder="예: 가람초 / 3학년" />)}
          {cell("장소", <input className="input" value={form.place} onChange={set("place")} />)}
          {cell("요일 / 시간", <input className="input" value={form.weekly} onChange={set("weekly")} placeholder="예: 화 16:00~16:50" />)}
        </div>
        {cell("월 치료지원 목표", <input className="input" value={form.goal} onChange={set("goal")} placeholder="예: 기초 어휘 확장, 두 낱말 조합하여 표현하기" />)}
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>회기 ({sessions.length}/{MAX})</h3>
          <button className="btn btn-sm" onClick={addRow} disabled={sessions.length >= MAX}>+ 회기 추가</button>
        </div>
        {sessions.map((s, i) => (
          <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>{cell("날짜", <input className="input" value={s.date} onChange={(e) => setSess(i, "date", e.target.value)} placeholder="25-03-04" />)}</div>
              <div style={{ flex: 1 }}>{cell("시간", <input className="input" value={s.time} onChange={(e) => setSess(i, "time", e.target.value)} placeholder="16:00-16:50" />)}</div>
              {sessions.length > 1 && <button className="btn btn-sm btn-ghost" style={{ alignSelf: "end", marginBottom: 12 }} onClick={() => delRow(i)}>삭제</button>}
            </div>
            <label style={L}>내용 (최대 3줄 · 특이사항은 # 로 시작)</label>
            <textarea
              className="input" rows={3} value={s.content}
              onChange={(e) => setSess(i, "content", e.target.value)}
              placeholder={"- 어휘 확장 : 사과, 바나나, 포도\n- 두 낱말 조합하여 요구하기\n# 보호자 카드 미소지로 당일 미결제"}
              style={{ resize: "vertical", lineHeight: 1.6 }}
            />
          </div>
        ))}
      </div>

      {err && <div className="flash warn" style={{ marginBottom: 12 }}>{err}</div>}
      <button className="btn btn-primary" onClick={download} disabled={busy} style={{ minWidth: 200 }}>
        {busy ? "생성 중…" : "한글(.hwpx) 출력 ↓"}
      </button>
      <p style={{ fontSize: 12, color: "var(--text-mute)", marginTop: 10 }}>
        * 최소본(v1): 한 달·최대 3회기·내용 3줄. (다중 월·일정 자동 불러오기는 추후)
      </p>
    </>
  );
}
