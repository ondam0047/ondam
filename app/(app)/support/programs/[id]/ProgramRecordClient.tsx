"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { SCALAR_ROLES, ROW_ROLES } from "@/lib/record-roles";

// ── 매핑 관련 타입 ──────────────────────────────────────────────
type Cell     = { r: number; c: number; cs: number; rs: number; text: string; role: string | null; p?: number; paras?: string[] };
type MapResult = { coverage: Record<string, boolean>; grid: Cell[][] };
type Picker   = { t: number; r: number; c: number; p: number; text: string; x: number; y: number };

const FIELD_LABEL: Record<string, string> = {
  org: "기관명", name: "이름", therapist: "치료사",
  date: "날짜", start: "시작시간", end: "종료시간", result: "결과표",
};

// 매핑 화면 인라인 미리보기용 — 역할별 예시 값(ROW 역할은 순서대로 채움)
const ROLE_EX: Record<string, string | string[]> = {
  기관명: "OO언어발달센터", 대상자이름: "홍길동", 치료사이름: "김치료", 생년월일: "2018-03-15",
  연도: "2026", 월: "6",
  학교: "OO초등학교", 학년: "3학년", 요일: "화·목", 정기시간: "10:00~10:50",
  치료목표: "2어절 문장 산출 향상", 현행수준: "1~2어절 수준 발화",
  종합의견: "목표 행동에 꾸준한 향상을 보이며 참여 태도 적극적. 가정 연계 권장.",
  회차: ["1", "2", "3", "4", "5"],
  날짜: ["3/5", "3/12", "3/19", "3/26", "4/2"],
  시작: ["10:00", "10:00", "10:00", "10:00", "10:00"],
  종료: ["10:50", "10:50", "10:50", "10:50", "10:50"],
  결과: ["2어절 모방 산출 80%", "목표어 산출 증가", "다시말하기 연습", "받침 발음 연습", "대화 차례 지키기"],
  비고: ["적극 참여", "컨디션 양호", "피로감 호소", "특이사항 없음", "보호자 상담"],
};

// ── 기록지 타입 ─────────────────────────────────────────────────
type Session = { date: string; startTime: string; endTime: string; content: string; notes: string };
type Saved   = { id: number; student: string; updatedAt: string; payload: string; toolChildId?: number | null };
type ToolChild = { id: number; name: string; memo: string | null };

const empty = (): Session => ({ date: "", startTime: "", endTime: "", content: "", notes: "" });

// 미리보기에서 비어 있는 칸을 채울 예시 값
const EX = {
  studentName:   "홍길동",
  therapistName: "김치료",
  org:           "OO언어발달센터",
  birth:         "2018-03-15",
  school:        "OO초등학교",
  grade:         "3학년",
  dayOfWeek:     "화·목",
  sessionTime:   "10:00~10:50",
  goal:          "2어절 문장 산출 향상",
  currentLevel:  "1~2어절 수준 발화 가능",
  summary:       "목표 행동에 꾸준한 향상을 보이며 회기 참여 태도가 적극적임. 가정 연계 지도 권장.",
};
const EX_SESSIONS: Session[] = [
  { date: "3/5",  startTime: "10:00", endTime: "10:50", content: "2어절 모방 산출 80% 달성", notes: "적극 참여" },
  { date: "3/12", startTime: "10:00", endTime: "10:50", content: "자발화 내 목표어 산출 증가", notes: "" },
  { date: "3/19", startTime: "10:00", endTime: "10:50", content: "이야기 다시말하기 연습",     notes: "피로감 호소" },
];

type Props = {
  programId: number;
  programName: string;
  hasForm: boolean;
  therapist: string;
  org: string;
  saved: Saved[];
  betaUx?: boolean; // 새 AI 매핑 UX(베타 계정 한정)
};

