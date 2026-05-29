"use client";

import { useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { SERVICE_TYPES, WEEK } from "@/lib/constants";

type ChildRow = {
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

function guessServiceType(raw: string): string {
  const s = String(raw).trim();
  for (const t of SERVICE_TYPES) {
    if (s.includes(t.slice(0, 2))) return t;
  }
  if (s.includes("언어") || s.includes("말")) return "언어재활";
  if (s.includes("놀이")) return "놀이치료";
  if (s.includes("감각")) return "감각통합치료";
  return SERVICE_TYPES[0];
}

function parseDays(raw: string): string {
  // "수,목" 또는 "수목" 또는 "Wed,Thu" 등을 0~6 인덱스로
  const out: number[] = [];
  const s = String(raw);
  for (let i = 0; i < WEEK.length; i++) {
    if (s.includes(WEEK[i])) out.push(i);
  }
  return [...new Set(out)].sort().join(",");
}

export default function ImportClient() {
  const [mode, setMode] = useState<Mode>("child");
  const [children, setChildren] = useState<ChildRow[] | null>(null);
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

        // 1) 전자바우처 '서비스제공내역' 형식 자동 감지
        //    - 어디 행이든 '대상자' + '생년월일' + '승인번호' 가 같이 있으면 그 형식
        //    - 같은 아동이 여러 번 반복되므로 (이름+생년월일) 로 dedup
        const eVoucherHeaderIdx = rows.findIndex((r) =>
          Array.isArray(r) && r.includes("대상자") && r.includes("생년월일") && r.includes("승인번호")
        );

        if (eVoucherHeaderIdx >= 0) {
          const H = rows[eVoucherHeaderIdx] as string[];
          const col = (n: string) => H.indexOf(n);
          const ci = {
            name: col("대상자"),
            birth: col("생년월일"),
          };
          // 헤더 위 줄들에서 제공인력 이름 찾기
          let therapistFromHeader = "";
          for (let i = 0; i < eVoucherHeaderIdx; i++) {
            const r = rows[i];
            if (!Array.isArray(r)) continue;
            const k = r.indexOf("제공인력 이름");
            if (k >= 0) { therapistFromHeader = String(r[k + 1] ?? "").trim(); break; }
          }

          // 이름+생년월일 로 dedup
          const map = new Map<string, ChildRow>();
          for (let i = eVoucherHeaderIdx + 1; i < rows.length; i++) {
            const row = rows[i] as unknown[];
            if (!row) continue;
            const name = String(row[ci.name] ?? "").trim();
            if (!name) continue;
            const birth = ci.birth >= 0 ? String(row[ci.birth]).trim() : "";
            const key = `${name}|${birth}`;
            if (!map.has(key)) {
              map.set(key, {
                name,
                birthDate: birth || undefined,
                serviceType: SERVICE_TYPES[0], // 기본 — 사용자 나중에 수정
                therapistName: therapistFromHeader || undefined,
              });
            }
          }

          if (map.size === 0) {
            setError("서비스제공내역에서 대상자 정보를 찾지 못했어요.");
            return;
          }
          // 강제로 child 모드로 — 이 형식은 무조건 아동 목록
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
            name: findColIndex(header, ["이름", "성명", "아동"]),
            birthDate: findColIndex(header, ["생년월일", "생일"]),
            serviceType: findColIndex(header, ["서비스", "치료종류", "분야"]),
            mgmtNumber: findColIndex(header, ["관리번호", "사회복지"]),
            therapistName: findColIndex(header, ["담당", "치료사"]),
            defaultSlot: findColIndex(header, ["시간", "시간대"]),
            defaultDays: findColIndex(header, ["요일", "수업일"]),
            defaultUnit: findColIndex(header, ["단가"]),
            defaultTarget: findColIndex(header, ["목표", "회기수", "주기"]),
            memo: findColIndex(header, ["메모", "비고"]),
          };
          if (ci.name < 0) {
            setError("'이름' 또는 '성명' 컬럼을 찾지 못했어요. 첫 줄에 컬럼명이 있는지 확인해주세요.");
            return;
          }
          const data: ChildRow[] = [];
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
                ? guessServiceType(String(row[ci.serviceType]))
                : SERVICE_TYPES[0],
              mgmtNumber: ci.mgmtNumber >= 0 ? String(row[ci.mgmtNumber]).trim() || undefined : undefined,
              therapistName: ci.therapistName >= 0 ? String(row[ci.therapistName]).trim() || undefined : undefined,
              defaultSlot: ci.defaultSlot >= 0 ? String(row[ci.defaultSlot]).trim() || undefined : undefined,
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
      setSavedMsg(`✓ ${j.savedCount}건 저장 완료.`);
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
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <button
              className={"chip" + (mode === "child" ? " on" : "")}
              onClick={() => { setMode("child"); setChildren(null); setTherapists(null); setError(""); }}
            >아동 일괄 등록</button>
            <button
              className={"chip" + (mode === "therapist" ? " on" : "")}
              onClick={() => { setMode("therapist"); setChildren(null); setTherapists(null); setError(""); }}
            >치료사 일괄 등록</button>
          </div>

          <div className="tip" style={{ marginBottom: 14 }}>
            <span>
              인식하는 컬럼:
              {mode === "child"
                ? " 이름, 생년월일, 서비스, 관리번호, 담당치료사, 기본시간, 요일, 단가, 목표회기, 메모"
                : " 이름, 전화"}
              . 컬럼 이름이 비슷하기만 하면(예: '성명', '담당') 자동 인식해요.
              {mode === "child" && (
                <>
                  <br />
                  💡 <b>전자바우처 '서비스제공내역' 엑셀</b>도 그대로 올리면 자동으로 아동 명단을 추출해서 등록합니다.
                </>
              )}
            </span>
          </div>

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
            <h2>미리보기 — 아동 {children.length}명</h2>
            <span style={{ flex: 1 }} />
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? "저장 중..." : "이대로 저장"}
            </button>
          </div>
          <div className="scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>이름</th><th>생년월일</th><th>서비스</th><th>관리번호</th>
                  <th>담당</th><th>시간</th><th>요일</th><th>목표</th>
                </tr>
              </thead>
              <tbody>
                {children.map((c, i) => (
                  <tr key={i}>
                    <td><b>{c.name}</b></td>
                    <td className="num-cell">{c.birthDate ?? "-"}</td>
                    <td><span className="badge badge-primary">{c.serviceType}</span></td>
                    <td className="num-cell">{c.mgmtNumber ?? "-"}</td>
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

      {therapists && therapists.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2>미리보기 — 치료사 {therapists.length}명</h2>
            <span style={{ flex: 1 }} />
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? "저장 중..." : "이대로 저장"}
            </button>
          </div>
          <table className="table">
            <thead><tr><th>이름</th><th>전화</th></tr></thead>
            <tbody>
              {therapists.map((t, i) => (
                <tr key={i}>
                  <td><b>{t.name}</b></td>
                  <td className="num-cell">{t.phone ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2>다른 방법</h2>
        </div>
        <div className="card-body">
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link className="btn btn-ghost" href="/children/new">아동 한 명씩 등록</Link>
            <Link className="btn btn-ghost" href="/therapists">치료사 직접 등록</Link>
          </div>
        </div>
      </div>
    </>
  );
}
