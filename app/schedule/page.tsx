"use client";

import { useMemo, useState } from "react";
import {
  WEEK, SLOTS, SERVICE_TYPES, holiday, pad,
} from "@/lib/constants";

type Session = { time: string; makeup: boolean };
type SessionMap = Record<number, Session>; // day-of-month -> Session

const MONTH_OPTIONS = [
  [2026, 2], [2026, 3], [2026, 4], [2026, 5],
  [2026, 6], [2026, 7], [2026, 8], [2026, 9],
] as const;

export default function SchedulePage() {
  // form
  const [name, setName] = useState("노하은");
  const [therapist, setTherapist] = useState("주채린");
  const [serviceType, setServiceType] = useState<string>(SERVICE_TYPES[0]);
  const [ym, setYm] = useState("2026-3");
  const [target, setTarget] = useState(5);
  const [defaultSlot, setDefaultSlot] = useState("16:00~16:50");
  const [pattern, setPattern] = useState<number[]>([3, 4]); // 수, 목

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

  // day editor modal
  const [editDay, setEditDay] = useState<number | null>(null);
  const [editTime, setEditTime] = useState(defaultSlot);
  const [editMakeup, setEditMakeup] = useState(false);
  const editExists = editDay !== null && sessions !== null && sessions[editDay] !== undefined;

  function togglePattern(i: number) {
    setPattern((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].sort()));
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
    // scroll to result on next tick
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

  function closeEditor() {
    setEditDay(null);
  }

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

  return (
    <>
      <div className="card">
        <h2><span className="n">1</span>아동 정보 & 패턴 설정</h2>
        <div className="field-grid">
          <div>
            <label className="fl">대상자 성명</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="fl">치료사(제공자)</label>
            <input value={therapist} onChange={(e) => setTherapist(e.target.value)} />
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
              {MONTH_OPTIONS.map(([y, m]) => (
                <option key={`${y}-${m}`} value={`${y}-${m}`}>{`${y}년 ${m}월`}</option>
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
          <button className="btn" onClick={generate}>일정표 생성</button>
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

          <CalendarTable
            y={genY} m={genM} sessions={sessions}
            onCellClick={openEditor}
          />

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
            <button className="btn ghost sm" onClick={() => window.print()}>인쇄 / PDF 저장</button>
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