export default function ProgramRecordClient({ programId, programName, hasForm, therapist, org, saved, betaUx = false }: Props) {
  const router  = useRouter();
  const searchParams = useSearchParams();
  const fileRef = useRef<HTMLInputElement>(null);

  // ── 기본 정보 ───────────────────────────────────────────────
  const [studentName,   setStudentName]   = useState("");
  const [birth,         setBirth]         = useState("");
  const [therapistName, setTherapistName] = useState(therapist);
  const [orgName,       setOrgName]       = useState(org);
  const [year,  setYear]  = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));

  // 추가 정보 — 베타 UX에선 기본 펼침(숨겨져 그냥 넘어가는 문제 해결)
  const [showExtra, setShowExtra] = useState(betaUx);
  const [school,       setSchool]       = useState("");
  const [grade,        setGrade]        = useState("");
  const [dayOfWeek,    setDayOfWeek]    = useState("");
  const [sessionTime,  setSessionTime]  = useState("");
  const [goal,         setGoal]         = useState("");
  const [currentLevel, setCurrentLevel] = useState("");
  const [summary,      setSummary]      = useState(""); // 종합의견

  // ── 회기 ────────────────────────────────────────────────────
  const [sessions,   setSessions]  = useState<Session[]>([empty()]);
  const [editingId,  setEditingId] = useState<number | null>(null);

  // ── 바로툴 대상자 연결 ──────────────────────────────────────
  const [toolChildren,  setToolChildren]  = useState<ToolChild[]>([]);
  const [toolChildId,   setToolChildId]   = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/tool-children")
      .then((r) => (r.ok ? r.json() : { children: [] }))
      .then((d) => setToolChildren(d.children ?? []))
      .catch(() => {});
  }, []);

  // ── 연·월 유지 — 마지막 입력값을 기억해 새 문서·새로고침에도 이어짐 ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem("baroilji-support-ym");
      if (raw) { const { y, m } = JSON.parse(raw); if (y) setYear(String(y)); if (m) setMonth(String(m)); }
    } catch { /* noop */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem("baroilji-support-ym", JSON.stringify({ y: year, m: month })); } catch { /* noop */ }
  }, [year, month]);

  // ── 액션 상태 ───────────────────────────────────────────────
  const [busy, setBusy] = useState(false);
  const [msg,  setMsg]  = useState("");
  const [err,  setErr]  = useState("");

  // ── 양식 매핑 ───────────────────────────────────────────────
  const [localHasForm, setLocalHasForm] = useState(hasForm);
  const [mapFile,      setMapFile]      = useState<File | null>(null);
  const [mapResult,    setMapResult]    = useState<MapResult | null>(null);
  const [mapOverrides, setMapOverrides] = useState<Record<string, string>>({});
  const [picker,       setPicker]       = useState<Picker | null>(null);
  const [analyzing,    setAnalyzing]    = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [mapMsg,       setMapMsg]       = useState("");
  const [mapErr,       setMapErr]       = useState("");
  const [mapEditing,   setMapEditing]   = useState(false); // 저장된 양식 매핑 재수정 모드
  const [mapPreview,   setMapPreview]   = useState(true);  // 매핑 화면 인라인 예시 미리보기
  const [aiBusy,       setAiBusy]       = useState(false); // AI 자동매핑 진행
  const [aiLow,        setAiLow]        = useState<Set<string>>(new Set()); // 낮은 신뢰도 칸(확인 필요)
  const [autoMapPending, setAutoMapPending] = useState(false); // 업로드 직후 AI 자동실행 대기(베타)

  // ── 삭제 확인 ───────────────────────────────────────────────
  const [delConfirm, setDelConfirm] = useState(false);

  // ── 미리보기 ── (문단별 원본 텍스트 paras + 채운 값 pvals)
  type PreviewCell = { r: number; c: number; rs: number; cs: number; paras: string[]; pvals: string[] };
  const [preview,    setPreview]    = useState<{ tables: PreviewCell[][] } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  // 매핑 패널이 열려 있고 저장 전이면 미리보기·출력은 '저장된' 매핑을 쓰므로 막는다.
  const mappingUnsaved = !!mapResult && (mapEditing || !!mapFile);

  // 베타 UX: 업로드로 격자가 준비되면 AI 자동매핑 1회 실행(사람이 확인 후 저장)
  useEffect(() => {
    if (autoMapPending && mapResult && !aiBusy) {
      setAutoMapPending(false);
      aiAutoMap();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMapPending, mapResult]);

  // 양식 등록 직후(?map=1) 상세 화면에 오면 매핑 화면을 바로 연다.
  useEffect(() => {
    if (searchParams.get("map") === "1" && hasForm) {
      openMappingEdit();
      router.replace(`/support/programs/${programId}`); // 쿼리 정리(새로고침 시 재실행 방지)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 세션 헬퍼 ───────────────────────────────────────────────
  const setSess = (i: number, k: keyof Session, v: string) =>
    setSessions((a) => a.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  const addRow = () => setSessions((a) => [...a, empty()]);
  const delRow = (i: number) => setSessions((a) => a.filter((_, j) => j !== i));

  function newDoc() {
    setStudentName(""); setBirth(""); setSessions([empty()]); setEditingId(null); setMsg(""); setErr("");
    setToolChildId(null); setSummary("");
  }

  function loadRecord(r: Saved) {
    try {
      const d = JSON.parse(r.payload);
      setStudentName(d.studentName ?? r.student);
      setBirth(d.birth ?? "");
      setTherapistName(d.therapistName ?? therapist);
      setOrgName(d.org ?? org);
      setYear(String(d.year ?? new Date().getFullYear()));
      setMonth(String(d.month ?? new Date().getMonth() + 1));
      setSchool(d.school ?? "");
      setGrade(d.grade ?? "");
      setDayOfWeek(d.dayOfWeek ?? "");
      setSessionTime(d.sessionTime ?? "");
      setGoal(d.goal ?? "");
      setCurrentLevel(d.currentLevel ?? "");
      setSummary(d.summary ?? "");
      if (d.school || d.grade || d.dayOfWeek || d.sessionTime || d.goal || d.currentLevel || d.summary) setShowExtra(true);
      setToolChildId(r.toolChildId ?? null);
      const ss: Session[] = Array.isArray(d.sessions) && d.sessions.length
        ? d.sessions.map((s: Session) => ({
            date: s.date ?? "", startTime: s.startTime ?? "",
            endTime: s.endTime ?? "", content: s.content ?? "", notes: s.notes ?? "",
          }))
        : [empty()];
      setSessions(ss);
      setEditingId(r.id); setErr(""); setMsg(`'${r.student}' 불러옴 — 수정 후 출력하세요.`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch { setErr("저장본을 불러오지 못했어요."); }
  }

  // ── 기록지 출력 ─────────────────────────────────────────────
  async function print() {
    setErr(""); setMsg("");
    if (!studentName.trim()) { setErr("아동 이름을 입력하세요."); return; }
    if (!localHasForm) { setErr("기록지 양식이 등록되어 있지 않습니다."); return; }
    if (mappingUnsaved) { setErr("매핑이 저장되지 않았어요. 위 매핑 영역에서 ‘매핑 갱신/저장’을 먼저 누른 뒤 출력하세요."); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/support/programs/${programId}/record`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName: studentName.trim(),
          therapistName: therapistName.trim(),
          org: orgName.trim(),
          birth: birth.trim() || undefined,
          year: Number(year) || new Date().getFullYear(),
          month: Number(month) || new Date().getMonth() + 1,
          school: school.trim() || undefined,
          grade: grade.trim() || undefined,
          dayOfWeek: dayOfWeek.trim() || undefined,
          sessionTime: sessionTime.trim() || undefined,
          goal: goal.trim() || undefined,
          currentLevel: currentLevel.trim() || undefined,
          summary: summary.trim() || undefined,
          sessions: sessions.filter((s) => s.date || s.content),
          toolChildId: toolChildId ?? undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? `오류 (${res.status})`); return;
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      const disp = res.headers.get("Content-Disposition") ?? "";
      const match = disp.match(/filename\*=UTF-8''(.+)/);
      a.href = url;
      a.download = match ? decodeURIComponent(match[1]) : `${programName}_${studentName}.hwpx`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg("출력 파일이 다운로드됐어요.");
      router.refresh();
    } catch { setErr("출력 중 오류가 발생했어요."); }
    finally { setBusy(false); }
  }

  // ── 미리보기 요청 (빈 칸은 예시 내용으로 채워서 보여줌) ────────
  async function showPreview() {
    setErr(""); setMsg("");
    if (!localHasForm) { setErr("기록지 양식이 등록되어 있지 않습니다."); return; }
    if (mappingUnsaved) { setErr("매핑이 저장되지 않았어요. 위 매핑 영역에서 파란 ‘매핑 갱신/저장’ 버튼을 먼저 누른 뒤 미리보기하세요. (매핑 영역의 ‘② 예시 미리보기’는 저장 전 매핑이에요.)"); return; }
    setPreviewBusy(true);
    try {
      const realSessions = sessions.filter((s) => s.date || s.content);
      const body = {
        studentName:   studentName.trim()   || EX.studentName,
        therapistName: therapistName.trim() || EX.therapistName,
        org:           orgName.trim()       || EX.org,
        birth:         birth.trim()         || EX.birth,
        year:  Number(year)  || new Date().getFullYear(),
        month: Number(month) || new Date().getMonth() + 1,
        school:       school.trim()       || EX.school,
        grade:        grade.trim()        || EX.grade,
        dayOfWeek:    dayOfWeek.trim()    || EX.dayOfWeek,
        sessionTime:  sessionTime.trim()  || EX.sessionTime,
        goal:         goal.trim()         || EX.goal,
        currentLevel: currentLevel.trim() || EX.currentLevel,
        summary:      summary.trim()      || EX.summary,
        sessions: realSessions.length ? realSessions : EX_SESSIONS,
      };
      const res = await fetch(`/api/support/programs/${programId}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.error ?? "미리보기 오류"); return; }
      const d = await res.json();
      setPreview(d);
    } catch { setErr("미리보기 중 오류가 발생했어요."); }
    finally { setPreviewBusy(false); }
  }

  // ── 양식 파일 선택 → 자동분석 ──────────────────────────────
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMapFile(file); setMapResult(null); setMapOverrides({}); setPicker(null); setAiLow(new Set());
    setMapMsg(""); setMapErr("");
    setAnalyzing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/forms/analyze", { method: "POST", body: fd });
      const d   = await res.json();
      if (!res.ok) throw new Error(d.error ?? "분석 실패");
      setMapResult(d);
      // 학습 캐시 적중 — 이전에 매핑한 양식이면 매핑을 자동으로 채움(사람이 확인 후 저장)
      const cachedHit = d.cached?.overrides && Object.keys(d.cached.overrides).length;
      if (cachedHit) {
        setMapOverrides(d.cached.overrides);
        setMapMsg(`✓ 이전에 매핑한 적 있는 양식이에요${d.cached.label ? ` (${d.cached.label})` : ""} — 매핑을 자동으로 채웠어요. 확인 후 저장하세요.`);
      } else if (betaUx) {
        // 베타 UX: 캐시가 없으면 업로드 직후 AI가 자동으로 칸을 잡아줌(사람이 확인 후 저장)
        setAutoMapPending(true);
      }
    } catch (e) {
      setMapErr(e instanceof Error ? e.message : "분석 중 오류가 발생했어요.");
    } finally {
      setAnalyzing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // ── 저장된 양식의 매핑 재수정 열기 ──────────────────────────
  async function openMappingEdit() {
    setMapErr(""); setMapMsg(""); setAnalyzing(true);
    try {
      const res = await fetch(`/api/support/programs/${programId}`);
      const d   = await res.json();
      if (!res.ok) throw new Error(d.error ?? "불러오기 실패");
      setMapResult({ coverage: d.coverage, grid: d.grid });
      setMapOverrides(d.overrides ?? {});
      setMapEditing(true);
      setMapFile(null);
    } catch (e) {
      setMapErr(e instanceof Error ? e.message : "매핑을 불러오지 못했어요.");
    } finally { setAnalyzing(false); }
  }

  // ── 매핑 저장 (새 파일 업로드 또는 기존 양식 매핑만 갱신) ────
  async function saveMapping() {
    if (!mapFile && !mapEditing) return;
    setSaving(true); setMapErr(""); setMapMsg("");
    try {
      const overridesArray = Object.entries(mapOverrides)
        .map(([k, role]) => { const [t, r, c, p] = k.split(",").map(Number); return { table: t, row: r, col: c, p: p || 0, role }; });
      const fd = new FormData();
      if (mapFile) fd.append("file", mapFile);
      fd.append("overrides", JSON.stringify(overridesArray));
      const res = await fetch(`/api/support/programs/${programId}`, { method: "PATCH", body: fd });
      const d   = await res.json();
      if (!res.ok) throw new Error(d.error ?? "저장 실패");
      setLocalHasForm(!!d.program.formSpec);
      setMapMsg(mapEditing ? "매핑이 갱신됐어요." : "양식이 저장됐어요. 이제 기록지를 출력할 수 있어요.");
      setMapFile(null); setMapResult(null); setMapOverrides({}); setMapEditing(false);
      router.refresh();
    } catch (e) {
      setMapErr(e instanceof Error ? e.message : "저장 중 오류가 발생했어요.");
    } finally { setSaving(false); }
  }

  function cancelMapping() {
    setMapFile(null); setMapResult(null); setMapOverrides({}); setMapEditing(false);
    setMapMsg(""); setMapErr(""); setPicker(null); setAiLow(new Set());
  }

  // ── 역할 보정 ── (문단 단위: 키 = "t,r,c,p". 규칙 역할은 셀=문단0에 귀속)
  const effRole = (ti: number, cell: Cell, p: number): string | null => {
    const k = `${ti},${cell.r},${cell.c},${p}`;
    if (k in mapOverrides) return mapOverrides[k] || null;
    return p === 0 ? cell.role : null;
  };
  function assignRole(role: string) {
    if (!picker) return;
    const k = `${picker.t},${picker.r},${picker.c},${picker.p}`;
    setMapOverrides({ ...mapOverrides, [k]: role });
    setAiLow((prev) => { if (!prev.has(k)) return prev; const n = new Set(prev); n.delete(k); return n; }); // 사람이 확인함
    setPicker(null);
  }

  // ── AI 자동매핑 — LLM이 역할 제안. AI가 짚은 칸은 기존 역할도 덮어써 교정한다
  // (사람이 명시적으로 'AI 자동매핑'을 누른 것이므로). AI가 안 짚은 칸은 그대로 둠.
  async function aiAutoMap() {
    if (!mapResult) return;
    setAiBusy(true); setMapErr(""); setMapMsg("");
    try {
      const res = await fetch("/api/forms/automap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grid: mapResult.grid }),
      });
      const d = await res.json();
      if (!res.ok) { setMapErr(d.error ?? "AI 매핑 실패"); return; }
      const suggestions: Array<{ table: number; row: number; col: number; p?: number; role: string; confidence: number }> = d.suggestions ?? [];
      if (suggestions.length === 0) { setMapMsg("AI가 제안할 칸을 찾지 못했어요."); return; }

      const next = { ...mapOverrides };
      const low = new Set(aiLow);
      let added = 0, changed = 0, lowN = 0;
      for (const s of suggestions) {
        const k = `${s.table},${s.row},${s.col},${s.p ?? 0}`;
        const prev = next[k];
        if (prev === undefined) added++;
        else if (prev !== s.role) changed++;
        next[k] = s.role; // 기존 역할이 있어도 덮어써 교정
        if (s.confidence < 0.6) { low.add(k); lowN++; } else { low.delete(k); }
      }
      setMapOverrides(next);
      setAiLow(low);
      const parts = [];
      if (added) parts.push(`${added}칸 새로 매핑`);
      if (changed) parts.push(`${changed}칸 역할 교정`);
      setMapMsg(`AI 자동매핑 — ${parts.join(", ") || "변경 없음"}${lowN ? ` (확인 필요 ${lowN}칸)` : ""}. 오른쪽 예시 미리보기로 확인 후 저장하세요.`);
    } catch {
      setMapErr("AI 매핑 중 오류가 발생했어요.");
    } finally { setAiBusy(false); }
  }

  // 매핑 인라인 미리보기 — 현재 역할에 예시 값을 채운 좌표맵(키 "t,r,c,p")
  function exampleFillMap(): Map<string, string> {
    const m = new Map<string, string>();
    if (!mapResult) return m;
    const rowCells: Record<string, Array<{ ti: number; r: number; c: number; p: number }>> = {};
    mapResult.grid.forEach((cells, ti) => cells.forEach((cell) => {
      const paras = cell.paras && cell.paras.length ? cell.paras : [cell.text];
      paras.forEach((_, pi) => {
        const role = effRole(ti, cell, pi);
        if (!role) return;
        if (ROW_ROLES.includes(role)) {
          (rowCells[role] ??= []).push({ ti, r: cell.r, c: cell.c, p: pi });
        } else {
          const ex = ROLE_EX[role];
          if (typeof ex === "string") m.set(`${ti},${cell.r},${cell.c},${pi}`, ex);
        }
      });
    }));
    for (const role of Object.keys(rowCells)) {
      const list = Array.isArray(ROLE_EX[role]) ? (ROLE_EX[role] as string[]) : [];
      rowCells[role]
        .sort((a, b) => a.ti - b.ti || a.r - b.r || a.c - b.c || a.p - b.p)
        .forEach((cell, i) => {
          const v = list[i] ?? list[list.length - 1] ?? "";
          if (v) m.set(`${cell.ti},${cell.r},${cell.c},${cell.p}`, v);
        });
    }
    return m;
  }

  // ── 사업 삭제 ────────────────────────────────────────────────
  async function deleteProgram() {
    const res = await fetch(`/api/support/programs/${programId}`, { method: "DELETE" });
    if (res.ok) router.push("/support");
    else setErr("삭제 실패");
  }

  const missing = mapResult
    ? Object.entries(mapResult.coverage).filter(([, v]) => !v).map(([k]) => FIELD_LABEL[k] ?? k)
    : [];

  return (
    <>
      {/* 헤더 */}
      <div className="section-head">
        <div>
          <h2>{programName}</h2>
          <p>기록지를 작성하고 한글(.hwpx)로 출력해요.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/support" className="btn btn-ghost" style={{ fontSize: 13 }}>← 목록</Link>
          {!delConfirm
            ? <button className="btn btn-ghost" style={{ fontSize: 13, color: "var(--error)" }} onClick={() => setDelConfirm(true)}>사업 삭제</button>
            : (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--error)" }}>정말 삭제?</span>
                <button className="btn btn-ghost" style={{ fontSize: 12, color: "var(--error)" }} onClick={deleteProgram}>삭제</button>
                <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setDelConfirm(false)}>취소</button>
              </span>
            )}
        </div>
      </div>

      {/* ── 양식 등록/매핑 ── */}
      <div style={{ border: "1px solid var(--border)", borderRadius: 12, marginBottom: 24, overflow: "hidden" }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap",
          gap: 10, padding: "12px 16px",
          background: localHasForm ? "var(--surface-success, var(--surface))" : "var(--surface-warn, var(--surface))",
        }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{localHasForm ? "✓ 양식 등록됨" : "양식 미등록"}</span>
            <span style={{ marginLeft: 10, fontSize: 12, color: "var(--text-mute)" }}>
              {localHasForm
                ? (betaUx ? "✨ ‘매핑 수정’에서 AI 자동매핑으로 칸을 다시 잡을 수 있어요." : ".hwpx 양식이 연결되어 있어요.")
                : (betaUx ? ".hwpx 양식을 올리면 ✨AI가 칸을 자동으로 인식해요." : ".hwpx 기록지 양식을 등록하면 출력 가능해요.")}
            </span>
          </div>
          {!mapFile && !mapEditing && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {localHasForm && (
                <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={openMappingEdit} disabled={analyzing}>
                  {analyzing ? "불러오는 중…" : "매핑 수정"}
                </button>
              )}
              <label style={{ cursor: "pointer" }}>
                <span className="btn btn-ghost" style={{ fontSize: 13, pointerEvents: "none" }}>
                  {analyzing ? "분석 중…" : localHasForm ? "양식 교체" : "양식 등록"}
                </span>
                <input ref={fileRef} type="file" accept=".hwpx" hidden onChange={handleFileSelect} disabled={analyzing} />
              </label>
            </div>
          )}
        </div>

        {!mapFile && !localHasForm && (
          <p style={{ margin: 0, padding: "8px 16px", fontSize: 12, color: "var(--text-mute)", lineHeight: 1.5, borderTop: "1px solid var(--border)" }}>
            .hwp는 미지원 — 한글에서 &ldquo;다른 이름으로 저장 → .hwpx&rdquo;로 변환 후 업로드하세요.
          </p>
        )}

        {mapMsg && <p style={{ margin: 0, padding: "8px 16px", fontSize: 12, color: "var(--success, green)", borderTop: "1px solid var(--border)" }}>{mapMsg}</p>}
        {mapErr && <p style={{ margin: 0, padding: "8px 16px", fontSize: 12, color: "var(--error)", borderTop: "1px solid var(--border)" }}>{mapErr}</p>}

        {(mapFile || mapEditing) && mapResult && (
          <div style={{ borderTop: "1px solid var(--border)", padding: 16, display: "grid", gap: 16 }}>
            {/* 커버리지 */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                {mapEditing ? "매핑 수정" : "자동 매핑 결과"}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {Object.entries(mapResult.coverage).map(([k, ok]) => (
                  <span key={k} style={{
                    fontSize: 12, padding: "3px 9px", borderRadius: 20, fontWeight: 600,
                    background: ok ? "#DDEBD3" : "#F6E4DE", color: ok ? "#3F6132" : "#8A2F1C",
                  }}>
                    {ok ? "✓" : "✗"} {FIELD_LABEL[k] ?? k}
                  </span>
                ))}
              </div>
              {missing.length > 0
                ? <p style={{ margin: "8px 0 0", fontSize: 12, color: "#8A6422" }}>⚠ 못 찾은 칸: {missing.join(", ")} — 아래 표에서 클릭해 역할을 직접 지정하세요.</p>
                : <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--primary)" }}>✓ 핵심 칸을 모두 인식했어요.</p>
              }
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--text-mute)" }}>
                학교·학년·요일·정기시간·치료목표·현행수준·<b>연도·월</b> 칸은 클릭해 역할을 지정하세요.
                회차·날짜·시간이 칸마다 흩어져 있으면 각 칸을 클릭해 <b>회차·날짜·시작·종료</b> 역할로 지정하면 순서대로 채워져요.
              </p>
            </div>

            {/* 베타 UX: AI 자동매핑을 1순위 큰 버튼으로 노출 */}
            {betaUx && (
              <div style={{ padding: "14px 16px", borderRadius: 12, background: "var(--primary-soft)", border: "1px solid var(--primary)" }}>
                <button
                  className="btn btn-primary"
                  onClick={aiAutoMap}
                  disabled={aiBusy}
                  style={{ width: "100%", justifyContent: "center", fontSize: 15, fontWeight: 700, padding: "11px" }}
                >
                  {aiBusy ? "✨ AI가 칸을 분석하고 있어요…" : "✨ AI로 칸 자동 매핑하기"}
                </button>
                <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--text-soft)", lineHeight: 1.5 }}>
                  AI가 양식의 칸을 알아서 인식해 역할을 채워줘요. 아래 <b>예시 미리보기</b>로 확인·수정한 뒤 저장하세요.
                  {" "}직접 맞추려면 아래 표에서 칸을 클릭해도 돼요.
                </p>
              </div>
            )}

            {/* 표 그리드 + 인라인 예시 미리보기 */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  {!betaUx && (
                    <button
                      className="btn btn-sm"
                      onClick={aiAutoMap}
                      disabled={aiBusy}
                      style={{ fontSize: 12, background: "var(--primary)", color: "#fff", border: "none" }}
                      title="규칙이 못 잡은 칸을 AI가 분석해 역할을 제안해요"
                    >
                      {aiBusy ? "AI 분석 중…" : "✨ AI 자동매핑"}
                    </button>
                  )}
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-soft)", cursor: "pointer" }}>
                  <input type="checkbox" checked={mapPreview} onChange={(e) => setMapPreview(e.target.checked)} />
                  예시 미리보기 나란히 보기
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: mapPreview ? "1fr 1fr" : "1fr", gap: 14, alignItems: "start" }}>
                {/* ① 매핑 카드 */}
                <div style={{ border: "1px solid var(--border-strong, var(--border))", borderRadius: 10, overflow: "hidden", background: "var(--surface)" }}>
                  <div style={{ padding: "9px 12px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)", fontSize: 12.5, fontWeight: 800, display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                    ✏️ 매핑
                    <span style={{ fontWeight: 500, color: "var(--text-mute)", fontSize: 11.5 }}>여기서 칸을 클릭해 역할을 지정·수정해요</span>
                  </div>
                  <div style={{ padding: 12, overflowX: "auto" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
                      {mapResult.grid.map((cells, ti) => (
                        <div key={ti} style={{ flex: "0 1 auto" }}>
                          <TableView
                            cells={cells}
                            roleOf={(cell, p) => effRole(ti, cell, p)}
                            lowOf={(cell, p) => aiLow.has(`${ti},${cell.r},${cell.c},${p}`)}
                            onCell={(r, c, p, text, x, y) => setPicker({ t: ti, r, c, p, text, x, y })}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ② 예시 미리보기 카드 */}
                {mapPreview && (() => {
                  const fm = exampleFillMap();
                  return (
                    <div style={{ border: "1px solid var(--primary)", borderRadius: 10, overflow: "hidden", background: "var(--surface)" }}>
                      <div style={{ padding: "9px 12px", background: "var(--primary-soft)", borderBottom: "1px solid var(--primary)", fontSize: 12.5, fontWeight: 800, color: "var(--primary)", display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                        👁 예시 미리보기
                        <span style={{ fontWeight: 500, fontSize: 11.5 }}>지정한 역할이 이렇게 채워져요 (예시값)</span>
                      </div>
                      <div style={{ padding: 12, overflowX: "auto" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
                          {mapResult.grid.map((cells, ti) => (
                            <div key={ti} style={{ flex: "0 1 auto" }}>
                              <PreviewTable cells={cells.map((c) => {
                                const paras = c.paras && c.paras.length ? c.paras : [c.text];
                                return {
                                  r: c.r, c: c.c, rs: c.rs, cs: c.cs, paras,
                                  pvals: paras.map((_, pi) => fm.get(`${ti},${c.r},${c.c},${pi}`) ?? ""),
                                };
                              })} />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" onClick={saveMapping} disabled={saving}>
                {saving ? "저장 중…" : mapEditing ? "매핑 갱신" : "이 매핑으로 저장"}
              </button>
              <button className="btn btn-ghost" onClick={cancelMapping}>취소</button>
            </div>
          </div>
        )}
      </div>

      {/* ── 저장된 아동 (마음모아 스타일) ── */}
      {saved.length > 0 && (
        <div className="card" style={{ padding: "12px 16px", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--text-soft)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
              저장된 아동 ({saved.length})
            </h3>
            <button className="btn btn-sm btn-ghost" onClick={newDoc}>+ 새로 작성</button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {saved.map((r) => (
              <div key={r.id} style={{
                display: "flex", alignItems: "center", gap: 0,
                border: `1px solid ${editingId === r.id ? "var(--primary)" : "var(--border)"}`,
                borderRadius: 999, padding: "4px 6px 4px 12px",
                background: editingId === r.id ? "var(--primary-soft)" : "var(--surface)",
              }}>
                <button
                  className="btn btn-sm btn-ghost"
                  style={{ padding: "2px 4px", borderRadius: 999 }}
                  onClick={() => loadRecord(r)}
                >
                  <b>{r.student}</b>
                  <span style={{ color: "var(--text-mute)", fontSize: 11, marginLeft: 5 }}>{r.updatedAt}</span>
                </button>
                {r.toolChildId && (
                  <Link
                    href={`/monitor/${r.toolChildId}`}
                    style={{ fontSize: 11, color: "var(--primary)", textDecoration: "none", padding: "2px 8px 2px 4px" }}
                    title="모니터링 보기"
                  >
                    📊
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 기록지 작성 ── */}
      <div style={{ display: "grid", gap: 24, alignItems: "start" }}>

        {/* 기본 정보 — 가로 배치 */}
        <div>
          <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: "var(--text-soft)", letterSpacing: "0.05em", textTransform: "uppercase" }}>기본 정보</p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
            <div className="field" style={{ flex: "0 0 150px", margin: 0 }}>
              <label className="label">아동 이름 <span style={{ color: "var(--error)" }}>*</span></label>
              <input className="input" value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="홍길동" style={{ fontSize: 13 }} />
            </div>
            <div className="field" style={{ flex: "0 0 120px", margin: 0 }}>
              <label className="label">생년월일</label>
              <input className="input" value={birth} onChange={(e) => setBirth(e.target.value)} placeholder="2018-03-15" style={{ fontSize: 13 }} />
            </div>
            <div className="field" style={{ flex: "0 0 130px", margin: 0 }}>
              <label className="label">담당 치료사</label>
              <input className="input" value={therapistName} onChange={(e) => setTherapistName(e.target.value)} style={{ fontSize: 13 }} />
            </div>
            <div className="field" style={{ flex: "0 0 160px", margin: 0 }}>
              <label className="label">기관명</label>
              <input className="input" value={orgName} onChange={(e) => setOrgName(e.target.value)} style={{ fontSize: 13 }} />
            </div>
            <div className="field" style={{ flex: "0 0 72px", margin: 0 }}>
              <label className="label">연도</label>
              <input className="input" value={year} onChange={(e) => setYear(e.target.value)} style={{ textAlign: "center", fontSize: 13 }} />
            </div>
            <div className="field" style={{ flex: "0 0 56px", margin: 0 }}>
              <label className="label">월</label>
              <input className="input" value={month} onChange={(e) => setMonth(e.target.value)} style={{ textAlign: "center", fontSize: 13 }} />
            </div>

            {/* 바로툴 대상자 연결 */}
            {toolChildren.length > 0 && (
              <div className="field" style={{ flex: "0 0 200px", margin: 0 }}>
                <label className="label" style={{ fontSize: 11 }}>바로툴 대상자 연결</label>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <select
                    value={toolChildId ?? ""}
                    onChange={(e) => setToolChildId(e.target.value ? Number(e.target.value) : null)}
                    style={{ flex: 1, minWidth: 0, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 13, color: "var(--text)" }}
                  >
                    <option value="">연결 안 함</option>
                    {toolChildren.map((tc) => (
                      <option key={tc.id} value={tc.id}>{tc.name}{tc.memo ? ` (${tc.memo})` : ""}</option>
                    ))}
                  </select>
                  {toolChildId && (
                    <Link href={`/monitor/${toolChildId}`} style={{ fontSize: 11, color: "var(--primary)", textDecoration: "none", whiteSpace: "nowrap" }}>
                      📊
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 추가 정보 토글 */}
          <button
            onClick={() => setShowExtra((v) => !v)}
            className="btn btn-ghost"
            style={{ fontSize: 12, marginTop: 12, marginBottom: showExtra ? 8 : 0 }}
          >
            <span>추가 정보 (학교·목표·현행수준 등)</span>
            <span style={{ opacity: 0.5, marginLeft: 6 }}>{showExtra ? "▲" : "▼"}</span>
          </button>

          {showExtra && (
            <div style={{ display: "grid", gap: 10, paddingLeft: 10, borderLeft: "2px solid var(--border)" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {([
                  { label: "학교",       value: school,        set: setSchool,       ph: "OO초등학교",        w: 150 },
                  { label: "학년",       value: grade,         set: setGrade,        ph: "3학년",             w: 90 },
                  { label: "요일 (정기)", value: dayOfWeek,     set: setDayOfWeek,    ph: "화·목",             w: 110 },
                  { label: "시간 (정기)", value: sessionTime,   set: setSessionTime,  ph: "10:00~10:50",       w: 130 },
                  { label: "치료 목표",  value: goal,          set: setGoal,         ph: "문장 산출 향상",     w: 200 },
                  { label: "현행 수준",  value: currentLevel,  set: setCurrentLevel, ph: "2어절 수준 발화",    w: 200 },
                ] as { label: string; value: string; set: (v: string) => void; ph: string; w: number }[]).map(({ label, value, set, ph, w }) => (
                  <div key={label} className="field" style={{ flex: `0 0 ${w}px`, margin: 0 }}>
                    <label className="label" style={{ fontSize: 11 }}>{label}</label>
                    <input className="input" style={{ fontSize: 13 }} value={value} onChange={(e) => set(e.target.value)} placeholder={ph} />
                  </div>
                ))}
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label className="label" style={{ fontSize: 11 }}>종합의견 (총평·비고)</label>
                <textarea
                  className="input"
                  style={{ fontSize: 13, minHeight: 56, resize: "vertical", lineHeight: 1.5 }}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="목표 행동에 향상을 보이며 참여 태도가 적극적임. 가정 연계 지도 권장."
                />
              </div>
            </div>
          )}

        </div>

        {/* 회기 — 세로 */}
        <div style={{ maxWidth: 760 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--text-soft)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
              회기 ({sessions.length})
            </p>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={addRow}>+ 행 추가</button>
          </div>

          {/* 헤더 */}
          <div style={{ display: "grid", gridTemplateColumns: "90px 64px 64px 1fr 1fr 28px", gap: 4, marginBottom: 4 }}>
            {["날짜", "시작", "종료", "내용/결과", "비고·특이사항", ""].map((h) => (
              <div key={h} style={{ fontSize: 10, fontWeight: 700, color: "var(--text-mute)", padding: "0 4px" }}>{h}</div>
            ))}
          </div>

          <div className="sess-rows" style={{ display: "grid", gap: 4 }}>
            {sessions.map((s, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "90px 64px 64px 1fr 1fr 28px", gap: 4, alignItems: "center" }}>
                <input className="input" placeholder="3/5" value={s.date}      onChange={(e) => setSess(i, "date",      e.target.value)} style={{ fontSize: 12 }} />
                <input className="input" placeholder="10:00" value={s.startTime} onChange={(e) => setSess(i, "startTime", e.target.value)} style={{ fontSize: 12, textAlign: "center" }} />
                <input className="input" placeholder="10:50" value={s.endTime}   onChange={(e) => setSess(i, "endTime",   e.target.value)} style={{ fontSize: 12, textAlign: "center" }} />
                <input className="input" placeholder="회기 목표 달성"  value={s.content} onChange={(e) => setSess(i, "content",   e.target.value)} style={{ fontSize: 12 }} />
                <input className="input" placeholder="특이사항 없음"   value={s.notes}   onChange={(e) => setSess(i, "notes",     e.target.value)} style={{ fontSize: 12 }} />
                <button onClick={() => delRow(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-mute)", fontSize: 14, padding: 0 }}>×</button>
              </div>
            ))}
          </div>

          <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--text-mute)" }}>
            비고·특이사항 칸이 양식에 따로 있으면 각각 들어가고, 내용/결과 칸 하나만 있으면 &ldquo;내용 - 비고&rdquo; 형태로 합쳐져 출력돼요.
            회기가 양식의 칸 수보다 많으면 칸 수만큼씩 <b>여러 장(ZIP)</b>으로 자동으로 나눠 출력돼요.
          </p>
        </div>
      </div>

      {/* ── 하단 실행 바: 기본정보·회기 다 채운 뒤 출력 ── */}
      <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
        {msg && <p style={{ fontSize: 12, color: "var(--success, green)", margin: "0 0 10px" }}>{msg}</p>}
        {err && <p style={{ fontSize: 12, color: "var(--error)", margin: "0 0 10px" }}>{err}</p>}

        {mappingUnsaved && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
            padding: "9px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 600,
            background: "var(--warn-soft, #FFF4E0)", color: "var(--warn-strong, #8A6422)",
            border: "1px solid #E8B96A",
          }}>
            ⚠ 매핑이 저장되지 않았어요 — 위 매핑 영역에서 <b>파란 ‘매핑 갱신/저장’</b> 버튼을 먼저 눌러야 미리보기·출력에 반영돼요.
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn btn-primary" onClick={print} disabled={busy || !localHasForm}>
            {busy ? "생성 중…" : "기록지 출력"}
          </button>
          <button className="btn btn-ghost" onClick={showPreview} disabled={previewBusy || !localHasForm} style={{ fontSize: 13 }}>
            {previewBusy ? "로딩…" : "미리보기"}
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn btn-ghost" onClick={newDoc} style={{ fontSize: 13, color: "var(--text-mute)" }}>초기화</button>
        </div>
      </div>

      {/* 역할 선택 팝오버 */}
      {picker && (() => {
        const vw = typeof window !== "undefined" ? window.innerWidth  : 1200;
        const vh = typeof window !== "undefined" ? window.innerHeight : 800;
        const below = picker.y < vh * 0.55;
        const left  = Math.max(8, Math.min(picker.x + 6, vw - 260));
        const vpos: React.CSSProperties = below
          ? { top: Math.min(picker.y + 6, vh - 60) }
          : { bottom: Math.max(8, vh - picker.y + 6) };
        return (
          <>
            <div onClick={() => setPicker(null)} style={{ position: "fixed", inset: 0, zIndex: 50 }} />
            <div style={{
              position: "fixed", zIndex: 51, left, ...vpos,
              width: 256, maxHeight: "80vh", overflowY: "auto",
              background: "var(--surface)", border: "1px solid var(--primary)",
              borderRadius: 10, boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
              padding: 10, display: "grid", gap: 8,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                &ldquo;{picker.text || "(빈칸)"}&rdquo; 역할 지정
              </div>

              <div style={{ fontSize: 11, color: "var(--text-mute)" }}>기본 정보 칸</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {SCALAR_ROLES.map((role) => (
                  <button key={role} className="btn btn-sm" onClick={() => assignRole(role)}>{role}</button>
                ))}
              </div>

              <div style={{ fontSize: 11, color: "var(--text-mute)" }}>회기 행 (날짜 열마다 적용)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {ROW_ROLES.map((role) => (
                  <button key={role} className="btn btn-sm" onClick={() => assignRole(role)}>{role}</button>
                ))}
              </div>

              <div style={{ display: "flex", gap: 6, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                <button className="btn btn-sm" onClick={() => assignRole("")} style={{ color: "var(--error)" }}>역할 비우기</button>
                <button className="btn btn-sm" onClick={() => setPicker(null)}>취소</button>
              </div>
            </div>
          </>
        );
      })()}

      {/* ── 미리보기 모달 ── */}
      {preview && (
        <>
          <div
            onClick={() => setPreview(null)}
            style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.5)" }}
          />
          <div style={{
            position: "fixed", zIndex: 61, top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(96vw, 900px)", maxHeight: "86vh",
            background: "var(--surface)", borderRadius: 14,
            boxShadow: "0 12px 40px rgba(0,0,0,0.28)",
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
              <div>
                <span style={{ fontWeight: 800, fontSize: 15 }}>기록지 미리보기</span>
                <span style={{ marginLeft: 8, fontSize: 12, color: "var(--text-mute)" }}>
                  출력될 전체 기록지의 모습이에요
                </span>
              </div>
              <button onClick={() => setPreview(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-mute)", padding: "0 4px" }}>×</button>
            </div>
            {/* 예시 안내 배너 */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 18px", fontSize: 13, fontWeight: 600,
              background: "var(--warn-soft, #FFF4E0)", color: "var(--warn-strong, #8A6422)",
              borderBottom: "1px solid var(--border)",
            }}>
              <span style={{ fontSize: 15 }}>📋</span>
              <span>이건 <b>예시</b>입니다 — 비어 있는 칸은 예시 내용으로 채워 보여드려요. 실제 출력에는 입력하신 값만 들어가요.</span>
            </div>
            <div style={{ overflowY: "auto", padding: "20px 18px", background: "var(--surface-2, #f4f4f5)" }}>
              {/* 종이처럼 — 표를 세로로 쌓아 전체 기록지로 표시 */}
              <div style={{
                background: "#fff", margin: "0 auto", maxWidth: 760,
                padding: "32px 36px", borderRadius: 4,
                boxShadow: "0 1px 6px rgba(0,0,0,0.12)",
                display: "flex", flexDirection: "column", gap: 20,
              }}>
                {preview.tables.map((cells, ti) => (
                  <PreviewTable key={ti} cells={cells} full />
                ))}
              </div>
            </div>
            <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
              <button className="btn btn-primary" onClick={() => { setPreview(null); print(); }} disabled={busy}>
                {busy ? "생성 중…" : "바로 출력"}
              </button>
              <button className="btn btn-ghost" onClick={() => setPreview(null)}>닫기</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ── 미리보기 표 렌더러 ─── (문단별 원본 텍스트/채운 값) ───────────
type PreviewCell = { r: number; c: number; rs: number; cs: number; paras: string[]; pvals: string[] };
function PreviewTable({ cells, full = false }: { cells: PreviewCell[]; full?: boolean }) {
  if (cells.length === 0) return null;
  const maxR = Math.max(...cells.map((c) => c.r + c.rs));
  const maxC = Math.max(...cells.map((c) => c.c + c.cs));
  const at = new Map<string, PreviewCell>();
  cells.forEach((c) => at.set(`${c.r},${c.c}`, c));
  const covered = new Set<string>();
  const rows: React.ReactNode[] = [];
  for (let r = 0; r < maxR; r++) {
    const tds: React.ReactNode[] = [];
    for (let c = 0; c < maxC; c++) {
      if (covered.has(`${r},${c}`)) continue;
      const cell = at.get(`${r},${c}`);
      if (cell) {
        for (let rr = r; rr < r + cell.rs; rr++)
          for (let cc = c; cc < c + cell.cs; cc++)
            if (!(rr === r && cc === c)) covered.add(`${rr},${cc}`);
        const paras = cell.paras.length ? cell.paras : [""];
        const anyFilled = cell.pvals.some(Boolean);
        tds.push(
          <td key={c} colSpan={cell.cs} rowSpan={cell.rs} style={{
            border: "1px solid #c9c9cf", padding: "5px 7px", fontSize: 12.5, lineHeight: 1.5, verticalAlign: "top",
            background: anyFilled ? "var(--primary-soft, #eef4ff)" : "transparent", color: "#1a1a1a",
          }}>
            {paras.map((ptext, pi) => {
              const v = cell.pvals[pi];
              return (
                <div key={pi} style={{ marginBottom: paras.length > 1 && pi < paras.length - 1 ? 2 : 0 }}>
                  {v
                    ? <span style={{ fontWeight: 600, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{v}</span>
                    : <span style={{ color: ptext ? "#1a1a1a" : "#bbb", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{ptext || ""}</span>}
                </div>
              );
            })}
          </td>,
        );
      } else {
        tds.push(<td key={c} style={{ border: "1px solid #c9c9cf" }} />);
      }
    }
    rows.push(<tr key={r}>{tds}</tr>);
  }
  return (
    <table style={{ borderCollapse: "collapse", width: full ? "100%" : "auto", tableLayout: "auto" }}>
      <tbody>{rows}</tbody>
    </table>
  );
}

// ── 표 그리드 렌더러 ─── (문단 단위 클릭: 한 칸 여러 줄이면 줄마다 역할 지정) ───
function TableView({ cells, roleOf, onCell, lowOf }: {
  cells: Cell[];
  roleOf: (cell: Cell, p: number) => string | null;
  onCell: (r: number, c: number, p: number, text: string, x: number, y: number) => void;
  lowOf?: (cell: Cell, p: number) => boolean;
}) {
  if (cells.length === 0) return null;
  const maxR = Math.max(...cells.map((c) => c.r + c.rs));
  const maxC = Math.max(...cells.map((c) => c.c + c.cs));
  const at = new Map<string, Cell>();
  cells.forEach((c) => at.set(`${c.r},${c.c}`, c));
  const covered = new Set<string>();
  const rows: React.ReactNode[] = [];
  for (let r = 0; r < maxR; r++) {
    const tds: React.ReactNode[] = [];
    for (let c = 0; c < maxC; c++) {
      if (covered.has(`${r},${c}`)) continue;
      const cell = at.get(`${r},${c}`);
      if (cell) {
        for (let rr = r; rr < r + cell.rs; rr++)
          for (let cc = c; cc < c + cell.cs; cc++)
            if (!(rr === r && cc === c)) covered.add(`${rr},${cc}`);
        const paras = cell.paras && cell.paras.length ? cell.paras : [cell.text];
        const multi = paras.length > 1;
        tds.push(
          <td key={c} colSpan={cell.cs} rowSpan={cell.rs} style={{
            border: "1px solid var(--border)", padding: "3px 5px", fontSize: 11, verticalAlign: "top",
            background: "var(--surface)", minWidth: 36, maxWidth: 160,
          }}>
            {paras.map((ptext, pi) => {
              const role = roleOf(cell, pi);
              const low = role ? lowOf?.(cell, pi) ?? false : false;
              return (
                <div key={pi}
                  onClick={(e) => onCell(cell.r, cell.c, pi, ptext, e.clientX, e.clientY)}
                  title={low ? "AI 제안 — 신뢰도 낮음, 확인하세요" : "클릭해서 역할 지정/해제"}
                  style={{
                    cursor: "pointer", borderRadius: 3,
                    border: low ? "2px solid #E8912D" : multi ? "1px dashed var(--border)" : "none",
                    background: low ? "#FFF4E0" : role ? "var(--primary-soft)" : "transparent",
                    padding: multi ? "1px 3px" : 0,
                    marginBottom: multi && pi < paras.length - 1 ? 2 : 0,
                  }}>
                  {role && <div style={{ fontSize: 9, fontWeight: 800, color: low ? "#B5651D" : "var(--primary)", marginBottom: 1 }}>{low ? "? " : ""}{role}</div>}
                  <div style={{ color: ptext ? "var(--text)" : "var(--text-mute)", whiteSpace: "normal", wordBreak: "break-all" }}>
                    {ptext || (role ? "" : "·")}
                  </div>
                </div>
              );
            })}
          </td>,
        );
      } else {
        tds.push(<td key={c} style={{ border: "1px solid var(--border)", background: "var(--surface-2)" }} />);
      }
    }
    rows.push(<tr key={r}>{tds}</tr>);
  }
  return (
    <table style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
      <tbody>{rows}</tbody>
    </table>
  );
}
