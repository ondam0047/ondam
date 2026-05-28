"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  WEEK, SLOTS, SERVICE_TYPES, holiday, pad,
} from "@/lib/constants";

type Session = { time: string; makeup: boolean };
type SessionMap = Record<number, Session>; // day-of-month -> Session

type ChildOption = {
  id: number;
  name: string;
  birthDate: string | null;
  serviceType: string;
  mgmtNumber: string | null;
  defaultSlot: string | null;
  defaultDays: string | null;
  defaultUnit: number;
  defaultTarget: number;
  therapistName: string | null;
};
type TherapistOption = { id: number; name: string };

// 오늘을 기준으로 [전월 1개 + 이번 달 + 다음 6개월] 자동 생성
function buildMonthOptions(): { value: string; label: string; current: boolean }[] {
  const now = new Date();
  const baseYear = now.getFullYear();
  const baseMonth = now.getMonth() + 1; // 1..12
  const out: { value: string; label: string; current: boolean }[] = [];
  for (let offset = -1; offset <= 6; offset++) {
    const total = baseYear * 12 + (baseMonth - 1) + offset;
    const y = Math.floor(total / 12);
    const m = (total % 12) + 1;
    out.push({
      value: `${y}-${m}`,
      label: `${y}년 ${m}월${offset === 0 ? " (이번 달)" : ""}`,
      current: offset === 0,
    });
  }
  return out;
}

