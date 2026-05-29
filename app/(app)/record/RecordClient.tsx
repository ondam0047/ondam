"use client";

import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { minusMin } from "@/lib/constants";

type RecordSessionData = {
  ordinal: number;
  startTime?: string | null;
  endTime?: string | null;
  voucher?: string | null;
  extra?: string | null;
  amount?: string | null;
  result?: string | null;
};

type SessionRow = {
  name: string;
  birth: string;
  use: string;
  end: string;
  pay: string;
  appr: string;
  amt: string;
  org: string;
};

type Grouped = Record<string, SessionRow[]>;

function parseYMD(s: string): { y: number; mo: number; d: number } | null {
  const m = String(s).match(/(\d{4})[.\-\/]\s*(\d{1,2})[.\-\/]\s*(\d{1,2})/);
  return m ? { y: +m[1], mo: +m[2], d: +m[3] } : null;
}

type CenterChildOption = { id: number; name: string; birthDate: string | null };

export default function RecordClient({
  centerChildren,
}: {
  centerChildren: CenterChildOption[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [therapist, setTherapist] = useState("");
  const [uploadInfo, setUploadInfo] = useState("");
  const [error, setError] = useState("");
  const [grouped, setGrouped] = useState<Grouped>({});
  const [curChild, setCurChild] = useState<string | null>(null);

  function readExcel(file: File) {
    setError("");
    const r = new FileReader();
    r.onload = (ev) => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target!.result as ArrayBuffer), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });

        const hi = rows.findIndex((r) =>
          Array.isArray(r) && r.includes("대상자") && r.includes("승인번호")
        );
        if (hi < 0) {
          setError("헤더(대상자/승인번호)를 찾지 못했어요. 올바른 서비스제공내역 파일인지 확인해주세요.");
          return;
        }
        const H = rows[hi] as string[];
        const col = (n: string) => H.indexOf(n);
        const ci = {
          name: col("대상자"), birth: col("생년월일"), use: col("서비스이용일자"),
          end: col("서비스종료시간"), start: col("서비스시작시간"), pay: col("결제일자"),
          appr: col("승인번호"), amt: col("결제금액"), org: col("제공기관명"),
        };

        const g: Grouped = {};
        for (let i = hi + 1; i < rows.length; i++) {
          const row = rows[i] as string[] | undefined;
          if (!row || !row[ci.name]) continue;
          const nm = String(row[ci.name]).trim();
          if (!nm) continue;
          (g[nm] = g[nm] || []).push({
            name: nm,
            birth: String(row[ci.birth] || ""),
            use: String(row[ci.use] || ""),
            end: String(row[ci.end] || ""),
            pay: String(row[ci.pay] || ""),
            appr: String(row[ci.appr] || ""),
            amt: String(row[ci.amt] || ""),
            org: String(row[ci.org] || "온담말언어발달센터"),
          });
        }
        Object.values(g).forEach((arr) => arr.sort((a, b) => {
          const A = parseYMD(a.use), B = parseYMD(b.use);
          return (A?.d ?? 0) - (B?.d ?? 0);
        }));

        let ther = "";
        for (const r0 of rows) {
          if (!Array.isArray(r0)) continue;
          const k = r0.indexOf("제공인력 이름");
          if (k >= 0) { ther = String(r0[k + 1] || ""); break; }
        }

        const names = Object.keys(g);
        const total = Object.values(g).reduce((a, b) => a + b.length, 0);
        setTherapist(ther);
        setUploadInfo(`✓ 불러오기 완료 · 치료사 ${ther || "-"} · 아동 ${names.length}명 · 총 ${total}건`);
        setGrouped(g);
        setCurChild(names[0] ?? null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError("파일을 읽는 중 오류가 발생했어요: " + msg);
      }
    };
    r.readAsArrayBuffer(file);
  }

  const names = Object.keys(grouped);

  return (
    <>
      <div className="section-head">
        <div>
          <h2>기록지 자동완성</h2>
          <p>전자바우처에서 받은 엑셀을 올리면 아동별 회기·승인번호가 자동으로 채워져요.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="step">1</span>
          <h2>서비스제공내역 엑셀 업로드</h2>
          <span className="hint">.xls / .xlsx 모두 지원</span>
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
            <div className="sm2">
              전자바우처에서 받은 <b>서비스제공내역.xls</b> · 치료사 본인 파일
            </div>
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
          {uploadInfo && (
            <div className="tip" style={{ marginTop: 12 }} dangerouslySetInnerHTML={{ __html: uploadInfo }} />
          )}
        </div>
      </div>

      {names.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="step">2</span>
            <h2>아동별 기록지 작성</h2>
            <span className="hint">아동 탭을 눌러 전환하세요</span>
          </div>
          <div className="card-body">
            <div className="childbar">
              {names.map((n) => (
                <button
                  key={n}
                  className={"childbtn" + (n === curChild ? " active" : "")}
                  onClick={() => setCurChild(n)}
                >
                  {n}<span className="cnt">{grouped[n].length}건</span>
                </button>
              ))}
            </div>

            {curChild && (
              <RecordSheet
                key={curChild}
                child={curChild}
                rows={grouped[curChild]}
                therapist={therapist}
                centerChildren={centerChildren}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function RecordSheet({
  child,
  rows,
  therapist,
  centerChildren,
}: {
  child: string;
  rows: SessionRow[];
  therapist: string;
  centerChildren: CenterChildOption[];
}) {
  const monthSet = [...new Set(rows.map((s) => parseYMD(s.use)?.mo).filter(Boolean))];
  const month = monthSet[0] ?? "";
  // DB 매칭: 같은 센터 안에서 이름이 일치하는 Child 찾기
  const matchedChild = centerChildren.find((c) => c.name === child);
  const childId = matchedChild?.id ?? null;
  const year = new Date().getFullYear(); // 단순화: 올해 기준 (대부분 맞음)
  const birth = rows[0]?.birth ?? "";
  const org = rows[0]?.org ?? "";

  // start/end times per column (editable)
  const initial = rows.map((s) => {
    const end = String(s.end).slice(0, 5);
    const start = /^\d\d:\d\d$/.test(end) ? minusMin(end, 50) : "";
    return { start, end };
  });
  const [times, setTimes] = useState(initial);
  const [vouchers, setVouchers] = useState(rows.map(() => "40"));
  const [extras, setExtras] = useState(rows.map(() => "10"));
  const [amounts, setAmounts] = useState(rows.map(() => "65,000"));
  const [results, setResults] = useState(rows.map(() => ""));
  const [opinion, setOpinion] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [loadedRecordId, setLoadedRecordId] = useState<number | null>(null);

  const monthNumForLoad = typeof month === "number" ? month : parseInt(String(month)) || 0;

  // 저장된 기록지가 있으면 자동으로 불러와서 state 채우기 (월 단위)
  useEffect(() => {
    if (!childId || !monthNumForLoad) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/record/load?childId=${childId}&year=${year}&month=${monthNumForLoad}`);
        if (!r.ok || cancelled) return;
        const rec = await r.json();
        if (cancelled || !rec || !rec.id) return;
        setLoadedRecordId(rec.id);
        setOpinion(rec.opinion ?? "");
        const sm = new Map<number, RecordSessionData>();
        for (const s of rec.sessions as RecordSessionData[]) sm.set(s.ordinal, s);
        setTimes((prev) => prev.map((t, i) => {
          const s = sm.get(i + 1);
          return s ? { start: s.startTime ?? t.start, end: s.endTime ?? t.end } : t;
        }));
        setVouchers((prev) => prev.map((v, i) => sm.get(i + 1)?.voucher ?? v));
        setExtras((prev) => prev.map((v, i) => sm.get(i + 1)?.extra ?? v));
        setAmounts((prev) => prev.map((v, i) => sm.get(i + 1)?.amount ?? v));
        setResults((prev) => prev.map((v, i) => sm.get(i + 1)?.result ?? v));
        setSavedMsg(`✓ ${rec.year}년 ${rec.month}월 저장된 기록을 불러왔어요.`);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [childId, year, monthNumForLoad]);

  async function saveRecord() {
    if (!childId) {
      alert("이 아동이 시스템에 등록돼 있지 않아 저장할 수 없어요. 원장님께 아동 등록을 요청해주세요.");
      return;
    }
    setSaving(true);
    setSavedMsg("");
    try {
      const payload = {
        childId,
        year,
        month: monthNumForLoad,
        org,
        childName: child,
        childBirth: birth,
        opinion,
        sessions: rows.map((s, i) => {
          const pu = parseYMD(s.use);
          const pp = parseYMD(s.pay);
          return {
            ordinal: i + 1,
            date: pu ? `${pu.mo}/${pu.d}` : "",
            startTime: times[i].start,
            endTime: times[i].end,
            voucher: vouchers[i],
            extra: extras[i],
            amount: amounts[i],
            useDay: pu ? String(pu.d) : "",
            payDay: pp ? String(pp.d) : "",
            apprNumber: s.appr,
            result: results[i],
          };
        }),
      };
      const res = await fetch("/api/record/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) {
        alert("저장 실패: " + (j.error ?? res.status));
        return;
      }
      setLoadedRecordId(j.recordId);
      setSavedMsg(`✓ ${child} ${monthNumForLoad}월 기록지를 저장했어요.`);
    } finally {
      setSaving(false);
    }
  }

  async function downloadHwpx() {
    setDownloading(true);
    try {
      const monthNum = typeof month === "number" ? month : parseInt(String(month)) || 0;
      const sessionsPayload = rows.map((s, i) => {
        const pu = parseYMD(s.use);
        const pp = parseYMD(s.pay);
        return {
          date: pu ? `${pu.mo}/${pu.d}` : "",
          startTime: times[i].start,
          endTime: times[i].end,
          voucher: vouchers[i],
          extra: extras[i],
          amount: amounts[i],
          useDay: pu ? String(pu.d) : "",
          payDay: pp ? String(pp.d) : "",
          apprNumber: s.appr,
          result: results[i],
        };
      });
      const payload = {
        childName: child,
        childBirth: birth,
        org,
        month: monthNum,
        sessions: sessionsPayload,
        opinion,
      };
      const res = await fetch("/api/record/hwpx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        alert("한글파일(.hwpx) 생성 실패: " + (e.error ?? res.status));
        return;
      }
      const blob = await res.blob();
      // 회기 5개 초과면 서버가 .zip 으로 묶어 보냄
      const isZip = blob.type === "application/zip";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${child}_${monthNum}월_기록지.${isZip ? "zip" : "hwpx"}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setDownloading(false);
    }
  }

  async function downloadDocx() {
    setDownloading(true);
    try {
      const payload = {
        childName: child,
        childBirth: birth,
        org,
        therapist,
        month: String(month),
        opinion,
        sessions: rows.map((s, i) => ({
          use: s.use, pay: s.pay, appr: s.appr,
          start: times[i].start, end: times[i].end,
          voucher: vouchers[i], extra: extras[i], amount: amounts[i],
          result: results[i],
        })),
      };
      const res = await fetch("/api/record/docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        alert("한글파일 생성에 실패했어요.");
        return;
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${child}_${month}월_기록지.docx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setDownloading(false);
    }
  }

  function setEnd(i: number, v: string) {
    setTimes((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], end: v };
      if (/^\d\d:\d\d$/.test(v)) next[i] = { ...next[i], start: minusMin(v, 50) };
      return next;
    });
  }
  function setStart(i: number, v: string) {
    setTimes((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], start: v };
      return next;
    });
  }

  const topCols = rows.map((s, i) => {
    const p = parseYMD(s.use);
    const md = p ? `${p.mo}/${p.d}` : s.use;
    return { i, md };
  });

  return (
    <div className="sheet">
      <div className="sheet-title">발달재활서비스 제공 기록지 ({month}월)</div>
      <table className="meta-tbl">
        <tbody>
          <tr><td className="lbl">제공기관명</td><td colSpan={3}>{org}</td></tr>
          <tr>
            <td className="lbl">이용자</td><td>성명 : {child}</td>
            <td className="lbl">생년월일</td><td>{birth}</td>
          </tr>
          <tr>
            <td className="lbl">관리자 서명</td><td></td>
            <td className="lbl">보호자 서명</td><td></td>
          </tr>
          {therapist && (
            <tr>
              <td className="lbl">치료사</td><td colSpan={3}>{therapist}</td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="scroll">
        <table className="prov-tbl">
          <tbody>
            <tr>
              <th rowSpan={2} style={{ width: 90 }}>내용 / 월·일</th>
              {topCols.map((c) => <th key={c.i}>{c.md}</th>)}
            </tr>
            <tr><td style={{ background: "#fff", border: "none" }}></td></tr>
            <tr>
              <td className="rowlbl">시작시간</td>
              {topCols.map((c) => (
                <td key={c.i}>
                  <input value={times[c.i].start} onChange={(e) => setStart(c.i, e.target.value)} />
                </td>
              ))}
            </tr>
            <tr>
              <td className="rowlbl">종료시간</td>
              {topCols.map((c) => (
                <td key={c.i}>
                  <input value={times[c.i].end} onChange={(e) => setEnd(c.i, e.target.value)} />
                </td>
              ))}
            </tr>
            <tr>
              <td className="rowlbl">바우처(분)</td>
              {topCols.map((c) => (
                <td key={c.i}>
                  <input
                    value={vouchers[c.i]} style={{ width: 46 }}
                    onChange={(e) => setVouchers((p) => { const n = [...p]; n[c.i] = e.target.value; return n; })}
                  />
                </td>
              ))}
            </tr>
            <tr>
              <td className="rowlbl">추가구매(분)</td>
              {topCols.map((c) => (
                <td key={c.i}>
                  <input
                    value={extras[c.i]} style={{ width: 46 }}
                    onChange={(e) => setExtras((p) => { const n = [...p]; n[c.i] = e.target.value; return n; })}
                  />
                </td>
              ))}
            </tr>
            <tr>
              <td className="rowlbl">총이용금액</td>
              {topCols.map((c) => (
                <td key={c.i}>
                  <input
                    value={amounts[c.i]} style={{ width: 64 }}
                    onChange={(e) => setAmounts((p) => { const n = [...p]; n[c.i] = e.target.value; return n; })}
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="result-block">
        <h3>
          ※ 상태 및 결과 기록{" "}
          <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 12 }}>
            — 이용자 상태·서비스 결과는 직접 작성
          </span>
        </h3>
        {rows.map((s, i) => {
          const pu = parseYMD(s.use), pp = parseYMD(s.pay);
          const useD = pu ? pu.d : "?";
          const payD = pp ? pp.d : "?";
          const match = !!pu && !!pp && pu.y === pp.y && pu.mo === pp.mo && pu.d === pp.d;
          return (
            <div key={i} className={"result-row" + (match ? "" : " mismatch")}>
              <div className="rr-head">
                <span className="pill">제공일자 {useD}일</span>
                <span className="pill">승인일자 {payD}일</span>
                <span className="pill appr">승인 {s.appr}</span>
                {match
                  ? <span className="okflag">✓ 일치</span>
                  : <span className="warnflag">⚠ 제공일자≠승인일자 — 확인 필요</span>}
              </div>
              <textarea
                value={results[i]}
                placeholder="이용자의 상태 및 서비스 결과를 입력하세요 (예: 종성 /ㄹ/ 단어 수준에서 …)"
                onChange={(e) => setResults((p) => { const n = [...p]; n[i] = e.target.value; return n; })}
              />
            </div>
          );
        })}
      </div>

      <div className="opinion">
        <h3>부모 상담 종합 의견</h3>
        <textarea
          value={opinion}
          placeholder="부모 상담 종합 의견을 입력하세요"
          style={{ minHeight: 80 }}
          onChange={(e) => setOpinion(e.target.value)}
        />
      </div>

      {savedMsg && <div className="flash ok" style={{ marginTop: 14 }}>{savedMsg}</div>}
      {!childId && (
        <div className="flash warn" style={{ marginTop: 14 }}>
          ⚠ <b>{child}</b> 가 시스템에 등록된 아동과 일치하지 않아요. 저장하려면 같은 이름으로 먼저 아동을 등록해주세요.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 20 }}>
        <button className="btn" onClick={saveRecord} disabled={saving || !childId}>
          {saving ? "저장 중..." : (loadedRecordId ? "덮어쓰기 저장" : "DB에 저장")}
        </button>
        <button className="btn btn-primary" onClick={downloadHwpx} disabled={downloading}>
          {downloading ? "생성 중..." : "한글파일(.hwpx) 다운로드"}
        </button>
      </div>
    </div>
  );
}
