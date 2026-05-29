"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  defaultFilterTherapist = null,
  defaultOrg = "",
}: {
  children: ChildOption[];
  therapists: TherapistOption[];
  defaultFilterTherapist?: string | null;
  defaultOrg?: string;
}) {
  // 오늘 기준 월 옵션 (매 렌더 한 번 계산)
  const monthOptions = useMemo(() => buildMonthOptions(), []);
  const defaultYm = monthOptions.find((o) => o.current)?.value ?? monthOptions[0].value;

  // form
  const [selectedChildId, setSelectedChildId] = useState<number | "">("");
  const [name, setName] = useState("");
  const [therapist, setTherapist] = useState(therapists[0]?.name ?? "");
  // 아동 드롭다운 필터용 (양식엔 안 들어가는 UI-only 값).
  // 로그인 사용자 이름이 치료사 명단에 있으면 자동으로 그 치료사로 필터.
  const [filterTherapist, setFilterTherapist] = useState<string>(defaultFilterTherapist ?? "");
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
  const [pvOrg, setPvOrg] = useState(defaultOrg);
  const [pvTel, setPvTel] = useState("775-0047");
  const [pvCharge, setPvCharge] = useState("");
  const [pvType, setPvType] = useState("");
  const [costUnit, setCostUnit] = useState("65,000");
  const [costSelf, setCostSelf] = useState("0");
  const [writeDate, setWriteDate] = useState("");
  const [downloadingHwpx, setDownloadingHwpx] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  // 저장된 일정표 목록 (선택된 아동 기준으로 fetch)
  type SavedRow = {
    id: number; year: number; month: number;
    target: number; updatedAt: string;
    _count: { sessions: number };
  };
  const [savedList, setSavedList] = useState<SavedRow[]>([]);
  const [loadedScheduleId, setLoadedScheduleId] = useState<number | null>(null);

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
    setLoadedScheduleId(null);
    setSavedMsg("");
    if (id === "") {
      setSavedList([]);
      return;
    }
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

  // 아동 변경 시 저장된 일정표 목록 fetch
  const refreshSavedList = useCallback(async (childId: number) => {
    const res = await fetch(`/api/schedule/list?childId=${childId}`);
    if (!res.ok) { setSavedList([]); return; }
    setSavedList((await res.json()) as SavedRow[]);
  }, []);

  useEffect(() => {
    if (typeof selectedChildId === "number") {
      refreshSavedList(selectedChildId);
    } else {
      setSavedList([]);
    }
  }, [selectedChildId, refreshSavedList]);

  async function loadSavedSchedule(idStr: string) {
    if (!idStr) return;
    const id = Number(idStr);
    const res = await fetch(`/api/schedule/load?id=${id}`);
    if (!res.ok) { alert("불러오기 실패"); return; }
    const s = await res.json();
    // 폼 값 채우기
    setYm(`${s.year}-${s.month}`);
    setTherapist(s.therapist);
    setServiceType(s.serviceType);
    setTarget(s.target);
    setMgmt(s.mgmtNumber ?? "");
    setPvOrg(s.pvOrg);
    setPvTel(s.pvTel ?? "");
    setPvCharge(s.pvCharge ?? "");
    setPvType(s.pvType);
    setCostUnit(s.costUnit);
    setCostSelf(s.costSelf);
    // 회기 세팅
    const sessMap: SessionMap = {};
    for (const sess of s.sessions) {
      sessMap[sess.day] = { time: sess.time, makeup: sess.makeup };
    }
    setSessions(sessMap);
    setGenY(s.year);
    setGenM(s.month);
    setWriteDate(s.writeDate ?? defaultWriteDate(s.year, s.month));
    setLoadedScheduleId(id);
    setSavedMsg(`✓ ${s.year}년 ${s.month}월 일정표를 불러왔어요.`);
    requestAnimationFrame(() => {
      document.getElementById("schedCard")?.scrollIntoView({ behavior: "smooth" });
    });
  }

  async function saveSchedule() {
    if (!sessions || typeof selectedChildId !== "number") return;
    setSaving(true);
    setSavedMsg("");
    try {
      const payload = {
        childId: selectedChildId,
        year: genY,
        month: genM,
        therapist,
        serviceType,
        target,
        mgmtNumber: mgmt,
        pvOrg, pvTel, pvCharge, pvType,
        costUnit, costSelf,
        writeDate,
        sessions: days.map((d) => ({
          day: d, time: sessions[d].time, makeup: sessions[d].makeup,
        })),
      };
      const res = await fetch("/api/schedule/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { alert("저장 실패"); return; }
      const j = await res.json();
      setLoadedScheduleId(j.scheduleId);
      setSavedMsg(`✓ ${genY}년 ${genM}월 일정표가 저장되었어요.`);
      await refreshSavedList(selectedChildId);
    } finally {
      setSaving(false);
    }
  }

  async function deleteSaved(id: number) {
    if (!confirm("이 일정표를 정말 삭제할까요?")) return;
    const res = await fetch("/api/schedule/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) { alert("삭제 실패"); return; }
    if (typeof selectedChildId === "number") await refreshSavedList(selectedChildId);
    if (loadedScheduleId === id) {
      setLoadedScheduleId(null);
      setSavedMsg("");
    }
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
    setWriteDate(defaultWriteDate(y, m));
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
  function defaultWriteDate(y: number, m: number) {
    const prevLast = new Date(y, m - 1, 0);
    return `${String(prevLast.getFullYear()).slice(2)}.${pad(prevLast.getMonth() + 1)}.${pad(prevLast.getDate())}`;
  }
  const unitNumber = parseInt(costUnit.replace(/[^\d]/g, "")) || 0;
  const costTotal = unitNumber * totalCount;

  async function downloadHwpx() {
    if (!sessions) return;
    setDownloadingHwpx(true);
    try {
      // 이 달의 모든 공휴일 (해당 월의 1일~말일 검사)
      const dimMonth = new Date(genY, genM, 0).getDate();
      const monthHolidays: { day: number; name: string }[] = [];
      for (let d = 1; d <= dimMonth; d++) {
        const hn = holiday(genY, genM, d);
        if (hn) monthHolidays.push({ day: d, name: hn });
      }

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
        holidays: monthHolidays,
      };
      const res = await fetch("/api/schedule/hwpx", {
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
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${name || "일정표"}_${genY}년${pad(genM)}월.hwpx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setDownloadingHwpx(false);
    }
  }

  return (
    <>
      <div className="section-head">
        <div>
          <h2>일정표 만들기</h2>
          <p>아동·치료사·반복 요일로 한 달치 회기를 자동 생성합니다.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/children/new" className="btn btn-ghost">
            <PlusIcon /> 아동 등록
          </Link>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="step">1</span>
          <h2>아동 정보 & 패턴 설정</h2>
          <span className="hint">아동을 미리 등록해두면 매월 한 번에 불러올 수 있어요</span>
        </div>
        <div className="card-body">
          {childrenOpts.length > 0 && (() => {
            const filtered = filterTherapist
              ? childrenOpts.filter((c) => c.therapistName === filterTherapist)
              : childrenOpts;
            return (
              <div style={{ marginBottom: 16, display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
                {therapists.length > 1 && (
                  <div className="field">
                    <label>치료사로 필터 <span className="sub-mute">(아동 목록만)</span></label>
                    <select
                      className="select"
                      value={filterTherapist}
                      onChange={(e) => setFilterTherapist(e.target.value)}
                    >
                      <option value="">— 전체 ({childrenOpts.length}명) —</option>
                      {therapists.map((t) => {
                        const cnt = childrenOpts.filter((c) => c.therapistName === t.name).length;
                        return (
                          <option key={t.id} value={t.name} disabled={cnt === 0}>
                            {t.name} ({cnt}명)
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}
                <div className="field" style={{ gridColumn: therapists.length > 1 ? undefined : "1 / -1" }}>
                  <label>
                    저장된 아동 불러오기
                    {filterTherapist && (
                      <span className="sub-mute" style={{ marginLeft: 6 }}>
                        ({filterTherapist} {filtered.length}명)
                      </span>
                    )}
                  </label>
                  <select
                    className="select"
                    value={selectedChildId === "" ? "" : String(selectedChildId)}
                    onChange={(e) => loadChild(e.target.value)}
                  >
                    <option value="">— 직접 입력 —</option>
                    {filtered.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.therapistName ? ` · ${c.therapistName}` : ""}
                        {c.defaultSlot ? ` · ${c.defaultSlot}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })()}
          {childrenOpts.length === 0 && (
            <div className="tip">
              💡 <Link href="/children/new"><b>아동을 미리 등록</b></Link>해두면 매월 정보 입력 없이 한 번에 불러올 수 있어요.
            </div>
          )}

          {typeof selectedChildId === "number" && savedList.length > 0 && (
            <div className="field" style={{ marginBottom: 16 }}>
              <label>이 아동의 저장된 일정표 ({savedList.length}개)</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select
                  className="select"
                  value={loadedScheduleId ?? ""}
                  onChange={(e) => loadSavedSchedule(e.target.value)}
                  style={{ flex: 1 }}
                >
                  <option value="">— 선택 —</option>
                  {savedList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.year}년 {s.month}월 · {s._count.sessions}회 · {new Date(s.updatedAt).toLocaleDateString("ko-KR")}
                    </option>
                  ))}
                </select>
                {loadedScheduleId !== null && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ color: "var(--danger)" }}
                    onClick={() => deleteSaved(loadedScheduleId)}
                  >삭제</button>
                )}
              </div>
            </div>
          )}
          {savedMsg && (
            <div className="flash ok" style={{ marginBottom: 14 }}>{savedMsg}</div>
          )}

          <div className="form-grid">
            <div className="field">
              <label>대상자 성명<span className="req">*</span></label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label>치료사(제공자)<span className="req">*</span></label>
              {therapists.length > 0 ? (
                <select className="select" value={therapist} onChange={(e) => setTherapist(e.target.value)}>
                  {therapists.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                  {!therapists.some((t) => t.name === therapist) && therapist && (
                    <option value={therapist}>{therapist}</option>
                  )}
                </select>
              ) : (
                <input className="input" value={therapist} onChange={(e) => setTherapist(e.target.value)} />
              )}
            </div>
            <div className="field">
              <label>서비스 종류</label>
              <select className="select" value={serviceType} onChange={(e) => setServiceType(e.target.value)}>
                {SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="field">
              <label>대상 월</label>
              <select className="select" value={ym} onChange={(e) => setYm(e.target.value)}>
                {monthOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>목표 회기 수</label>
              <select className="select" value={target} onChange={(e) => setTarget(Number(e.target.value))}>
                {[4, 5, 6, 7, 8].map((i) => <option key={i} value={i}>{i}회</option>)}
              </select>
            </div>
          </div>

          <div className="divider" />

          <div className="field-row cols-3" style={{ alignItems: "end" }}>
            <div className="field">
              <label>치료 시간대<span className="req">*</span></label>
              <select className="select" value={defaultSlot} onChange={(e) => setDefaultSlot(e.target.value)}>
                <option value="">(선택)</option>
                {SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="field" style={{ gridColumn: "span 2" }}>
              <label>반복 요일<span className="req">*</span> <span className="sub-mute">(탭하여 선택)</span></label>
              <div className="day-row">
                {WEEK.map((w, i) => {
                  const on = pattern.includes(i);
                  return (
                    <button
                      key={w} type="button"
                      className={"day-btn" + (on ? " on" : "")}
                      onClick={() => togglePattern(i)}
                    >{w}</button>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 20, display: "flex", gap: 10, alignItems: "center" }}>
            <button
              className="btn btn-primary"
              onClick={generate}
              disabled={!name.trim() || !defaultSlot || pattern.length === 0}
            >
              <ArrowRight /> 일정표 생성
            </button>
            {(!defaultSlot || pattern.length === 0 || !name.trim()) && (
              <span className="sub-mute">
                {!name.trim() ? "대상자 성명 · " : ""}
                {!defaultSlot ? "치료 시간대 · " : ""}
                {pattern.length === 0 ? "반복 요일을 " : ""}
                선택해주세요.
              </span>
            )}
          </div>
        </div>
      </div>

      {sessions && (
        <div className="card" id="schedCard">
          <div className="card-header">
            <span className="step">2</span>
            <h2>일정표 미리보기 — {genY}년 {genM}월</h2>
            <span className={"badge " + (totalCount === target ? "badge-success" : "badge-warn")} style={{ marginLeft: "auto" }}>
              {totalCount === target
                ? `목표 ${target}회 · ${totalCount}회 ✓`
                : `목표 ${target}회 · ${totalCount}회 (${totalCount < target ? "부족" : "초과"} ${Math.abs(target - totalCount)})`}
            </span>
          </div>
          <div className="card-body">

            <table className="meta-tbl">
              <tbody>
                <tr>
                  <td className="lbl">관리번호</td>
                  <td><input className="input" value={mgmt} onChange={(e) => setMgmt(e.target.value)} /></td>
                  <td className="lbl">성 명</td><td>{name}</td>
                </tr>
                <tr>
                  <td className="lbl">제공자</td><td>{therapist}</td>
                  <td className="lbl">작성일자</td>
                  <td>
                    <input className="input" value={writeDate} onChange={(e) => setWriteDate(e.target.value)} />
                  </td>
                </tr>
              </tbody>
            </table>

            <CalendarTable y={genY} m={genM} sessions={sessions} onCellClick={openEditor} />

            <div className="tip" style={{ marginTop: 14 }}>
              <span><b>초록</b>=정규 · <b style={{ color: "#8A6422" }}>주황</b>=보강 · <b style={{ color: "var(--danger)" }}>빨강</b>=공휴일.</span>
              <span style={{ marginLeft: 12 }}>날짜를 탭하면 회기 추가·시간 변경·제거 가능</span>
            </div>

            <div className="label-block" style={{ marginTop: 22 }}>서비스 제공현황</div>
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

            <div className="label-block" style={{ marginTop: 20 }}>서비스 비용</div>
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

            <div className="divider" />

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {typeof selectedChildId === "number" ? (
                <button className="btn" onClick={saveSchedule} disabled={saving}>
                  {saving ? "저장 중..." : (loadedScheduleId ? "이 일정표 덮어쓰기 저장" : "이 일정표 저장")}
                </button>
              ) : (
                <span className="sub-mute">💾 저장하려면 위에서 "저장된 아동 불러오기"로 선택해주세요.</span>
              )}
              <span style={{ flex: 1 }} />
              <button className="btn btn-primary" onClick={downloadHwpx} disabled={downloadingHwpx}>
                {downloadingHwpx ? "생성 중..." : "한글파일(.hwpx) 다운로드"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editDay !== null && sessions !== null && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) closeEditor(); }}>
          <div className="modal">
            <div className="modal-title">
              {genM}월 {editDay}일 ({WEEK[new Date(genY, genM - 1, editDay).getDay()]})
            </div>
            <div className="field" style={{ marginBottom: 14 }}>
              <label>치료 시간대</label>
              <select className="select" value={editTime} onChange={(e) => setEditTime(e.target.value)}>
                {SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <label className="modal-check">
              <input type="checkbox" checked={editMakeup} onChange={(e) => setEditMakeup(e.target.checked)} />
              보강 회기로 표시
            </label>
            <div className="modal-actions">
              <button className="btn btn-primary btn-sm" onClick={saveEditor}>
                {editExists ? "시간 변경" : "회기 추가"}
              </button>
              {editExists && (
                <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={removeEditor}>
                  회기 제거
                </button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={closeEditor}>취소</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PlusIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 5v14 M5 12h14" />
    </svg>
  );
}
function ArrowRight() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M5 12h14 M12 5l7 7-7 7" />
    </svg>
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
