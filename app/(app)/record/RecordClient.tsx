"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as XLSX from "xlsx";
import { minusMin } from "@/lib/constants";
import { useBetaUx } from "../BetaUxContext";

type RecordSessionData = {
  ordinal: number;
  startTime?: string | null;
  endTime?: string | null;
  voucher?: string | null;
  extra?: string | null;
  amount?: string | null;
  result?: string | null;
  status?: string | null;
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
  payKind?: string;   // 결제구분 — "정상결제" / "소급결제"
};

type Grouped = Record<string, SessionRow[]>;

function parseYMD(s: string): { y: number; mo: number; d: number } | null {
  const m = String(s).match(/(\d{4})[.\-\/]\s*(\d{1,2})[.\-\/]\s*(\d{1,2})/);
  return m ? { y: +m[1], mo: +m[2], d: +m[3] } : null;
}

// 일정표 회기 ↔ 엑셀 행을 "같은 일자" 기준으로 우선 매칭. 정확히 일치하는 일자는 그대로
// 매치, 남은 회기는 순서대로 빈 행에 채워넣음. (1,3,8,13,15 vs 3,5,8,13,15 의 경우
// 3·8·13·15 가 일치 처리되고 남은 1 이 5 행에 할당됨)
function pairScheduleDays(
  scheduleDays: (number | null)[],
  rowPayDays: (number | null)[]
): (number | null)[] {
  const schedSet = new Set<number>();
  for (const d of scheduleDays) if (d != null) schedSet.add(d);
  const usedSched = new Set<number>();
  const result: (number | null)[] = rowPayDays.map((pd) => {
    if (pd != null && schedSet.has(pd)) {
      usedSched.add(pd);
      return pd;
    }
    return null;
  });
  const unused = [...schedSet].filter((d) => !usedSched.has(d)).sort((a, b) => a - b);
  let ui = 0;
  for (let i = 0; i < result.length; i++) {
    if (result[i] === null && ui < unused.length) {
      result[i] = unused[ui++];
    }
  }
  return result;
}

type MyServiceOption = {
  id: number;
  childId: number;
  name: string;
  birthDate: string | null;
  serviceType: string;
  defaultUnit?: number;       // 회당 단가 → 기록지 총이용금액 기본값
  org?: string | null;        // 서비스 제공자명(제공기관명) — 아동별 저장값
  hasMultipleServices?: boolean;
};

function pad(n: number) { return String(n).padStart(2, "0"); }

function buildMonthOptions() {
  const now = new Date();
  const out: { value: string; label: string }[] = [];
  for (let offset = -3; offset <= 1; offset++) {
    const total = now.getFullYear() * 12 + now.getMonth() + offset;
    const y = Math.floor(total / 12);
    const m = (total % 12) + 1;
    out.push({
      value: `${y}-${m}`,
      label: `${y}년 ${m}월${offset === 0 ? " (이번 달)" : ""}`,
    });
  }
  return out;
}

