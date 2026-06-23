"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewProgramPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setErr("사업 이름을 입력하세요."); return; }
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("name", name.trim());
      if (file) fd.append("file", file);
      const res = await fetch("/api/support/programs", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "생성 실패");
      // 양식을 함께 올렸으면 상세 화면에서 매핑을 바로 열도록 ?map=1
      router.push(`/support/programs/${d.program.id}${file ? "?map=1" : ""}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "오류가 발생했어요.");
      setBusy(false);
    }
  }

  return (
    <>
      <div className="section-head">
        <div>
          <h2>기타지원사업 추가</h2>
          <p>사업 이름을 입력하고, 기록지 양식(.hwpx)을 올리면 바로 출력할 수 있어요.</p>
        </div>
      </div>

      <form onSubmit={submit} style={{ maxWidth: 480 }}>
        <div className="field" style={{ marginBottom: 20 }}>
          <label className="label" htmlFor="prog-name">사업 이름 <span style={{ color: "var(--error)" }}>*</span></label>
          <input
            id="prog-name"
            className="input"
            placeholder="예) 우리아이심리지원, 언어발달지원사업"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            required
          />
        </div>

        <div className="field" style={{ marginBottom: 20 }}>
          <label className="label" htmlFor="prog-file">
            기록지 양식 (.hwpx)
            <span style={{ marginLeft: 8, fontWeight: 400, color: "var(--text-mute)", fontSize: 12 }}>선택 — 나중에 추가 가능</span>
          </label>
          <input
            id="prog-file"
            type="file"
            accept=".hwpx"
            className="input"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--text-mute)", lineHeight: 1.5 }}>
            한글(.hwp)은 미지원 — 한글 프로그램에서 &ldquo;다른 이름으로 저장 → .hwpx&rdquo;로 변환 후 업로드하세요.
          </p>
        </div>

        {err && (
          <p style={{ margin: "0 0 14px", color: "var(--error)", fontSize: 13 }}>{err}</p>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "생성 중…" : "사업 추가"}
          </button>
          <Link href="/support" className="btn btn-ghost">취소</Link>
        </div>
      </form>
    </>
  );
}
