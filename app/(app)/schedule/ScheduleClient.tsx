"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  WEEK, holiday, pad, parseDaySlots,
} from "@/lib/constants";
import { useBetaUx } from "../BetaUxContext";

type Session = { time: string; makeup: boolean };
type SessionMap = Record<number, Session>; // day-of-month -> Session

// 한 행 = 하나의 ChildService (한 아동이 받는 한 서비스).
// 같은 아동이 여러 서비스를 받으면 옵션이 여러 줄로 나옴.
type ChildOption = {
  id: number;                   // ChildService.id
  childId: number;              // 사람 id (동명이인 구분용)
  name: string;                 // 아동 이름
  birthDate: string | null;
  serviceType: string;
  mgmtNumber: string | null;
  defaultSlot: string | null;
  defaultDays: string | null;
  daySlots: string | null;       // 요일별 시간대 오버라이드 ("1=09:00~09:50,...")
  org: string | null;            // 서비스 제공자명(제공기관명) — 아동별 저장값
  defaultUnit: number;
  defaultTarget: number;
  monthlyCopay: number | null;
  therapistName: string | null;
  hasMultipleServices: boolean; // 같은 아동에 서비스가 둘 이상이면 라벨에 종류 표시
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
  children: initialChildrenOpts,
  therapists,
  serviceTypes,
  slots,
  defaultFilterTherapist = null,
  defaultOrg = "",
  centerDefaultUnit = 60000,
}: {
  children: ChildOption[];
  therapists: TherapistOption[];
  serviceTypes: string[];
  slots: string[];
  defaultFilterTherapist?: string | null;
  defaultOrg?: string;
  centerDefaultUnit?: number;
}) {
  const betaUx = useBetaUx();
  // 일정표에서 새 아동을 등록하면 여기에 추가 → 드롭다운 즉시 갱신
  const [childrenOpts, setChildrenOpts] = useState<ChildOption[]>(initialChildrenOpts);
  // 오늘 기준 월 옵션 (매 렌더 한 번 계산)
  const monthOptions = useMemo(() => buildMonthOptions(), []);
  const defaultYm = monthOptions.find((o) => o.current)?.value ?? monthOptions[0].value;

  // 일정표·기록지 사이 이동 시 선택 상태 유지용 localStorage 키
  const LS_CSID = "baroilji_last_childServiceId";
  const LS_YM = "baroilji_last_ym";
  // 미리보기(생성된 sessions + 메타) 통째 저장 — 탭 이동해도 그대로
  const LS_DRAFT = "baroilji_schedule_draft";
  const LS_SCROLL = "baroilji_schedule_scroll";

  // form
  const [selectedChildId, setSelectedChildId] = useState<number | "">("");
  const [name, setName] = useState("");
  const [therapist, setTherapist] = useState(defaultFilterTherapist || therapists[0]?.name || "");
  // 아동 드롭다운 필터용 (양식엔 안 들어가는 UI-only 값).
  // 로그인 사용자 이름이 치료사 명단에 있으면 자동으로 그 치료사로 필터.
  const [filterTherapist, setFilterTherapist] = useState<string>(defaultFilterTherapist ?? "");
  const [serviceType, setServiceType] = useState<string>(serviceTypes[0] ?? "언어재활");
  const [ym, setYm] = useState(defaultYm);
  const [target, setTarget] = useState(5);
  const [defaultSlot, setDefaultSlot] = useState(""); // 미선택 — 요일별 기본 시간대
  const [pattern, setPattern] = useState<number[]>([]); // 미선택 — 반복 요일
  const [slotByDow, setSlotByDow] = useState<Record<number, string>>({}); // 요일별 시간대 오버라이드 (없으면 defaultSlot)
  const [childBirth, setChildBirth] = useState<string>("");

  // generated
  const [sessions, setSessions] = useState<SessionMap | null>(null);
  const [genY, setGenY] = useState(0);
  const [genM, setGenM] = useState(0);
  const [mgmt, setMgmt] = useState("");
  const [pvOrg, setPvOrg] = useState(defaultOrg);
  const [pvTel, setPvTel] = useState("775-0047");
  const [pvCharge, setPvCharge] = useState(defaultFilterTherapist || therapists[0]?.name || "");
  const [pvType, setPvType] = useState(serviceTypes[0] ?? "");
  const [costUnit, setCostUnit] = useState(centerDefaultUnit.toLocaleString("ko-KR"));
  const [costSelf, setCostSelf] = useState("0");
  const [writeDate, setWriteDate] = useState("");
  const [downloadingHwpx, setDownloadingHwpx] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [autoStatus, setAutoStatus] = useState<"" | "saving" | "saved">("");
  const schedTouched = useRef(false); // 사용자가 실제 편집했을 때만 자동저장(로컬 임시본이 서버 최신본 덮어쓰기 방지)
  // 저장한 우리 센터 일정표 양식 — 있으면 출력 양식 선택
  const [savedForms, setSavedForms] = useState<Array<{ id: number; name: string }>>([]);
  const [outFormId, setOutFormId] = useState<number | "">("");
  useEffect(() => {
    fetch("/api/forms/saved")
      .then((r) => (r.ok ? r.json() : { forms: [] }))
      .then((d) => setSavedForms((d.forms ?? []).filter((f: { kind: string }) => f.kind === "schedule")))
      .catch(() => {});
  }, []);

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

  // 새 아동 등록 모달
  const [showNewChild, setShowNewChild] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBirth, setNewBirth] = useState("");
  const [newCopay, setNewCopay] = useState("");
  const [creatingChild, setCreatingChild] = useState(false);

  async function createNewChild() {
    if (!newName.trim()) { alert("이름을 입력해주세요."); return; }
    setCreatingChild(true);
    try {
      const res = await fetch("/api/children/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          birthDate: newBirth.trim() || undefined,
          serviceType: serviceTypes[0] ?? "언어재활",
          defaultUnit: centerDefaultUnit,
          monthlyCopay: newCopay.trim() ? Number(newCopay.replace(/[^\d]/g, "")) : null,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        alert("아동 등록 실패: " + (e.error ?? res.status));
        return;
      }
      const created = (await res.json()) as ChildOption;
      setChildrenOpts((arr) => [...arr, created]);
      setShowNewChild(false);
      setNewName(""); setNewBirth(""); setNewCopay("");
      loadChild(String(created.id));
    } finally {
      setCreatingChild(false);
    }
  }

  // 페이지 진입 시 localStorage 에서 마지막 작업 상태 복원
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_DRAFT);
      if (raw) {
        const d = JSON.parse(raw);
        if (typeof d.csId === "number" && childrenOpts.some((c) => c.id === d.csId)) {
          setSelectedChildId(d.csId);
        }
        if (typeof d.ym === "string" && monthOptions.some((o) => o.value === d.ym)) {
          setYm(d.ym);
        }
        if (typeof d.name === "string") setName(d.name);
        // 치료사명·서비스 종류·제공기관명 은 모두 내 설정에서 옴.
        // draft 값이 옛 설정일 수 있으니 복원하지 않고 props 의 최신값(defaultFilterTherapist,
        // serviceTypes[0], defaultOrg) 을 그대로 사용.
        if (typeof d.target === "number") setTarget(d.target);
        if (typeof d.defaultSlot === "string") setDefaultSlot(d.defaultSlot);
        if (Array.isArray(d.pattern)) setPattern(d.pattern.filter((n: unknown) => typeof n === "number"));
        if (d.slotByDow && typeof d.slotByDow === "object") {
          const clean: Record<number, string> = {};
          for (const [k, v] of Object.entries(d.slotByDow as Record<string, unknown>)) {
            if (typeof v === "string" && v) clean[Number(k)] = v;
          }
          setSlotByDow(clean);
        }
        if (typeof d.childBirth === "string") setChildBirth(d.childBirth);
        if (typeof d.mgmt === "string") setMgmt(d.mgmt);
        // pvOrg(제공기관명), pvCharge(담당), pvType(서비스 종류) 도 설정에서 옴 — 복원 안 함.
        if (typeof d.pvTel === "string") setPvTel(d.pvTel);
        if (typeof d.costUnit === "string") setCostUnit(d.costUnit);
        if (typeof d.costSelf === "string") setCostSelf(d.costSelf);
        if (typeof d.writeDate === "string") setWriteDate(d.writeDate);
        if (d.sessions && typeof d.sessions === "object" && typeof d.genY === "number" && typeof d.genM === "number") {
          setSessions(d.sessions as SessionMap);
          setGenY(d.genY);
          setGenM(d.genM);
        }
        if (typeof d.loadedScheduleId === "number") setLoadedScheduleId(d.loadedScheduleId);
      } else {
        // 구버전 호환 — 분리된 키도 한 번 확인
        const savedYm = localStorage.getItem(LS_YM);
        if (savedYm && monthOptions.some((o) => o.value === savedYm)) setYm(savedYm);
        const savedCsId = localStorage.getItem(LS_CSID);
        if (savedCsId) {
          const id = Number(savedCsId);
          if (childrenOpts.some((c) => c.id === id)) loadChild(String(id));
        }
      }
    } catch {}
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 모든 편집 가능한 상태를 localStorage 에 저장 (탭 이동 후 돌아와도 그대로)
  useEffect(() => {
    if (!hydrated) return;
    try {
      const draft = {
        csId: typeof selectedChildId === "number" ? selectedChildId : null,
        ym,
        name, therapist, serviceType, target, defaultSlot, pattern, slotByDow, childBirth,
        mgmt, pvOrg, pvTel, pvCharge, pvType, costUnit, costSelf, writeDate,
        sessions, genY, genM,
        loadedScheduleId,
      };
      localStorage.setItem(LS_DRAFT, JSON.stringify(draft));
      if (typeof selectedChildId === "number") {
        localStorage.setItem(LS_CSID, String(selectedChildId));
      }
      localStorage.setItem(LS_YM, ym);
    } catch {}
  }, [
    hydrated, selectedChildId, ym,
    name, therapist, serviceType, target, defaultSlot, pattern, slotByDow, childBirth,
    mgmt, pvOrg, pvTel, pvCharge, pvType, costUnit, costSelf, writeDate,
    sessions, genY, genM, loadedScheduleId,
  ]);

  // 스크롤 위치 복원 (hydration 후 layout 안정될 시간을 주기 위해 약간 지연)
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

  // 스크롤할 때마다 위치를 저장 (debounce)
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

  // '이번 달'·대시보드에서 ?cs=&ym= 로 넘어오면 해당 아동·월을 자동 선택.
  const searchParams = useSearchParams();
  const [autoSelected, setAutoSelected] = useState(false);
  useEffect(() => {
    if (!hydrated || autoSelected) return;
    const cs = searchParams.get("cs");
    if (!cs) return;
    const id = Number(cs);
    if (childrenOpts.some((x) => x.id === id)) {
      loadChild(String(id));
      const ymP = searchParams.get("ym");
      if (ymP && monthOptions.some((o) => o.value === ymP)) setYm(ymP);
      setAutoSelected(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  function togglePattern(i: number) {
    setPattern((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].sort()));
  }

  function loadChild(idStr: string) {
    const id = idStr === "" ? "" : Number(idStr);
    setSelectedChildId(id);
    setLoadedScheduleId(null);
    setSessions(null);   // 아동 바꾸면 캘린더 비움(이전 아동 세션 자동저장 오염 방지)
    schedTouched.current = false;
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
    // 서비스 제공자명(제공기관명): 아동별 저장값이 있으면 그걸로(없으면 내 설정 기본값 유지)
    if (c.org) setPvOrg(c.org);
    if (c.defaultSlot) setDefaultSlot(c.defaultSlot);
    // 아동에 저장된 요일별 시간대 오버라이드를 그대로 불러옴 (없으면 기본 시간대)
    setSlotByDow(parseDaySlots(c.daySlots));
    if (c.defaultDays) {
      const ds = c.defaultDays.split(",").filter(Boolean).map(Number);
      if (ds.length) setPattern(ds);
    }
    if (c.defaultUnit) setCostUnit(c.defaultUnit.toLocaleString("ko-KR"));
    if (c.defaultTarget) setTarget(c.defaultTarget);
    if (c.monthlyCopay != null) setCostSelf(c.monthlyCopay.toLocaleString("ko-KR"));
  }

  // 아동 서비스 변경 시 저장된 일정표 목록 fetch
  const refreshSavedList = useCallback(async (childServiceId: number) => {
    const res = await fetch(`/api/schedule/list?childServiceId=${childServiceId}`);
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

  // 가장 최근 저장된 일정을 가져와 현재 선택된 (year, month) 로 변환해서 채우기.
  // 요일 + 시간 패턴을 새 월의 같은 요일에 매핑. 사용자가 수정 후 저장 가능.
  async function copyPrevMonth() {
    if (typeof selectedChildId !== "number" || savedList.length === 0) {
      alert("저장된 일정이 없어요. 아동을 먼저 선택하세요.");
      return;
    }
    const latest = savedList[0]; // savedList 는 year/month DESC 정렬
    const res = await fetch(`/api/schedule/load?id=${latest.id}`);
    if (!res.ok) { alert("불러오기 실패"); return; }
    const s = await res.json();
    // 메타 정보 복사 (월/년은 현재 선택된 ym 유지)
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
    // 회기 패턴 (요일+시간 단위) 추출
    type Pattern = { dow: number; time: string; makeup: boolean };
    const patterns: Pattern[] = [];
    const seen = new Set<string>();
    for (const sess of s.sessions) {
      const dow = new Date(s.year, s.month - 1, sess.day).getDay();
      const key = `${dow}|${sess.time}`;
      if (!seen.has(key)) {
        patterns.push({ dow, time: sess.time, makeup: sess.makeup });
        seen.add(key);
      }
    }
    // 새 월(ym)에 패턴 적용
    const [y, m] = ym.split("-").map(Number);
    const dim = new Date(y, m, 0).getDate();
    const next: SessionMap = {};
    for (let d = 1; d <= dim; d++) {
      const dow = new Date(y, m - 1, d).getDay();
      if (holiday(y, m, d)) continue;
      for (const p of patterns) {
        if (p.dow === dow) {
          next[d] = { time: p.time, makeup: false };
          break;
        }
      }
    }
    schedTouched.current = true; // 전월 복사 = 사용자 동작
    setSessions(next);
    setGenY(y);
    setGenM(m);
    setWriteDate(defaultWriteDate(y, m));
    setLoadedScheduleId(null);
    setSavedMsg(`✓ ${s.year}년 ${s.month}월 일정을 패턴으로 가져와 ${y}년 ${m}월에 적용했어요. 저장하면 새 일정표가 됩니다.`);
    requestAnimationFrame(() => {
      document.getElementById("schedCard")?.scrollIntoView({ behavior: "smooth" });
    });
  }

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
    schedTouched.current = false; // 서버에서 불러옴 — 편집 전까지 자동저장 안 함(되쓰기 방지)
    setSessions(sessMap);
    setGenY(s.year);
    setGenM(s.month);
    setWriteDate(s.writeDate ?? defaultWriteDate(s.year, s.month));
    if (s.formId) setOutFormId(s.formId); // 저장 시 기억한 출력 양식 복원
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
        childServiceId: selectedChildId,
        year: genY,
        month: genM,
        therapist,
        serviceType,
        target,
        mgmtNumber: mgmt,
        pvOrg, pvTel, pvCharge, pvType,
        costUnit, costSelf,
        writeDate,
        formId: outFormId || undefined, // 출력 양식 기억(일괄 출력에 사용)
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

  // 반복 요일에 해당하는 이 달의 회기 후보일(공휴일 제외), 날짜순.
  // 생성·목표수 조정 양쪽에서 재사용.
  function monthPatternDays(y: number, m: number): number[] {
    const dim = new Date(y, m, 0).getDate();
    const out: number[] = [];
    for (let d = 1; d <= dim; d++) {
      const wd = new Date(y, m - 1, d).getDay();
      if (pattern.includes(wd) && !holiday(y, m, d)) out.push(d);
    }
    return out;
  }

  function generate() {
    const [y, m] = ym.split("-").map(Number);
    const next: SessionMap = {};
    // 목표 회기 수만큼만 앞에서부터 채움 (후보일이 모자라면 있는 만큼).
    const cand = target > 0 ? monthPatternDays(y, m).slice(0, target) : monthPatternDays(y, m);
    for (const d of cand) {
      const wd = new Date(y, m - 1, d).getDay();
      next[d] = { time: slotByDow[wd] || defaultSlot, makeup: false };
    }
    schedTouched.current = true; // 일정표 생성 = 사용자 동작
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

  // 목표 회기 수를 바꾸면 미리보기 칸을 자동으로 지우거나 채움.
  // 줄이면 뒤(늦은 날짜) 칸부터 제거, 늘리면 남은 후보일을 뒤에 추가(목표 수까지).
  // 이미 수정한 칸(시간·보강)은 그대로 보존. 생성 전(sessions 없음)이면 조정 안 함.
  function changeTarget(newTarget: number) {
    setTarget(newTarget);
    if (!sessions) return; // 아직 생성 전이면 칸 조정 없음
    const cur = Object.keys(sessions).map(Number).sort((a, b) => a - b);
    if (cur.length === newTarget) return;
    schedTouched.current = true; // 목표수 조정 = 사용자 동작
    if (cur.length > newTarget) {
      // 줄이기: 뒤(늦은 날짜) 칸부터 제거
      const next: SessionMap = {};
      for (const d of cur.slice(0, newTarget)) next[d] = sessions[d];
      setSessions(next);
    } else {
      // 늘리기: 그 달의 남은 후보일을 뒤에 추가
      const next: SessionMap = { ...sessions };
      let count = cur.length;
      for (const d of monthPatternDays(genY, genM)) {
        if (count >= newTarget) break;
        if (!next[d]) {
          const wd = new Date(genY, genM - 1, d).getDay();
          next[d] = { time: slotByDow[wd] || defaultSlot, makeup: false };
          count++;
        }
      }
      setSessions(next);
    }
  }

  function resetAll() {
    if (!window.confirm("정말 초기화할까요? 입력한 내용이 사라져요.")) return;
    try {
      localStorage.removeItem(LS_DRAFT);
      localStorage.removeItem(LS_SCROLL);
    } catch {}
    schedTouched.current = false;
    setSessions(null);
    setSelectedChildId("");
    setName("");
    setServiceType(serviceTypes[0] ?? "언어재활");
    setYm(defaultYm);
    setTarget(5);
    setDefaultSlot("");
    setPattern([]);
    setSlotByDow({});
    setChildBirth("");
    setGenY(0);
    setGenM(0);
    setMgmt("");
    setCostUnit(centerDefaultUnit.toLocaleString("ko-KR"));
    setCostSelf("0");
    setWriteDate("");
    setSavedMsg("");
    setLoadedScheduleId(null);
    window.scrollTo(0, 0);
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
    schedTouched.current = true; // 회기 시간 수정 = 사용자 동작
    setSessions({ ...sessions, [editDay]: { time: editTime, makeup: editMakeup } });
    closeEditor();
  }

  function removeEditor() {
    if (editDay === null || sessions === null) return;
    schedTouched.current = true; // 회기 삭제 = 사용자 동작
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

  // 작업 중 자동 저장 — 회기가 있고 아동이 선택돼 있으면 편집이 멈춘 뒤 서버에 저장.
  // (다른 컴퓨터에서도 같은 아동·월을 고르면 이어서 작성 가능)
  const autoSave = useCallback(async () => {
    if (!sessions || typeof selectedChildId !== "number" || days.length === 0 || !schedTouched.current) return;
    setAutoStatus("saving");
    try {
      const payload = {
        childServiceId: selectedChildId, year: genY, month: genM,
        therapist, serviceType, target, mgmtNumber: mgmt,
        pvOrg, pvTel, pvCharge, pvType, costUnit, costSelf, writeDate,
        formId: outFormId || undefined,
        sessions: days.map((d) => ({ day: d, time: sessions[d].time, makeup: sessions[d].makeup })),
      };
      const res = await fetch("/api/schedule/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) { const j = await res.json(); setLoadedScheduleId(j.scheduleId); setAutoStatus("saved"); }
      else setAutoStatus("");
    } catch { setAutoStatus(""); }
  }, [sessions, selectedChildId, genY, genM, therapist, serviceType, target, mgmt, pvOrg, pvTel, pvCharge, pvType, costUnit, costSelf, writeDate, outFormId, days]);

  useEffect(() => {
    if (!hydrated || !sessions || typeof selectedChildId !== "number" || days.length === 0 || !schedTouched.current) return;
    const t = window.setTimeout(() => { void autoSave(); }, 1800);
    return () => window.clearTimeout(t);
  }, [hydrated, autoSave, sessions, selectedChildId, days.length]);

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
        formId: outFormId || undefined,
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
          <button type="button" className="btn btn-sm" onClick={resetAll} style={{ marginLeft: "auto", border: "1px solid var(--border)", background: "#fff", fontWeight: 600 }}>
            초기화
          </button>
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
                  <div style={{ display: "flex", gap: 8 }}>
                    <select
                      className="select"
                      value={selectedChildId === "" ? "" : String(selectedChildId)}
                      onChange={(e) => loadChild(e.target.value)}
                      style={{ flex: 1 }}
                    >
                      <option value="">— 직접 입력 —</option>
                      {filtered.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.hasMultipleServices ? ` · ${c.serviceType}` : ""}
                          {c.therapistName ? ` · ${c.therapistName}` : ""}
                          {c.defaultSlot ? ` · ${c.defaultSlot}` : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ whiteSpace: "nowrap" }}
                      onClick={() => setShowNewChild(true)}
                      title="새 아동을 바로 등록 (내 아동에 자동 동기화)"
                    >+ 새 아동</button>
                  </div>
                </div>
              </div>
            );
          })()}
          {childrenOpts.length === 0 && (
            <div className="tip" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <span>아직 등록된 아동이 없어요. 여기서 바로 등록할 수 있어요.</span>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowNewChild(true)}
              >+ 새 아동 등록</button>
            </div>
          )}

          {betaUx && typeof selectedChildId === "number" && savedList.length === 0 && (
            <p className="sub-mute" style={{ marginBottom: 12, fontSize: 12 }}>
              💡 이 아동의 지난 달 일정표를 저장해두면, 다음 달에 <b>요일·시간 패턴을 그대로 복사</b>할 수 있어요.
            </p>
          )}

          {typeof selectedChildId === "number" && savedList.length > 0 && (
            <div className="field" style={{ marginBottom: 16 }}>
              <label>이 아동의 저장된 일정표 ({savedList.length}개)</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <select
                  className="select"
                  value={loadedScheduleId ?? ""}
                  onChange={(e) => loadSavedSchedule(e.target.value)}
                  style={{ flex: 1, minWidth: 200 }}
                >
                  <option value="">— 선택 —</option>
                  {savedList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.year}년 {s.month}월 · {s._count.sessions}회 · {new Date(s.updatedAt).toLocaleDateString("ko-KR")}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={copyPrevMonth}
                  title="가장 최근 일정의 요일·시간 패턴을 새 월에 자동 적용"
                >
                  전월 일정 복사
                </button>
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
              <input
                className="input"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  // 불러온 아동 이름을 직접 고치면 '직접 입력' 으로 전환
                  if (selectedChildId !== "") {
                    setSelectedChildId("");
                    setLoadedScheduleId(null);
                    setSavedList([]);
                  }
                }}
              />
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
              <label>서비스 종류 <span className="sub-mute">(가입 시 선택한 종류로 자동)</span></label>
              <input
                className="input"
                value={serviceType}
                readOnly
                style={{ background: "var(--surface-2)", cursor: "not-allowed" }}
              />
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
              <select className="select" value={target} onChange={(e) => changeTarget(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => <option key={i} value={i}>{i}회</option>)}
              </select>
            </div>
          </div>

          <div className="divider" />

          <div className="field-row cols-3" style={{ alignItems: "end" }}>
            <div className="field">
              <label>기본 시간대<span className="req">*</span></label>
              <select className="select" value={defaultSlot} onChange={(e) => setDefaultSlot(e.target.value)}>
                <option value="">(선택)</option>
                {slots.map((s) => <option key={s} value={s}>{s}</option>)}
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

          {betaUx && !(pattern.length > 0 && defaultSlot) && (
            <p className="sub-mute" style={{ marginTop: 8, fontSize: 12 }}>
              💡 반복 요일과 기본 시간대를 정하면, 그 아래에서 <b>요일마다 다른 시간</b>도 설정할 수 있어요.
            </p>
          )}

          {pattern.length > 0 && defaultSlot && (
            <div className="field" style={{ marginTop: 14 }}>
              <label>
                요일별 시간 <span className="sub-mute">(요일마다 다르면 변경 — 비워두면 기본 시간대 적용)</span>
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {[...pattern].sort().map((dow) => (
                  <div key={dow} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 700, minWidth: 24, textAlign: "center" }}>{WEEK[dow]}</span>
                    <select
                      className="select"
                      style={{ width: "auto", minWidth: 130 }}
                      value={slotByDow[dow] || defaultSlot}
                      onChange={(e) =>
                        setSlotByDow((prev) => ({ ...prev, [dow]: e.target.value }))
                      }
                    >
                      {slots.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

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
        <div className="card" id="schedCard" onChangeCapture={() => { schedTouched.current = true; }}>
          <div className="card-header">
            <span className="step">2</span>
            <h2>일정표 미리보기 — {genY}년 {genM}월</h2>
            <span className={"badge " + (totalCount === target ? "badge-success" : "badge-warn")} style={{ marginLeft: "auto" }}>
              {totalCount === target
                ? `목표 ${target}회 · ${totalCount}회 ✓`
                : `목표 ${target}회 · ${totalCount}회 (${totalCount < target ? "부족" : "초과"} ${Math.abs(target - totalCount)})`}
            </span>
            {typeof selectedChildId === "number" && (
              <Link
                href={`/record?cs=${selectedChildId}&ym=${genY}-${genM}`}
                className="btn btn-ghost btn-sm"
                style={{ marginLeft: 8 }}
              >
                이 회기로 기록지 작성 →
              </Link>
            )}
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
                <span className="sub-mute">저장하려면 위에서 "저장된 아동 불러오기"로 선택해주세요.</span>
              )}
              <span style={{ flex: 1 }} />
              {savedForms.length > 0 ? (
                <select
                  value={outFormId}
                  onChange={(e) => setOutFormId(e.target.value ? Number(e.target.value) : "")}
                  title="출력에 사용할 일정표 양식"
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
              <button className="btn btn-primary" onClick={downloadHwpx} disabled={downloadingHwpx}>
                {downloadingHwpx ? "생성 중..." : "한글파일(.hwpx) 다운로드"}
              </button>
            </div>
            <div className="sub-mute" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.6 }}>
              💾 작업 중 <b>자동으로 저장</b>돼요{autoStatus === "saving" ? " (저장 중…)" : autoStatus === "saved" ? " ✓ 저장됨" : ""}.
              다른 컴퓨터(집·센터 등)에서도 위에서 <b>같은 아동·월</b>을 고르면 이어서 작성할 수 있어요.
            </div>
          </div>
        </div>
      )}

      {showNewChild && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setShowNewChild(false); }}>
          <div className="modal" style={{ minWidth: 340 }}>
            <div className="modal-title">새 아동 등록</div>
            <div className="sub-mute" style={{ fontSize: 12, marginBottom: 12 }}>
              여기서 저장하면 "내 아동" 목록에도 즉시 추가됩니다. 서비스 종류는 {serviceTypes[0]} (가입 시 선택한 종류).
            </div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>이름<span className="req">*</span></label>
              <input
                className="input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>생년월일 <span className="sub-mute">(선택)</span></label>
              <input className="input" value={newBirth} onChange={(e) => setNewBirth(e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>월 본인부담금 (원) <span className="sub-mute">(선택)</span></label>
              <input
                className="input"
                type="number"
                min={0}
                step={1000}
                value={newCopay}
                onChange={(e) => setNewCopay(e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary btn-sm" onClick={createNewChild} disabled={creatingChild || !newName.trim()}>
                {creatingChild ? "저장 중..." : "등록"}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowNewChild(false)}>취소</button>
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
                {slots.map((s) => <option key={s} value={s}>{s}</option>)}
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
