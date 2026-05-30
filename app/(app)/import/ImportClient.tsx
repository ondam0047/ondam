"use client";

import { useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { WEEK } from "@/lib/constants";

type ChildServiceRow = {
  name: string;
  birthDate?: string;
  serviceType: string;
  mgmtNumber?: string;
  therapistName?: string;
  defaultSlot?: string;
  defaultDays?: string;
  defaultUnit?: number;
  defaultTarget?: number;
  memo?: string;
};

type TherapistRow = {
  name: string;
  phone?: string;
};

type Mode = "child" | "therapist";

function findColIndex(header: unknown[], candidates: string[]): number {
  for (let i = 0; i < header.length; i++) {
    const h = String(header[i] ?? "").trim();
    if (!h) continue;
    if (candidates.some((c) => h.includes(c))) return i;
  }
  return -1;
}

function guessServiceType(raw: string, available: string[]): string {
  const s = String(raw).trim();
  for (const t of available) {
    if (s.includes(t.slice(0, 2))) return t;
  }
  if (s.includes("언어") || s.includes("말")) return available.find((t) => t.includes("언어")) ?? available[0];
  if (s.includes("놀이")) return available.find((t) => t.includes("놀이")) ?? available[0];
  if (s.includes("감각")) return available.find((t) => t.includes("감각")) ?? available[0];
  return available[0];
}

function parseDays(raw: string): string {
  const out: number[] = [];
  const s = String(raw);
  for (let i = 0; i < WEEK.length; i++) {
    if (s.includes(WEEK[i])) out.push(i);
  }
  return [...new Set(out)].sort().join(",");
}

// "10:00-10:50" 또는 "1:30-2:20" → "10:00~10:50" / "13:30~14:20" (오후 추정)
function normalizeSlot(raw: string): string | undefined {
  const s = String(raw).trim().replace(/\s/g, "");
  const m = s.match(/(\d{1,2}):(\d{2})[~\-](\d{1,2}):(\d{2})/);
  if (!m) return undefined;
  let h1 = +m[1], h2 = +m[3];
  const m1 = +m[2], m2 = +m[4];
  // 7~12 는 오전 그대로. 1~6 은 오후로 변환. 9 이상이면 24시간제 가정.
  if (h1 < 7) h1 += 12;
  if (h2 < 7) h2 += 12;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h1)}:${pad(m1)}~${pad(h2)}:${pad(m2)}`;
}

export default function ImportClient({ serviceTypes }: { serviceTypes: string[] }) {
  const [mode, setMode] = useState<Mode>("child");
  const [children, setChildren] = useState<ChildServiceRow[] | null>(null);
  const [therapists, setTherapists] = useState<TherapistRow[] | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  function handleFile(file: File) {
    setError("");
    setSavedMsg("");
    const r = new FileReader();
    r.onload = (ev) => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target!.result as ArrayBuffer), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });

        // 1) 전자바우처 '서비스제공내역' — 자동 감지
        const eVoucherHeaderIdx = rows.findIndex((r) =>
          Array.isArray(r) && r.includes("대상자") && r.includes("생년월일") && r.includes("승인번호")
        );

        if (eVoucherHeaderIdx >= 0) {
          const H = rows[eVoucherHeaderIdx] as string[];
          const col = (n: string) => H.indexOf(n);
          const ci = { name: col("대상자"), birth: col("생년월일") };
          let therapistFromHeader = "";
          for (let i = 0; i < eVoucherHeaderIdx; i++) {
            const r = rows[i];
            if (!Array.isArray(r)) continue;
            const k = r.indexOf("제공인력 이름");
            if (k >= 0) { therapistFromHeader = String(r[k + 1] ?? "").trim(); break; }
          }

          const map = new Map<string, ChildServiceRow>();
          for (let i = eVoucherHeaderIdx + 1; i < rows.length; i++) {
            const row = rows[i] as unknown[];
            if (!row) continue;
            const name = String(row[ci.name] ?? "").trim();
            if (!name) continue;
            const birth = ci.birth >= 0 ? String(row[ci.birth]).trim() : "";
            const key = `${name}|${birth}|${therapistFromHeader}`;
            if (!map.has(key)) {
              map.set(key, {
                name,
                birthDate: birth || undefined,
                serviceType: serviceTypes[0],
                therapistName: therapistFromHeader || undefined,
              });
            }
          }

          if (map.size === 0) {
            setError("서비스제공내역에서 대상자 정보를 찾지 못했어요.");
            return;
          }
          setMode("child");
          setChildren([...map.values()]);
          setTherapists(null);
          return;
        }

        // 2) 일반 양식: 첫 비어있지 않은 행 → 헤더
        const headerIdx = rows.findIndex((r) => Array.isArray(r) && r.some((c) => String(c).trim()));
        if (headerIdx < 0) {
          setError("빈 시트로 보여요.");
          return;
        }
        const header = rows[headerIdx];

        if (mode === "child") {
          const ci = {
            name: findColIndex(header, ["성명", "이름", "아동"]),
            birthDate: findColIndex(header, ["생년월일", "생일"]),
            serviceType: findColIndex(header, ["서비스", "치료", "분야"]),
            mgmtNumber: findColIndex(header, ["관리번호", "사회복지"]),
            therapistName: findColIndex(header, ["담당", "치료사"]),
            defaultSlot: findColIndex(header, ["시간"]),
            defaultDays: findColIndex(header, ["요일", "수업일"]),
            defaultUnit: findColIndex(header, ["단가"]),
            defaultTarget: findColIndex(header, ["목표", "회기수", "주기"]),
            memo: findColIndex(header, ["메모", "비고"]),
          };
          if (ci.name < 0) {
            setError("'성명' 또는 '이름' 컬럼을 찾지 못했어요. 첫 줄에 컬럼명이 있는지 확인해주세요.");
            return;
          }
          const data: ChildServiceRow[] = [];
          for (let i = headerIdx + 1; i < rows.length; i++) {
            const row = rows[i] as unknown[];
            if (!row) continue;
            const name = String(row[ci.name] ?? "").trim();
            if (!name) continue;
            const unit = ci.defaultUnit >= 0
              ? Number(String(row[ci.defaultUnit]).replace(/[^\d]/g, "")) || undefined
              : undefined;
            const target = ci.defaultTarget >= 0
              ? Number(String(row[ci.defaultTarget]).replace(/[^\d]/g, "")) || undefined
              : undefined;
            data.push({
              name,
              birthDate: ci.birthDate >= 0 ? String(row[ci.birthDate]).trim() || undefined : undefined,
              serviceType: ci.serviceType >= 0
                ? guessServiceType(String(row[ci.serviceType]), serviceTypes)
                : serviceTypes[0],
              mgmtNumber: ci.mgmtNumber >= 0 ? String(row[ci.mgmtNumber]).trim() || undefined : undefined,
              therapistName: ci.therapistName >= 0 ? String(row[ci.therapistName]).trim() || undefined : undefined,
              defaultSlot: ci.defaultSlot >= 0 ? normalizeSlot(String(row[ci.defaultSlot])) : undefined,
              defaultDays: ci.defaultDays >= 0 ? parseDays(String(row[ci.defaultDays])) || undefined : undefined,
              defaultUnit: unit,
              defaultTarget: target,
              memo: ci.memo >= 0 ? String(row[ci.memo]).trim() || undefined : undefined,
            });
          }
          setChildren(data);
          setTherapists(null);
        } else {
          const ci = {
            name: findColIndex(header, ["이름", "성명", "치료사"]),
            phone: findColIndex(header, ["전화", "번호", "연락처"]),
          };
          if (ci.name < 0) {
            setError("'이름' 또는 '성명' 컬럼을 찾지 못했어요.");
            return;
          }
          const data: TherapistRow[] = [];
          for (let i = headerIdx + 1; i < rows.length; i++) {
            const row = rows[i] as unknown[];
            if (!row) continue;
            const name = String(row[ci.name] ?? "").trim();
            if (!name) continue;
            data.push({
              name,
              phone: ci.phone >= 0 ? String(row[ci.phone]).trim() || undefined : undefined,
            });
          }
          setTherapists(data);
          setChildren(null);
        }
      } catch (e) {
        setError("파일 읽는 중 오류: " + (e instanceof Error ? e.message : String(e)));
      }
    };
    r.readAsArrayBuffer(file);
  }

  async function save() {
    setSaving(true);
    setSavedMsg("");
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, children, therapists }),
      });
      const j = await res.json();
      if (!res.ok) {
        alert("저장 실패: " + (j.error ?? res.status));
        return;
      }
      const detail = `(전체 ${j.totalRows}건 · 신규 아동 ${j.createdChild}명 · 신규 서비스 ${j.createdService}건 · 중복 ${j.skippedDupe}건 · 이름누락 ${j.skippedNoName}건)`;
      setSavedMsg(`✓ ${j.savedCount}건 저장 완료. ${detail}`);
      setChildren(null);
      setTherapists(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="section-head">
        <div>
          <h2>엑셀 가져오기</h2>
          <p>센터에서 쓰던 엑셀을 그대로 올리면 컬럼명을 자동으로 인식해서 등록합니다.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>무엇을 등록할까요?</h2>
        </div>
        <div className="card-body">
          <div className="tip" style={{ marginBottom: 14 }}>
            <span>
              컬럼: <b>성명 · 생년월일 · 서비스 · 담당 · 시간 · 요일</b>{" "}
              (단가·목표·메모는 선택). 한 아동이 여러 서비스를 받으면 줄을 여러 개 적으면 같은 사람으로 묶입니다.<br />
              💡 <b>전자바우처 '서비스제공내역' 엑셀</b>도 그대로 올리면 자동으로 명단을 추출합니다.<br />
              💡 양식이 없으면 아래 <b>[기본 양식 다운로드]</b> 를 받아 채워주세요.
            </span>
          </div>

          {mode === "child" && (
            <div style={{ marginBottom: 12 }}>
              <a className="btn btn-ghost" href="/api/import/template" download>
                📋 기본 양식 다운로드 (.xlsx)
              </a>
            </div>
          )}

          <input
            type="file"
            accept=".xls,.xlsx"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />

          {error && <div className="flash warn" style={{ marginTop: 12 }}>{error}</div>}
          {savedMsg && <div className="flash ok" style={{ marginTop: 12 }}>{savedMsg}</div>}
        </div>
      </div>

      {children && children.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2>미리보기 — {children.length}건 (같은 아동의 여러 서비스 포함)</h2>
            <span style={{ flex: 1 }} />
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? "저장 중..." : "이대로 저장"}
            </button>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>성명</th><th>생년월일</th><th>서비스</th>
                  <th>담당</th><th>시간</th><th>요일</th><th>목표</th>
                </tr>
              </thead>
              <tbody>
                {children.map((c, i) => (
                  <tr key={i}>
                    <td><b>{c.name}</b></td>
                    <td className="num-cell">{c.birthDate ?? "-"}</td>
                    <td><span className="badge badge-primary">{c.serviceType}</span></td>
                    <td>{c.therapistName ?? "-"}</td>
                    <td className="num-cell">{c.defaultSlot ?? "-"}</td>
                    <td>{c.defaultDays ? c.defaultDays.split(",").map((n) => WEEK[Number(n)]).join(" ") : "-"}</td>
                    <td className="num-cell">{c.defaultTarget ?? "-"}회</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}


      <div className="card">
        <div className="card-header">
          <h2>다른 방법</h2>
        </div>
        <div className="card-body">
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link className="btn btn-ghost" href="/children/new">아동 한 명씩 등록</Link>
            <Link className="btn btn-ghost" href="/children">목록 보기</Link>
          </div>
        </div>
      </div>
    </>
  );
}