export default function ScheduleClient({
  children: childrenOpts,
  therapists,
}: {
  children: ChildOption[];
  therapists: TherapistOption[];
}) {
  // 오늘 기준 월 옵션 (매 렌더 한 번 계산)
  const monthOptions = useMemo(() => buildMonthOptions(), []);
  const defaultYm = monthOptions.find((o) => o.current)?.value ?? monthOptions[0].value;

  // form
  const [selectedChildId, setSelectedChildId] = useState<number | "">("");
  const [name, setName] = useState("");
  const [therapist, setTherapist] = useState(therapists[0]?.name ?? "");
  const [serviceType, setServiceType] = useState<string>(SERVICE_TYPES[0]);
  const [ym, setYm] = useState(defaultYm);
  const [target, setTarget] = useState(5);
  const [defaultSlot, setDefaultSlot] = useState(""); // 미선택
  const [pattern, setPattern] = useState<number[]>([]); // 미선택
  const [childBirth, setChildBirth] = useState<string>("");

  // generated
  const [sessions, setSessions] = useState<SessionMap | null>(null);
  const [genY, setGenY] = useState(0);
  const [genM, setGenM] = useState(0);
  const [mgmt, setMgmt] = useState("");
  const [pvOrg, setPvOrg] = useState("온담말언어발달센터");
  const [pvTel, setPvTel] = useState("775-0047");
  const [pvCharge, setPvCharge] = useState("");
  const [pvType, setPvType] = useState("");
  const [costUnit, setCostUnit] = useState("65,000");
  const [costSelf, setCostSelf] = useState("0");
  const [downloading, setDownloading] = useState(false);

  // day editor modal
  const [editDay, setEditDay] = useState<number | null>(null);
  const [editTime, setEditTime] = useState(defaultSlot);
  const [editMakeup, setEditMakeup] = useState(false);
  const editExists = editDay !== null && sessions !== null && sessions[editDay] !== undefined;

  function togglePattern(i: number) {
    setPattern((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].sort()));
  }

  function loadChild(idStr: string) {
    const id = idStr === "" ? "" : Number(idStr);
    setSelectedChildId(id);
    if (id === "") return;
    const c = childrenOpts.find((x) => x.id === id);
    if (!c) return;
    setName(c.name);
    setChildBirth(c.birthDate ?? "");
    if (c.therapistName) setTherapist(c.therapistName);
    if (c.serviceType) setServiceType(c.serviceType);
    setMgmt(c.mgmtNumber ?? "");
    if (c.defaultSlot) setDefaultSlot(c.defaultSlot);
    if (c.defaultDays) {
      const ds = c.defaultDays.split(",").filter(Boolean).map(Number);
      if (ds.length) setPattern(ds);
    }
    if (c.defaultUnit) setCostUnit(c.defaultUnit.toLocaleString("ko-KR"));
    if (c.defaultTarget) setTarget(c.defaultTarget);
  }

  function generate() {
    const [y, m] = ym.split("-").map(Number);
    const dim = new Date(y, m, 0).getDate();
    const next: SessionMap = {};
    for (let d = 1; d <= dim; d++) {
      const wd = new Date(y, m - 1, d).getDay();
      if (pattern.includes(wd) && !holiday(y, m, d)) {
        next[d] = { time: defaultSlot, makeup: false };
      }
    }
    setSessions(next);
    setGenY(y);
    setGenM(m);
    setPvCharge(therapist);
    setPvType(serviceType);
    requestAnimationFrame(() => {
      document.getElementById("schedCard")?.scrollIntoView({ behavior: "smooth" });
    });
  }

  function openEditor(d: number) {
    setEditDay(d);
    const existing = sessions?.[d];
    setEditTime(existing?.time ?? defaultSlot);
    setEditMakeup(existing ? existing.makeup : true);
  }

  function closeEditor() { setEditDay(null); }

  function saveEditor() {
    if (editDay === null || sessions === null) return;
    setSessions({ ...sessions, [editDay]: { time: editTime, makeup: editMakeup } });
    closeEditor();
  }

  function removeEditor() {
    if (editDay === null || sessions === null) return;
    const next = { ...sessions };
    delete next[editDay];
    setSessions(next);
    closeEditor();
  }

  // derived
  const days = useMemo(() =>
    sessions ? Object.keys(sessions).map(Number).sort((a, b) => a - b) : [],
    [sessions]
  );
  const totalCount = days.length;
  const cycle = useMemo(() => {
    if (!sessions) return "";
    const wds = [...new Set(days.map((d) => new Date(genY, genM - 1, d).getDay()))].sort();
    return wds.map((w) => WEEK[w]).join(" ");
  }, [sessions, days, genY, genM]);
  const writeDate = useMemo(() => {
    if (!sessions) return "";
    const prevLast = new Date(genY, genM - 1, 0);
    return `${String(prevLast.getFullYear()).slice(2)}.${pad(prevLast.getMonth() + 1)}.${pad(prevLast.getDate())}`;
  }, [sessions, genY, genM]);
  const unitNumber = parseInt(costUnit.replace(/[^\d]/g, "")) || 0;
  const costTotal = unitNumber * totalCount;

  async function downloadDocx() {
    if (!sessions) return;
    setDownloading(true);
    try {
      const payload = {
        childName: name,
        childBirth,
        therapist,
        serviceType,
        year: genY,
        month: genM,
        mgmtNumber: mgmt,
        writeDate,
        pvOrg, pvTel, pvCharge, pvType,
        costUnit, costSelf, costTotal,
        cycle,
        target,
        sessions: days.map((d) => ({
          day: d,
          weekday: WEEK[new Date(genY, genM - 1, d).getDay()],
          time: sessions[d].time,
          makeup: sessions[d].makeup,
        })),
      };
      const res = await fetch("/api/schedule/docx", {
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
      a.download = `${name || "일정표"}_${genY}년${pad(genM)}월.docx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <div className="card">
        <h2><span className="n">1</span>아동 정보 & 패턴 설정</h2>

        {childrenOpts.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <label className="fl">저장된 아동 불러오기</label>
            <select value={selectedChildId === "" ? "" : String(selectedChildId)} onChange={(e) => loadChild(e.target.value)}>
              <option value="">— 직접 입력 —</option>
              {childrenOpts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.therapistName ? ` · ${c.therapistName}` : ""}
                  {c.defaultSlot ? ` · ${c.defaultSlot}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        {childrenOpts.length === 0 && (
          <div className="hint" style={{ marginBottom: 14 }}>
            💡 <Link href="/children/new" style={{ color: "var(--forest)", fontWeight: 700 }}>아동을 미리 등록</Link>해두면 매월 정보 입력 없이 한 번에 불러올 수 있어요.
          </div>
        )}

        <div className="field-grid">
          <div>
            <label className="fl">대상자 성명</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="fl">치료사(제공자)</label>
            {therapists.length > 0 ? (
              <select value={therapist} onChange={(e) => setTherapist(e.target.value)}>
                {therapists.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                {!therapists.some((t) => t.name === therapist) && therapist && (
                  <option value={therapist}>{therapist}</option>
                )}
              </select>
            ) : (
              <input value={therapist} onChange={(e) => setTherapist(e.target.value)} />
            )}
          </div>
          <div>
            <label className="fl">서비스 종류</label>
            <select value={serviceType} onChange={(e) => setServiceType(e.target.value)}>
              {SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="fl">대상 월</label>
            <select value={ym} onChange={(e) => setYm(e.target.value)}>
              {monthOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="fl">목표 회기 수</label>
            <select value={target} onChange={(e) => setTarget(Number(e.target.value))}>
              {[4, 5, 6, 7, 8].map((i) => <option key={i} value={i}>{i}회</option>)}
            </select>
          </div>
          <div>
            <label className="fl">치료 시간대</label>
            <select value={defaultSlot} onChange={(e) => setDefaultSlot(e.target.value)}>
              <option value="">(선택)</option>
              {SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <label className="fl">반복 요일 (탭하여 선택)</label>
          <div className="daypick">
            {WEEK.map((w, i) => {
              const on = pattern.includes(i);
              const cls = "daychip" + (on ? " on" : "") + (i === 0 ? " sun" : "");
              return (
                <div key={w} className={cls} onClick={() => togglePattern(i)}>{w}</div>
              );
            })}
          </div>
        </div>
        <div style={{ marginTop: 18 }}>
          <button
            className="btn"
            onClick={generate}
            disabled={!name.trim() || !defaultSlot || pattern.length === 0}
          >일정표 생성</button>
          {(!defaultSlot || pattern.length === 0) && (
            <span className="hint" style={{ marginLeft: 12 }}>
              {!defaultSlot && "치료 시간대를 선택"}
              {!defaultSlot && pattern.length === 0 && "하고, "}
              {pattern.length === 0 && "반복 요일을 한 개 이상 선택"}
              해주세요.
            </span>
          )}
        </div>
      </div>

      {sessions && (
        <div className="card" id="schedCard">
          <div className="sched-head">
            <div className="sheet-title" style={{ margin: 0, textAlign: "left" }}>
              서비스 일정표 ({genM}월)
            </div>
            <div className={"counter " + (totalCount === target ? "ok" : "short")}>
              {totalCount === target
                ? `목표 ${target}회 · 현재 ${totalCount}회 ✓`
                : `목표 ${target}회 · 현재 ${totalCount}회 (${totalCount < target ? "부족" : "초과"} ${Math.abs(target - totalCount)}회)`}
            </div>
          </div>

          <table className="meta-tbl">
            <tbody>
              <tr>
                <td className="lbl">사회복지서비스<br />관리번호</td>
                <td><input value={mgmt} onChange={(e) => setMgmt(e.target.value)} placeholder="(선택)" /></td>
                <td className="lbl">성 명</td><td>{name}</td>
              </tr>
              <tr>
                <td className="lbl">사회복지서비스<br />제공자</td><td>{therapist}</td>
                <td className="lbl">작성일자</td><td>{writeDate}</td>
              </tr>
            </tbody>
          </table>

          <CalendarTable y={genY} m={genM} sessions={sessions} onCellClick={openEditor} />

          <div className="hint">
            · 초록칸 = 정규 회기 · <span style={{ color: "var(--terracotta)", fontWeight: 700 }}>주황칸 = 보강</span>
            · <span style={{ color: "var(--warn)", fontWeight: 700 }}>빨강칸 = 공휴일</span><br />
            · 날짜를 탭하면 <b>회기 추가·시간 변경·제거</b>를 할 수 있어요.
          </div>

          <div style={{ marginTop: 22 }}>
            <div className="block-label">서비스 제공현황</div>
            <div className="scroll">
              <table className="prov-tbl">
                <tbody>
                  <tr>
                    <th>서비스 제공자명</th><th>전 화</th><th>담 당</th>
                    <th>서비스 종류</th><th>주기</th><th>제공일</th>
                  </tr>
                  <tr>
                    <td><input value={pvOrg} onChange={(e) => setPvOrg(e.target.value)} style={{ minWidth: 120 }} /></td>
                    <td><input value={pvTel} onChange={(e) => setPvTel(e.target.value)} style={{ width: 78 }} /></td>
                    <td><input value={pvCharge} onChange={(e) => setPvCharge(e.target.value)} style={{ width: 64 }} /></td>
                    <td><input value={pvType} onChange={(e) => setPvType(e.target.value)} style={{ width: 84 }} /></td>
                    <td>{cycle}</td>
                    <td>{days.join(" ")}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <div className="block-label">서비스 비용</div>
            <div className="scroll">
              <table className="prov-tbl">
                <tbody>
                  <tr>
                    <th>서비스 종류</th><th>서비스 단가(/회)</th><th>횟수</th>
                    <th>총 서비스 가격</th><th>본인부담금</th>
                  </tr>
                  <tr>
                    <td>{pvType}</td>
                    <td>
                      <input value={costUnit} onChange={(e) => setCostUnit(e.target.value)} style={{ width: 80 }} />원
                    </td>
                    <td>{totalCount}</td>
                    <td style={{ fontWeight: 700 }}>{costTotal.toLocaleString("ko-KR")}원</td>
                    <td><input value={costSelf} onChange={(e) => setCostSelf(e.target.value)} style={{ width: 56 }} /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="actions">
            <button className="btn" onClick={downloadDocx} disabled={downloading}>
              {downloading ? "생성 중..." : "한글파일(.docx) 다운로드"}
            </button>
            <button className="btn ghost sm" onClick={() => window.print()}>인쇄 / PDF 저장</button>
            <span className="hint" style={{ margin: 0 }}>
              .docx 파일은 한글에서 바로 열어 편집·저장할 수 있어요.
            </span>
          </div>
        </div>
      )}

      {editDay !== null && sessions !== null && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) closeEditor(); }}>
          <div className="modal">
            <div className="modal-title">
              {genM}월 {editDay}일 ({WEEK[new Date(genY, genM - 1, editDay).getDay()]})
            </div>
            <label className="fl">치료 시간대</label>
            <select value={editTime} onChange={(e) => setEditTime(e.target.value)} style={{ marginBottom: 14 }}>
              {SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <label className="modal-check">
              <input type="checkbox" checked={editMakeup} onChange={(e) => setEditMakeup(e.target.checked)} />
              보강 회기로 표시
            </label>
            <div className="modal-actions">
              <button className="btn" onClick={saveEditor}>{editExists ? "시간 변경" : "회기 추가"}</button>
              {editExists && (
                <button className="btn ghost sm danger" onClick={removeEditor}>회기 제거</button>
              )}
              <button
                className="btn ghost sm"
                style={{ borderColor: "var(--line)", color: "var(--muted)" }}
                onClick={closeEditor}
              >취소</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function CalendarTable({
  y, m, sessions, onCellClick,
}: {
  y: number; m: number; sessions: SessionMap; onCellClick: (d: number) => void;
}) {
  const dim = new Date(y, m, 0).getDate();
  const first = new Date(y, m - 1, 1).getDay();
  const cells: { d: number | null; hol: string | null; sess: Session | null }[] = [];
  for (let i = 0; i < first; i++) cells.push({ d: null, hol: null, sess: null });
  for (let d = 1; d <= dim; d++) {
    cells.push({ d, hol: holiday(y, m, d), sess: sessions[d] ?? null });
  }
  while (cells.length % 7 !== 0) cells.push({ d: null, hol: null, sess: null });

  const rows: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return (
    <table className="cal">
      <thead>
        <tr>
          {WEEK.map((w, i) => <th key={w} className={i === 0 ? "sun" : ""}>{w}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri}>
            {row.map((c, ci) => {
              if (c.d === null) return <td key={ci} className="empty"></td>;
              if (c.hol) {
                return (
                  <td key={ci} className="holi">
                    <div className="dnum">{c.d}</div>
                    <div className="hname">{c.hol}</div>
                  </td>
                );
              }
              const sessClass = c.sess ? (c.sess.makeup ? "sess makeup" : "sess") : "";
              return (
                <td key={ci} className={sessClass} onClick={() => onCellClick(c.d!)}>
                  <div className="dnum">{c.d}</div>
                  {c.sess && (
                    <div className="stime">
                      {c.sess.time}
                      {c.sess.makeup && <div className="badge">보강</div>}
                    </div>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
