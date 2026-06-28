"use client";

import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

type Row = {
  name: string;
  useDate: string;     // 서비스이용일자 (YYYY.MM.DD)
  payDate: string;     // 결제일자 (YYYY.MM.DD)
  payTime: string;     // 결제시간 (HH:MM) — 없으면 서비스종료시간 으로 fallback
  serviceStart: string;
  serviceEnd: string;
  apprNo: string;
  amount: string;
  payKind: string;     // 결제구분 — "정상결제" / "소급결제"
};

function extractDate(s: string): string {
  const m = String(s).match(/(\d{4})[.\-\/]\s*(\d{1,2})[.\-\/]\s*(\d{1,2})/);
  if (!m) return "";
  return `${m[1]}.${m[2].padStart(2, "0")}.${m[3].padStart(2, "0")}`;
}
function extractTime(s: string): string {
  const m = String(s).match(/(\d{1,2}):(\d{2})/);
  if (!m) return "";
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}
function timeToMin(hhmm: string): number | null {
  const m = hhmm.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

const SESSION_MIN = 50;   // 1 회기 기본 길이
const TOL = 10;           // 허용 오차 (앞쪽 ±10분)

type Violation = { kind: "too_close"; gap: number; expectedMin: number; same?: boolean };

// 같은 날 직전 결제와의 간격이 회기 길이보다 짧으면 (= 이전 회기와 겹침) 위반.
// 간격이 멀어진 건 휴식·블록 전환이므로 검사 제외.
function checkRowAgainstPrev(prev: Row, curr: Row): Violation | null {
  if (!prev.payDate || !curr.payDate || prev.payDate !== curr.payDate) return null;
  const a = timeToMin(prev.payTime);
  const b = timeToMin(curr.payTime);
  if (a == null || b == null) return null;
  const gap = b - a;
  if (gap < 0) return null;   // 정렬 역전(이론상 없음) — 건너뜀
  // 간격 0 = 같은 시각 결제(중복/재업로드) → 가장 심한 겹침. 절대 놓치면 안 됨.
  if (gap === 0) return { kind: "too_close", gap, expectedMin: SESSION_MIN - TOL, same: true };
  if (gap < SESSION_MIN - TOL) {
    return { kind: "too_close", gap, expectedMin: SESSION_MIN - TOL };
  }
  return null;
}

export default function ApprovalCheckClient() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [therapist, setTherapist] = useState("");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");

  function resetCheck() {
    setRows([]);
    setTherapist("");
    setFileName("");
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function readExcel(file: File) {
    setError("");
    setFileName(file.name);
    const r = new FileReader();
    r.onload = (ev) => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target!.result as ArrayBuffer), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });

        const hi = raw.findIndex((r) =>
          Array.isArray(r) && r.includes("대상자") && r.includes("승인번호")
        );
        if (hi < 0) {
          setError("헤더(대상자/승인번호)를 찾지 못했어요. 올바른 서비스제공내역 파일인지 확인해주세요.");
          return;
        }
        const H = raw[hi] as string[];
        const col = (n: string) => H.indexOf(n);
        const ci = {
          name: col("대상자"),
          use: col("서비스이용일자"),
          start: col("서비스시작시간"),
          end: col("서비스종료시간"),
          pay: col("결제일자"),
          payTime: col("결제시간"),
          appr: col("승인번호"),
          amt: col("결제금액"),
          kind: col("결제구분"),
        };

        const out: Row[] = [];
        for (let i = hi + 1; i < raw.length; i++) {
          const r0 = raw[i] as string[] | undefined;
          if (!r0 || !r0[ci.name]) continue;
          const nm = String(r0[ci.name]).trim();
          if (!nm) continue;
          const payCell = String(r0[ci.pay] || "");
          // 결제시간 column 우선, 없으면 결제일자 cell 내 HH:MM, 없으면 서비스종료시간
          const payTime =
            (ci.payTime >= 0 ? extractTime(String(r0[ci.payTime] || "")) : "") ||
            extractTime(payCell) ||
            extractTime(String(r0[ci.end] || ""));
          out.push({
            name: nm,
            useDate: extractDate(String(r0[ci.use] || "")),
            payDate: extractDate(payCell),
            payTime,
            serviceStart: extractTime(String(r0[ci.start] || "")),
            serviceEnd: extractTime(String(r0[ci.end] || "")),
            apprNo: String(r0[ci.appr] || ""),
            amount: String(r0[ci.amt] || ""),
            payKind: ci.kind >= 0 ? String(r0[ci.kind] || "").trim() : "",
          });
        }

        // 결제 일시 오름차순 정렬 (점검의 기준)
        out.sort((a, b) => {
          if (a.payDate !== b.payDate) return a.payDate.localeCompare(b.payDate);
          return a.payTime.localeCompare(b.payTime);
        });

        let ther = "";
        for (const r0 of raw) {
          if (!Array.isArray(r0)) continue;
          const k = r0.indexOf("제공인력 이름");
          if (k >= 0) { ther = String(r0[k + 1] || ""); break; }
        }

        setTherapist(ther);
        setRows(out);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError("파일을 읽는 중 오류가 발생했어요: " + msg);
      }
    };
    r.readAsArrayBuffer(file);
  }

  // 결제 위반 검사 — 같은 날 연속 결제 사이 간격이 40~60분이어야 OK.
  // 휴식 시간(≥120분) 으로 떨어진 건 검사 제외.
  const violations = useMemo(() => {
    const out = new Map<number, Violation>();
    // 소급결제는 처리일에 여러 건이 몇 초~분 간격으로 몰려 결제시간 간격이 무의미 → 검사에서 제외.
    // (소급 행을 건너뛰고, 직전 '비소급' 행과 비교)
    let prevIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].payKind.includes("소급")) continue;
      if (prevIdx >= 0) {
        const v = checkRowAgainstPrev(rows[prevIdx], rows[i]);
        if (v) out.set(i, v);
      }
      prevIdx = i;
    }
    return out;
  }, [rows]);

  const retroCount = useMemo(() => rows.filter((r) => r.payKind.includes("소급")).length, [rows]);
  const violationCount = violations.size;

  return (
    <>
      <div className="section-head">
        <div>
          <h2>결제 겹침 찾기</h2>
          <p>
            서비스제공내역 엑셀을 올리면 연속 결제 시간 간격(±10분)을 확인합니다.
            지자체 점검 전에 미리 자가 점검하세요.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="step">1</span>
          <h2>엑셀 업로드</h2>
          <span className="hint">서비스제공내역.xls · .xlsx</span>
        </div>
        <div className="card-body">
          <div
            className={"drop" + (dragOver ? " over" : "")}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f) readExcel(f);
            }}
          >
            <div className="big">엑셀 파일을 여기에 끌어다 놓거나 클릭</div>
            <div className="sm2">치료사 본인의 <b>서비스제공내역.xls</b></div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xls,.xlsx"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) readExcel(f);
            }}
          />
          {error && <div className="flash warn" style={{ marginTop: 12 }}>{error}</div>}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2>점검 결과</h2>
            <span className="hint">
              {fileName} · 치료사 {therapist || "-"} · 총 {rows.length}건
            </span>
            <span style={{ flex: 1 }} />
            {violationCount > 0
              ? <span className="badge badge-warn">⚠ 간격 위반 {violationCount}건</span>
              : <span className="badge badge-success">✓ 모든 간격 정상</span>}
            {retroCount > 0 && (
              <span className="badge badge-warn" style={{ marginLeft: 6 }}>소급 {retroCount}건</span>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={resetCheck} style={{ marginLeft: 8 }}>
              다른 파일로 다시
            </button>
          </div>
          <div className="card-body">
            <div className="tip" style={{ marginBottom: 12, fontSize: 12.5, lineHeight: 1.6 }}>
              빨간색 행 = 직전 결제와 간격이 40분(50분 ± 10분 허용) 미만 — 이전 회기와 겹침.
              간격이 멀어진 건 휴식·블록 전환으로 보고 검사하지 않아요.
              소급결제 건은 결제시간 간격이 무의미해 겹침 검사에서 제외하며, 별도 사유서가 필요합니다.
            </div>

            <div className="scroll">
              <table className="prov-tbl approval-tbl">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>#</th>
                    <th style={{ whiteSpace: "nowrap" }}>대상자</th>
                    <th style={{ whiteSpace: "nowrap" }}>이용일자</th>
                    <th style={{ whiteSpace: "nowrap" }}>결제일자</th>
                    <th style={{ whiteSpace: "nowrap" }}>결제시간</th>
                    <th style={{ whiteSpace: "nowrap" }}>겹침 검사</th>
                    <th style={{ whiteSpace: "nowrap" }}>구분</th>
                    <th style={{ whiteSpace: "nowrap" }}>승인번호</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const v = violations.get(i);
                    const retro = r.payKind.includes("소급");
                    return (
                      <tr key={i} style={{
                        background: v ? "#FBEAE7" : retro ? "#FFF3D8" : undefined,
                        color: v ? "var(--danger)" : undefined,
                        fontWeight: v ? 600 : undefined,
                      }}>
                        <td>{i + 1}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{r.name}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{r.useDate}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{r.payDate}</td>
                        <td style={{ fontFamily: "monospace", fontWeight: 700, whiteSpace: "nowrap" }}>{r.payTime || "-"}</td>
                        <td>
                          {v ? (
                            <>
                              <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{v.gap}분</span>
                              <span style={{ marginLeft: 6, fontSize: 11 }}>
                                {v.same
                                  ? "(직전 결제와 같은 시각 — 중복/겹침)"
                                  : `(이전 회기와 겹침 — ${v.expectedMin - v.gap}분 빠름)`}
                              </span>
                            </>
                          ) : ""}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {retro ? (
                            <span style={{ color: "var(--danger)", fontWeight: 700 }}>소급결제</span>
                          ) : (r.payKind || "-")}
                        </td>
                        <td style={{ fontFamily: "monospace", fontSize: 11, whiteSpace: "nowrap" }}>{r.apprNo}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {violationCount > 0 && (
              <div className="flash warn" style={{ marginTop: 14 }}>
                <b>{violationCount}건</b> 의 결제 간격 위반이 있어요. 위 빨간 행을 확인해 보완하세요.
                (직전 결제 후 40분 미만 = 이전 회기와 겹침)
              </div>
            )}
            {retroCount > 0 && (
              <div className="flash warn" style={{ marginTop: 10, background: "#FFF3D8", color: "#8A6422", borderColor: "#F5C57E" }}>
                <b>소급결제 {retroCount}건</b> 있음. 별도 사유서 작성을 잊지 마세요.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