export default function RecordClient({
  myServices,
  defaultTherapist,
  defaultOrg,
  centerDefaultUnit = 0,
  recordForm = "standard",
}: {
  myServices: MyServiceOption[];
  defaultTherapist: string;
  defaultOrg: string;
  centerDefaultUnit?: number;
  recordForm?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [therapist, setTherapist] = useState(defaultTherapist);
  const [uploadInfo, setUploadInfo] = useState("");
  const [retroChildren, setRetroChildren] = useState<string[]>([]);
  const [retroByChild, setRetroByChild] = useState<Record<string, number>>({});
  const [retroCount, setRetroCount] = useState(0);
  const [error, setError] = useState("");

  // ─── 직접 시작 (엑셀 없이) ────────────────────────────────────────────
  const monthOptions = useMemo(buildMonthOptions, []);
  const [manualCSId, setManualCSId] = useState<number | "">("");
  const [manualYm, setManualYm] = useState(monthOptions.find((o) => o.label.includes("이번 달"))?.value ?? monthOptions[0].value);
  const [manualLoading, setManualLoading] = useState(false);

  const [grouped, setGrouped] = useState<Grouped>({});
  const [curChild, setCurChild] = useState<string | null>(null);

  // 일정표·기록지 사이 이동 시 미리보기 화면 그대로 복원
  const LS_DRAFT = "baroilji_record_draft";
  const LS_SCROLL = "baroilji_record_scroll";
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_DRAFT);
      if (raw) {
        const d = JSON.parse(raw);
        if (typeof d.manualCSId === "number" && myServices.some((s) => s.id === d.manualCSId)) {
          setManualCSId(d.manualCSId);
        }
        if (typeof d.manualYm === "string" && monthOptions.some((o) => o.value === d.manualYm)) {
          setManualYm(d.manualYm);
        }
        if (typeof d.therapist === "string" && d.therapist) setTherapist(d.therapist);
        if (typeof d.uploadInfo === "string") setUploadInfo(d.uploadInfo);
        if (d.grouped && typeof d.grouped === "object") setGrouped(d.grouped as Grouped);
        if (typeof d.curChild === "string") setCurChild(d.curChild);
      } else {
        // 구버전 호환
        const savedYm = localStorage.getItem("baroilji_last_ym");
        if (savedYm && monthOptions.some((o) => o.value === savedYm)) setManualYm(savedYm);
        const savedCsId = localStorage.getItem("baroilji_last_childServiceId");
        if (savedCsId) {
          const id = Number(savedCsId);
          if (myServices.some((s) => s.id === id)) setManualCSId(id);
        }
      }
    } catch {}
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 일정표/대시보드에서 ?cs=&ym= 로 넘어오면 해당 아동·월로 자동 작성 시작
  const searchParams = useSearchParams();
  const [autoStarted, setAutoStarted] = useState(false);
  useEffect(() => {
    if (!hydrated || autoStarted) return;
    const csParam = searchParams.get("cs");
    const ymParam = searchParams.get("ym");
    if (!csParam || !ymParam) return;
    const csId = Number(csParam);
    if (myServices.some((s) => s.id === csId) && monthOptions.some((o) => o.value === ymParam)) {
      setManualCSId(csId);
      setManualYm(ymParam);
      setAutoStarted(true);
      void startManual(csId, ymParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      const draft = {
        manualCSId: typeof manualCSId === "number" ? manualCSId : null,
        manualYm, therapist, uploadInfo, grouped, curChild,
      };
      localStorage.setItem(LS_DRAFT, JSON.stringify(draft));
      if (typeof manualCSId === "number") {
        localStorage.setItem("baroilji_last_childServiceId", String(manualCSId));
      }
      localStorage.setItem("baroilji_last_ym", manualYm);
    } catch {}
  }, [hydrated, manualCSId, manualYm, therapist, uploadInfo, grouped, curChild]);

  // 스크롤 위치 복원
  useEffect(() => {
    if (!hydrated) return;
    try {
      const saved = localStorage.getItem(LS_SCROLL);
      if (saved) {
        const y = Number(saved);
        if (!Number.isNaN(y) && y > 0) {
          const t1 = window.setTimeout(() => window.scrollTo(0, y), 50);
          const t2 = window.setTimeout(() => window.scrollTo(0, y), 250);
          return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
        }
      }
    } catch {}
  }, [hydrated]);

  // 스크롤할 때마다 위치 저장 (debounce)
  useEffect(() => {
    if (!hydrated) return;
    let to: number | null = null;
    const onScroll = () => {
      if (to !== null) window.clearTimeout(to);
      to = window.setTimeout(() => {
        try { localStorage.setItem(LS_SCROLL, String(window.scrollY)); } catch {}
      }, 150);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (to !== null) window.clearTimeout(to);
    };
  }, [hydrated]);

  async function startManual(csIdArg?: number, ymArg?: string) {
    const csId = csIdArg ?? (typeof manualCSId === "number" ? manualCSId : 0);
    const ym = ymArg ?? manualYm;
    if (!csId || !ym) return;
    setManualLoading(true);
    try {
      const cs = myServices.find((s) => s.id === csId);
      if (!cs) return;
      const [y, m] = ym.split("-").map(Number);

      // 1) 이 달 일정표가 있으면 회기를 시드로
      const r = await fetch(`/api/schedule/load?childServiceId=${csId}&year=${y}&month=${m}`);
      let scheduleData: { sessions: { day: number; time: string }[]; pvOrg?: string; costUnit?: string } | null = null;
      if (r.ok) scheduleData = await r.json();

      // 2) SessionRow[] 구성 — 우선순위: (3) 일정표 그 달 수정값 → (2) 내 아동 단가 → (1) 내 설정 기본단가
      const tag = cs.hasMultipleServices ? `${cs.name} · ${cs.serviceType}` : cs.name;
      const schedOrg = scheduleData && typeof scheduleData.pvOrg === "string" ? scheduleData.pvOrg.trim() : "";
      const seedOrg = schedOrg || cs.org || defaultOrg;
      const schedUnit = scheduleData && typeof scheduleData.costUnit === "string" ? scheduleData.costUnit.trim() : "";
      const childUnit = cs.defaultUnit && cs.defaultUnit > 0 ? cs.defaultUnit.toLocaleString("ko-KR") : "";
      const centerUnit = centerDefaultUnit > 0 ? centerDefaultUnit.toLocaleString("ko-KR") : "0";
      const seedAmt = schedUnit || childUnit || centerUnit;
      let rows: SessionRow[] = [];
      if (scheduleData && Array.isArray(scheduleData.sessions) && scheduleData.sessions.length > 0) {
        rows = scheduleData.sessions.map((sess) => {
          const [, end] = sess.time.split("~");
          return {
            name: cs.name,
            birth: cs.birthDate ?? "",
            use: `${y}.${pad(m)}.${pad(sess.day)}`,
            end: end || "",
            pay: "",
            appr: "",
            amt: seedAmt,
            org: seedOrg,
          };
        });
      } else {
        // 일정표 없으면 빈 5칸 — 날짜는 그 달의 첫 5주를 자동 분산 (사용자가 폼에서 시간 입력)
        const dim = new Date(y, m, 0).getDate();
        const placeholders = [1, 8, 15, 22, 29].map((d) => Math.min(d, dim));
        rows = placeholders.map((d) => ({
          name: cs.name, birth: cs.birthDate ?? "",
          use: `${y}.${pad(m)}.${pad(d)}`,
          end: "", pay: "", appr: "", amt: seedAmt, org: seedOrg,
        }));
      }

      setGrouped({ [tag]: rows });
      setCurChild(tag);
      setUploadInfo(
        scheduleData
          ? `✓ ${cs.name} ${y}년 ${m}월 일정표에서 회기 ${rows.length}개를 불러왔어요. 결과를 입력하고 저장하세요.`
          : `${cs.name} ${y}년 ${m}월 — 빈 5칸으로 시작했어요. (일정표를 먼저 만들면 회기가 자동으로 채워집니다)`
      );
    } finally {
      setManualLoading(false);
    }
  }
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
          kind: col("결제구분"),
        };

        const g: Grouped = {};
        let retroCount = 0;
        const retroChildSet = new Set<string>();
        const retroByChild: Record<string, number> = {};
        for (let i = hi + 1; i < rows.length; i++) {
          const row = rows[i] as string[] | undefined;
          if (!row || !row[ci.name]) continue;
          const nm = String(row[ci.name]).trim();
          if (!nm) continue;
          const payKind = ci.kind >= 0 ? String(row[ci.kind] || "").trim() : "";
          if (payKind.includes("소급")) {
            retroCount += 1;
            retroChildSet.add(nm);
            retroByChild[nm] = (retroByChild[nm] ?? 0) + 1;
          }
          (g[nm] = g[nm] || []).push({
            name: nm,
            birth: String(row[ci.birth] || ""),
            use: String(row[ci.use] || ""),
            end: String(row[ci.end] || ""),
            pay: String(row[ci.pay] || ""),
            appr: String(row[ci.appr] || ""),
            amt: String(row[ci.amt] || ""),
            org: String(row[ci.org] || ""),
            payKind,
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
        setRetroChildren([...retroChildSet]);
        setRetroByChild(retroByChild);
        setRetroCount(retroCount);
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

  function resetRecord() {
    if (!window.confirm("정말 초기화할까요? 불러온 내용이 사라져요.")) return;
    try {
      localStorage.removeItem(LS_DRAFT);
      localStorage.removeItem(LS_SCROLL);
    } catch {}
    setGrouped({});
    setCurChild(null);
    setRetroChildren([]);
    setRetroByChild({});
    setRetroCount(0);
    setUploadInfo("");
    setError("");
  }

  return (
    <>
      <div className="section-head">
        <div>
          <h2>기록지 작성</h2>
          <p>엑셀 없이 미리 작성하거나, 월말 엑셀을 받은 후 일괄 자동완성 — 둘 다 가능합니다.</p>
        </div>
        <a className="btn" href="/month" style={{ whiteSpace: "nowrap" }}>여러 명 한꺼번에 받기 →</a>
      </div>

      {/* 직접 시작 — 엑셀 없이 */}
      <div className="card">
        <div className="card-header">
          <span className="step">1</span>
          <h2>엑셀 없이 직접 시작</h2>
          <span className="hint">미리 작성 · 일정표 회기를 자동 시드</span>
          <button type="button" className="btn btn-sm" onClick={resetRecord} style={{ marginLeft: "auto", border: "1px solid var(--border)", background: "#fff", fontWeight: 600 }}>
            초기화
          </button>
        </div>
        <div className="card-body">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
            <div className="field" style={{ flex: 1, minWidth: 200 }}>
              <label>아동 · 서비스</label>
              <select
                className="select"
                value={manualCSId === "" ? "" : String(manualCSId)}
                onChange={(e) => setManualCSId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">— 선택 —</option>
                {myServices.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.hasMultipleServices ? ` · ${s.serviceType}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ minWidth: 180 }}>
              <label>연 · 월</label>
              <select className="select" value={manualYm} onChange={(e) => setManualYm(e.target.value)}>
                {monthOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => startManual()}
              disabled={!manualCSId || manualLoading}
            >
              {manualLoading ? "불러오는 중..." : "작성 시작"}
            </button>
          </div>
          <div className="sub-mute" style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.6 }}>
            일정표를 미리 만들어두면 회기 날짜·시간이 자동으로 채워집니다.
            저장하면 나중에 같은 아동·월로 들어와 이어 작성할 수 있어요.
            엑셀이 나중에 도착하면 아래에서 업로드해 승인번호·결제일 등을 보강할 수 있습니다.
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="step">2</span>
          <h2>엑셀로 자동완성 (선택)</h2>
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
            <div className="tip" style={{ marginTop: 12 }}>
              <div>{uploadInfo}</div>
              {retroCount > 0 && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 12.5, color: "var(--danger)", fontWeight: 700 }}>
                    ⚠ 소급결제 {retroCount}건 — 사유서 작성 확인
                  </div>
                  {retroChildren.map((childName) => {
                    const count = retroByChild[childName] ?? 0;
                    return (
                      <button
                        key={childName}
                        type="button"
                        onClick={() => {
                          setCurChild(childName);
                          // 탭이 바뀌고 RecordSheet 가 렌더링된 뒤 첫 번째 소급 회기 카드로 스크롤
                          setTimeout(() => {
                            const el = document.querySelector('[data-retro="true"]');
                            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                          }, 250);
                        }}
                        style={{
                          display: "block",
                          padding: "8px 12px",
                          background: "var(--danger)",
                          color: "#fff",
                          border: "none",
                          borderRadius: "var(--r-sm)",
                          fontWeight: 700,
                          cursor: "pointer",
                          fontSize: 13,
                          textAlign: "left",
                        }}
                      >
                        → {childName} 소급결제 {count}건 — 클릭해서 바로 가기
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {names.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="step">3</span>
            <h2>기록지 입력</h2>
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
                myServices={myServices}
                recordForm={recordForm}
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
  myServices,
  recordForm,
}: {
  child: string;
  rows: SessionRow[];
  therapist: string;
  myServices: MyServiceOption[];
  recordForm: string;
}) {
  const betaUx = useBetaUx();
  // 서식B(동탄)는 '이용자 상태'와 '서비스 결과'가 별도 칸 → 상태 입력칸을 따로 보여준다.
  const splitStatus = recordForm === "dongtan";
  const monthSet = [...new Set(rows.map((s) => parseYMD(s.use)?.mo).filter(Boolean))];
  const month = monthSet[0] ?? "";
  // DB 매칭: 본인 담당 ChildService 중 라벨/이름이 일치.
  // 직접 시작 모드는 라벨이 'name · serviceType' 인 경우가 있음.
  const matchedService = myServices.find((c) => {
    const tag = c.hasMultipleServices ? `${c.name} · ${c.serviceType}` : c.name;
    return tag === child;
  }) ?? myServices.find((c) => c.name === child);
  const childServiceId = matchedService?.id ?? null;
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
  const [amounts, setAmounts] = useState(
    rows.map((s) => (s.amt && String(s.amt).trim()
      ? String(s.amt)
      : (matchedService?.defaultUnit ? matchedService.defaultUnit.toLocaleString("ko-KR") : "0")))
  );
  const [results, setResults] = useState(rows.map(() => ""));
  // 이용자 상태 (서식B 등 상태·결과 분리 양식에서 사용)
  const [statuses, setStatuses] = useState(rows.map(() => ""));
  // 제공일자(일정표) ≠ 승인일자(엑셀) 일 때 입력하는 사유. 저장 시 resultExtra 로 들어감.
  const [mismatchReasons, setMismatchReasons] = useState(rows.map(() => ""));
  // 일정표에서 가져온 회기 예정일 (제공일자). 일정표 회기 ↔ 엑셀 행을 ordinal 로 매칭.
  // 일정표 없으면 null → 그땐 엑셀의 use 날짜로 대체.
  const [scheduleDays, setScheduleDays] = useState<(number | null)[]>(rows.map(() => null));
  const [opinion, setOpinion] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [loadedRecordId, setLoadedRecordId] = useState<number | null>(null);
  const [autoStatus, setAutoStatus] = useState<"" | "saving" | "saved">("");
  const recordTouched = useRef(false); // 사용자가 실제 입력했을 때만 자동저장(빈 기록 생성·덮어쓰기 방지)
  // 저장한 우리 센터 양식 — 있으면 출력 양식 선택
  const [savedForms, setSavedForms] = useState<Array<{ id: number; name: string }>>([]);
  const [outFormId, setOutFormId] = useState<number | "">("");
  useEffect(() => {
    fetch("/api/forms/saved")
      .then((r) => (r.ok ? r.json() : { forms: [] }))
      .then((d) => setSavedForms((d.forms ?? []).filter((f: { kind: string }) => f.kind === "record")))
      .catch(() => {});
  }, []);

  const monthNumForLoad = typeof month === "number" ? month : parseInt(String(month)) || 0;

  // 저장된 기록지가 있으면 자동으로 불러와서 state 채우기 (월 단위)
  // 일정표 회기 날짜 불러와 scheduleDays 에 채워넣기.
  // ordinal(1번째, 2번째...) 로 엑셀 행과 매칭.
  useEffect(() => {
    if (!childServiceId || !monthNumForLoad) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/schedule/load?childServiceId=${childServiceId}&year=${year}&month=${monthNumForLoad}`);
        if (!r.ok || cancelled) return;
        const sched = await r.json();
        if (cancelled) return;
        if (sched && Array.isArray(sched.sessions)) {
          const days: number[] = sched.sessions.map((s: { day: number }) => s.day);
          setScheduleDays(rows.map((_, i) => days[i] ?? null));
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [childServiceId, monthNumForLoad, year, rows]);

  useEffect(() => {
    if (!childServiceId || !monthNumForLoad) return;
    // 아동/월 전환 — 자동저장 게이트 초기화(이전 아동 데이터로 잘못 저장 방지)
    recordTouched.current = false; setLoadedRecordId(null); setAutoStatus("");
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/record/load?childServiceId=${childServiceId}&year=${year}&month=${monthNumForLoad}`);
        if (!r.ok || cancelled) return;
        const rec = await r.json();
        if (cancelled || !rec || !rec.id) return;
        setLoadedRecordId(rec.id);
        setOpinion(rec.opinion ?? "");
        if (rec.formId) setOutFormId(rec.formId); // 저장 시 기억한 출력 양식 복원
        const sm = new Map<number, RecordSessionData>();
        for (const s of rec.sessions as RecordSessionData[]) sm.set(s.ordinal, s);
        setTimes((prev) => prev.map((t, i) => {
          const s = sm.get(i + 1);
          return s ? { start: s.startTime ?? t.start, end: s.endTime ?? t.end } : t;
        }));
        setVouchers((prev) => prev.map((v, i) => sm.get(i + 1)?.voucher ?? v));
        setExtras((prev) => prev.map((v, i) => sm.get(i + 1)?.extra ?? v));
        // 총이용금액은 저장된 옛 값으로 덮지 않고, 항상 현재 회당단가(시드값)를 유지
        setResults((prev) => prev.map((v, i) => sm.get(i + 1)?.result ?? v));
        setStatuses((prev) => prev.map((v, i) => sm.get(i + 1)?.status ?? v));
        setMismatchReasons((prev) => prev.map((v, i) => {
          const sess = sm.get(i + 1);
          // 일부 RecordSession 에 resultExtra 가 있을 수도 있음
          return (sess as { resultExtra?: string | null } | undefined)?.resultExtra ?? v;
        }));
        setSavedMsg(`✓ ${rec.year}년 ${rec.month}월 저장된 기록을 불러왔어요.`);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [childServiceId, year, monthNumForLoad]);

  // 전월 기록 가져오기 — 가장 최근 저장된 기록의 result/opinion 을 현재 기록 폼에 복사.
  // 회기 수가 달라도 가능한 만큼만 복사.
  async function copyPrevRecord() {
    if (!childServiceId) {
      alert("아동을 먼저 선택하세요.");
      return;
    }
    // 이전 달 기록 찾기 — childServiceId 로 가장 최근 기록 (현재 월 제외)
    let py = year, pm = monthNumForLoad - 1;
    if (pm < 1) { py -= 1; pm = 12; }
    try {
      const r = await fetch(`/api/record/load?childServiceId=${childServiceId}&year=${py}&month=${pm}`);
      if (!r.ok) { alert("이전 달 기록을 못 찾았어요."); return; }
      const rec = await r.json();
      if (!rec || !rec.id) { alert(`${py}년 ${pm}월 기록이 없어요.`); return; }
      // opinion 복사
      setOpinion(rec.opinion ?? "");
      // 각 회차 result 를 현재 회차에 매핑 (앞에서부터)
      const recSessions = rec.sessions as RecordSessionData[];
      setResults((prev) => prev.map((v, i) => recSessions[i]?.result ?? v));
      setStatuses((prev) => prev.map((v, i) => recSessions[i]?.status ?? v));
      setSavedMsg(`✓ ${py}년 ${pm}월 기록 내용을 가져왔어요. 수정 후 저장하세요.`);
    } catch {
      alert("불러오기 실패");
    }
  }

  async function saveRecord() {
    if (!childServiceId) {
      alert("이 아동이 시스템에 등록돼 있지 않아 저장할 수 없어요. 원장님께 아동 등록을 요청해주세요.");
      return;
    }
    setSaving(true);
    setSavedMsg("");
    try {
      const payload = {
        childServiceId,
        year,
        month: monthNumForLoad,
        org,
        childName: child,
        childBirth: birth,
        opinion,
        sessions: rows.map((s, i) => {
          const pu = parseYMD(s.use);
          const pp = parseYMD(s.pay);
          const useDayNum = useDays[i];
          return {
            ordinal: i + 1,
            date: pu ? `${pu.mo}/${pu.d}` : "",
            startTime: times[i].start,
            endTime: times[i].end,
            voucher: vouchers[i],
            extra: extras[i],
            amount: amounts[i],
            useDay: useDayNum !== null ? String(useDayNum) : "",
            payDay: pp ? String(pp.d) : "",
            apprNumber: s.appr,
            result: results[i],
            resultExtra: mismatchReasons[i] || undefined,
            status: statuses[i] || undefined,
          };
        }),
        formId: outFormId || undefined, // 출력 양식 기억(일괄 출력에 사용)
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
        const useDayNum = useDays[i];
        return {
          date: pu ? `${pu.mo}/${pu.d}` : "",
          startTime: times[i].start,
          endTime: times[i].end,
          voucher: vouchers[i],
          extra: extras[i],
          amount: amounts[i],
          useDay: useDayNum !== null ? String(useDayNum) : "",
          payDay: pp ? String(pp.d) : "",
          apprNumber: s.appr,
          result: results[i],
          resultExtra: mismatchReasons[i] || undefined,
          status: statuses[i] || undefined,
        };
      });
      const payload = {
        childName: child,
        childBirth: birth,
        org,
        month: monthNum,
        sessions: sessionsPayload,
        opinion,
        serviceType: matchedService?.serviceType,
        formId: outFormId || undefined,
        therapist,
        childServiceId: childServiceId || undefined, // 통합 양식 일정표 보강용
        year,
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

  // 제공일자(useDay) 매칭 — 같은 일자 우선, 남는 회기는 순서대로 할당.
  // 1,3,8,13,15 일정에 3,5,8,13,15 엑셀이 오면 3·8·13·15 는 자동 일치, 5 는 1 로 매핑.
  const useDays = useMemo(() => {
    const payDs = rows.map((s) => parseYMD(s.pay)?.d ?? null);
    const matched = pairScheduleDays(scheduleDays, payDs);
    return matched.map((d, i) => d ?? (parseYMD(rows[i].use)?.d ?? null));
  }, [scheduleDays, rows]);

  // 작업 중 자동 저장 — 사용자가 실제 입력했거나(이미 저장된 기록 편집 중) 일 때만 조용히 서버 저장.
  // (다른 컴퓨터에서도 같은 아동·월을 고르면 자동으로 불러와짐)
  async function autoSaveRecord() {
    if (!childServiceId) return;
    if (loadedRecordId === null && !recordTouched.current) return;
    setAutoStatus("saving");
    try {
      const payload = {
        childServiceId, year, month: monthNumForLoad, org, childName: child, childBirth: birth, opinion,
        sessions: rows.map((s, i) => {
          const pu = parseYMD(s.use); const pp = parseYMD(s.pay); const useDayNum = useDays[i];
          return {
            ordinal: i + 1, date: pu ? `${pu.mo}/${pu.d}` : "", startTime: times[i].start, endTime: times[i].end,
            voucher: vouchers[i], extra: extras[i], amount: amounts[i],
            useDay: useDayNum !== null ? String(useDayNum) : "", payDay: pp ? String(pp.d) : "",
            apprNumber: s.appr, result: results[i], resultExtra: mismatchReasons[i] || undefined, status: statuses[i] || undefined,
          };
        }),
        formId: outFormId || undefined,
      };
      const res = await fetch("/api/record/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) { const j = await res.json(); setLoadedRecordId(j.recordId); setAutoStatus("saved"); }
      else setAutoStatus("");
    } catch { setAutoStatus(""); }
  }

  useEffect(() => {
    if (!childServiceId) return;
    if (loadedRecordId === null && !recordTouched.current) return;
    const t = window.setTimeout(() => { void autoSaveRecord(); }, 1800);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childServiceId, year, monthNumForLoad, rows, times, vouchers, extras, amounts, results, statuses, mismatchReasons, opinion, useDays, outFormId, loadedRecordId]);

  const topCols = rows.map((s, i) => {
    const ud = useDays[i];
    const monthForCol = typeof month === "number" ? month : (parseYMD(s.use)?.mo ?? "");
    const md = ud != null && monthForCol !== "" ? `${monthForCol}/${ud}` : (parseYMD(s.use) ? `${parseYMD(s.use)!.mo}/${parseYMD(s.use)!.d}` : s.use);
    return { i, md };
  });

  return (
    <div className="sheet" onChangeCapture={() => { recordTouched.current = true; }}>
      <div className="sheet-title">발달재활서비스 제공 기록지 ({month}월)</div>
      <table className="meta-tbl">
        <tbody>
          <tr><td className="lbl">제공기관명</td><td colSpan={3}>{org}</td></tr>
          <tr>
            <td className="lbl">이용자</td><td>{child}</td>
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
          const pp = parseYMD(s.pay);
          const useD = useDays[i];
          const payD = pp ? pp.d : null;
          const hasBoth = useD !== null && payD !== null;
          const match = hasBoth && useD === payD;
          const isRetro = (s.payKind || "").includes("소급");
          return (
            <div
              key={i}
              className={"result-row" + (match ? "" : hasBoth ? " mismatch" : "")}
              data-retro={isRetro ? "true" : undefined}
            >
              <div className="rr-head">
                <span className="pill">제공일자 {useD ?? "?"}일</span>
                <span className="pill">승인일자 {payD ?? "?"}일</span>
                <span className="pill appr">승인 {s.appr}</span>
                {isRetro && (
                  <span className="pill" style={{ background: "var(--danger)", color: "#fff", fontWeight: 700 }}>
                    소급결제
                  </span>
                )}
                {!hasBoth
                  ? <span className="sub-mute" style={{ fontSize: 11.5 }}>(엑셀 미업로드)</span>
                  : match
                    ? <span className="okflag">✓ 일치</span>
                    : <span className="warnflag">⚠ 제공일자≠승인일자 — 사유 작성 필요</span>}
              </div>
              {splitStatus && (
                <div style={{ marginBottom: 8 }}>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-soft)", marginBottom: 4 }}>
                    이용자 상태
                  </label>
                  <textarea
                    className="textarea"
                    rows={2}
                    value={statuses[i]}
                    placeholder="그날 이용자 상태 (이 서식은 상태·결과 칸이 나뉘어 있어요)"
                    onChange={(e) => setStatuses((p) => { const n = [...p]; n[i] = e.target.value; return n; })}
                  />
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-soft)", margin: "8px 0 4px" }}>
                    서비스 결과
                  </label>
                </div>
              )}
              <textarea
                className="textarea"
                rows={6}
                value={results[i]}
                placeholder=""
                onChange={(e) => setResults((p) => { const n = [...p]; n[i] = e.target.value; return n; })}
              />
              {hasBoth && !match && (
                <div style={{ marginTop: 8 }}>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--danger)", marginBottom: 4 }}>
                    불일치 사유
                  </label>
                  <input
                    className="input"
                    value={mismatchReasons[i]}
                    onChange={(e) => setMismatchReasons((p) => { const n = [...p]; n[i] = e.target.value; return n; })}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="opinion">
        <h3>부모 상담 종합 의견</h3>
        <textarea
          className="textarea"
          rows={5}
          value={opinion}
          placeholder=""
          onChange={(e) => setOpinion(e.target.value)}
        />
      </div>

      {savedMsg && <div className="flash ok" style={{ marginTop: 14 }}>{savedMsg}</div>}
      {!childServiceId && (
        <div className="flash warn" style={{ marginTop: 14 }}>
          ⚠ <b>{child}</b> 가 시스템에 등록된 아동과 일치하지 않아요. 저장하려면 같은 이름으로 먼저 아동을 등록해주세요.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 20 }}>
        <button
          type="button"
          className="btn"
          onClick={copyPrevRecord}
          disabled={!childServiceId}
          title="이전 달 기록의 결과·총평을 복사 (수정 후 저장)"
        >
          전월 기록 가져오기
        </button>
        <button className="btn" onClick={saveRecord} disabled={saving || !childServiceId}>
          {saving ? "저장 중..." : "현재 내용 저장"}
        </button>
        {savedForms.length > 0 ? (
          <select
            value={outFormId}
            onChange={(e) => setOutFormId(e.target.value ? Number(e.target.value) : "")}
            title="출력에 사용할 양식"
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 13, color: "var(--text)" }}
          >
            <option value="">기본 양식</option>
            {savedForms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        ) : betaUx ? (
          <Link href="/forms" className="sub-mute" style={{ fontSize: 12, whiteSpace: "nowrap" }} title="우리 센터 양식을 저장하면 여기서 선택할 수 있어요">
            기본 양식 사용 중 · <b>우리 센터 양식 저장 →</b>
          </Link>
        ) : null}
        <button className="btn btn-primary" onClick={downloadHwpx} disabled={downloading}>
          {downloading ? "생성 중..." : "한글파일(.hwpx) 다운로드"}
        </button>
      </div>
      <div className="sub-mute" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.6 }}>
        💾 작성하면 <b>자동으로 저장</b>돼요{autoStatus === "saving" ? " (저장 중…)" : autoStatus === "saved" ? " ✓ 저장됨" : ""}.
        다른 컴퓨터(집·센터 등)에서도 위에서 <b>같은 아동·월</b>을 고르면 이어서 작성할 수 있어요.
      </div>
    </div>
  );
}
