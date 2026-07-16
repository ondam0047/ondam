"use client";

import { useCallback, useEffect, useState } from "react";
import { useBetaUx } from "../BetaUxContext";
import { rolesForForm, isFilledValue } from "@/lib/record-roles";

type Cell = { r: number; c: number; cs: number; rs: number; text: string; role: string | null; p?: number };
type Spec = { schedule?: Array<{ role: string }>; detail?: unknown[]; extraSessionCols?: number[]; extraResultRows?: number[] };
type AnalyzeResult = { coverage: Record<string, boolean>; grid: Cell[][]; spec?: Spec; cached?: { overrides: Record<string, string> } | null; warning?: string };
type Suggestion = { table: number; row: number; col: number; p?: number; role: string; confidence: number };

// 캐시/AI 가 주는 4-요소 키(t,r,c,p)를 매퍼가 쓰는 3-요소 키(t,r,c)로 정규화.
function trcKey(t: number, r: number, c: number) { return `${t},${r},${c}`; }

const FIELD_LABEL: Record<string, string> = {
  org: "기관명", name: "이름", birth: "생년월일", date: "날짜",
  start: "시작시간", end: "종료시간", voucher: "바우처(분)", extra: "추가구매",
  amount: "금액", result: "결과표",
};

const KIND_LABEL: Record<string, string> = { record: "기록지", schedule: "일정표" };

// 통합 양식(기록지+일정표 한 파일)을 슬롯별로 자기 영역만 매핑·미리보기 하기 위한 역할 분류.
// 공통 역할은 양쪽 슬롯에서 보이고, 일정표 역할(일정·/달력· 접두사 + 일정표 전용 스칼라)은 일정표 슬롯에서만.
const COMMON_ROLES = new Set(["기관명", "대상자이름", "치료사이름", "생년월일", "서비스종류", "제공영역", "서명"]);
const SCHEDULE_ONLY_ROLES = new Set(["관리번호", "단가", "횟수", "총금액", "본인부담금", "주기", "제공일", "작성일자", "전화"]);
function roleVisibleForKind(role: string | null, kind: "record" | "schedule"): boolean {
  if (!role) return false;
  if (COMMON_ROLES.has(role)) return true; // 공통 칸은 양쪽에서 표시
  const isSchedule = role.startsWith("일정·") || role.startsWith("달력·") || SCHEDULE_ONLY_ROLES.has(role);
  return kind === "schedule" ? isSchedule : !isSchedule;
}
// 기록지 커버리지 키 중 공통(양쪽 표시) — 일정표 슬롯에선 이 외 회기/결과 배지는 숨김.
const COMMON_COVERAGE = new Set(["org", "name", "birth"]);

// 인라인 예시 미리보기용 — 회기 행 역할(순서대로 채움). 규칙 인식(영문 필드키)·수동 지정(한글 역할명) 둘 다 커버.
const ROW_PREVIEW = new Set([
  "date", "start", "end", "voucher", "extra", "amount", "result",
  "날짜", "시작", "종료", "바우처(분)", "추가구매", "금액", "결과", "비고", "회차",
]);
// 역할별 예시 값(ROW 역할은 배열). 양식이 이렇게 채워진다는 걸 화면에서 바로 보여주기 위함.
const SAMPLE: Record<string, string | string[]> = {
  org: "OO언어발달센터", name: "홍길동", birth: "2018-03-15",
  date: ["3/5", "3/12", "3/19", "3/26", "4/2"],
  start: ["10:00", "10:00", "10:00", "10:00", "10:00"],
  end: ["10:50", "10:50", "10:50", "10:50", "10:50"],
  voucher: ["40", "40", "40", "40", "40"],
  extra: ["10", "10", "10", "10", "10"],
  amount: ["65,000", "65,000", "65,000", "65,000", "65,000"],
  result: ["2어절 모방 산출 80%", "목표어 산출 증가", "이야기 다시말하기", "받침 발음 연습", "대화 차례 지키기"],
  기관명: "OO언어발달센터", 대상자이름: "홍길동", 대상자명: "홍길동", 치료사이름: "김치료",
  생년월일: "2018-03-15", 제공영역: "언어재활", 서비스종류: "언어재활",
  제공자: "OO언어발달센터", 제공자명: "OO언어발달센터", 담당: "김치료",
  연도: "2026", 월: "6", 학교: "OO초등학교", 학년: "3학년", 요일: "화·목", 정기시간: "10:00~10:50",
  치료목표: "2어절 문장 산출 향상", 현행수준: "1~2어절 수준 발화",
  종합의견: "목표 행동에 꾸준한 향상을 보이며 참여 태도가 적극적임. 가정 연계 지도 권장.",
  관리번호: "M-2026-0001", 단가: "65,000", 횟수: "5", 총금액: "325,000", 본인부담금: "0",
  주기: "주 1회", 제공일: "화·목", 작성일자: "2026-06-01", 전화: "02-000-0000",
  날짜: ["3/5", "3/12", "3/19", "3/26", "4/2"],
  시작: ["10:00", "10:00", "10:00", "10:00", "10:00"],
  종료: ["10:50", "10:50", "10:50", "10:50", "10:50"],
  "바우처(분)": ["40", "40", "40", "40", "40"],
  추가구매: ["10", "10", "10", "10", "10"],
  금액: ["65,000", "65,000", "65,000", "65,000", "65,000"],
  결과: ["2어절 모방 산출 80%", "목표어 산출 증가", "이야기 다시말하기", "받침 발음 연습", "대화 차례 지키기"],
  비고: ["적극 참여", "컨디션 양호", "피로감 호소", "특이사항 없음", "보호자 상담"],
  회차: ["1", "2", "3", "4", "5"],
};

export default function FormMapperClient({ hwpAutoConvert = false }: { hwpAutoConvert?: boolean }) {
  const betaUx = useBetaUx();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 발달바우처 양식 확인 경고(차단은 아니지만 사용자 확인 권유)
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  // AI 매핑은 보통 30~80초 걸려 — 멈춘 줄 오해 않도록 경과 초를 보여준다.
  const [aiElapsed, setAiElapsed] = useState(0);
  // AI 가 신뢰도 낮게(<0.6) 제안한 칸 — 사람이 꼭 확인하도록 표시. key="t,r,c"
  const [lowConf, setLowConf] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  // 저장된 양식(사용자별 다수) + 요금제별 종류당 상한
  const [saved, setSaved] = useState<Array<{ id: number; kind: string; name: string }>>([]);
  const [maxPerKind, setMaxPerKind] = useState<number>(5);
  const [planName, setPlanName] = useState<string>("");
  const [formName, setFormName] = useState("");
  const [kind, setKind] = useState<"record" | "schedule">("record");
  const [savingForm, setSavingForm] = useState(false);
  // 셀프 보정: 칸 클릭으로 역할 지정/해제. key="t,r,c" → 역할(빈문자열=해제)
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [picker, setPicker] = useState<{ t: number; r: number; c: number; text: string; x: number; y: number } | null>(null);
  const [mapPreview, setMapPreview] = useState(true);
  // 한글 .hwp 업로드 시 자동 변환(.hwp→.hwpx) 팝업 상태
  const [hwpConvert, setHwpConvert] = useState<{ name: string; status: "converting" | "error"; error?: string } | null>(null);

  // AI 매핑 동안 1초마다 경과 초 증가(끝나면 0으로 리셋).
  useEffect(() => {
    if (!aiLoading) { setAiElapsed(0); return; }
    const t = setInterval(() => setAiElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [aiLoading]);

  const loadSaved = useCallback(() => {
    fetch("/api/forms/saved").then((r) => (r.ok ? r.json() : { forms: [] })).then((d) => {
      setSaved(d.forms ?? []);
      if (typeof d.maxPerKind === "number") setMaxPerKind(d.maxPerKind);
      if (typeof d.planName === "string") setPlanName(d.planName);
    }).catch(() => {});
  }, []);
  useEffect(() => { loadSaved(); }, [loadSaved]);

  // 파일 선택 즉시 자동 분석(규칙 기반·무료·즉시). f 를 직접 받음 — setFile 은 비동기라 state 의존 X.
  async function analyze(f?: File) {
    const target = f ?? file;
    if (!target) return;
    setLoading(true); setError(null); setWarning(null); setResult(null); setOverrides({}); setLowConf(new Set()); setPicker(null);
    try {
      const fd = new FormData();
      fd.append("file", target);
      const r = await fetch("/api/forms/analyze", { method: "POST", body: fd });
      const d = await r.json() as AnalyzeResult & { error?: string };
      if (!r.ok) throw new Error(d.error || "분석 실패");
      setResult(d);
      // 슬롯에서 고른 kind 를 그대로 쓴다(자동 추정으로 덮어쓰지 않음).
      // 결합 양식(기록지+일정표 한 파일, 예: 성심)은 둘 다 있으니 경고 안 함 — 각 슬롯에 같은 파일을 올려 영역만 매핑.
      // 한쪽만 인식됐는데 슬롯과 반대면 그때만 "슬롯 확인" 경고.
      const hasRecord = !!(d.coverage && (d.coverage.date || d.coverage.result));
      const hasSchedule = (d.spec?.schedule?.length ?? 0) > 0;
      if (kind === "record" && !hasRecord && hasSchedule) {
        setWarning("이 양식은 ‘일정표’처럼 보여요. 지금 ‘기록지 양식’ 슬롯에 올리고 있어요 — 슬롯이 맞는지 확인하세요.");
      } else if (kind === "schedule" && !hasSchedule && hasRecord) {
        setWarning("이 양식은 ‘기록지’처럼 보여요. 지금 ‘일정표 양식’ 슬롯에 올리고 있어요 — 슬롯이 맞는지 확인하세요.");
      } else {
        setWarning(d.warning ?? null);
      }
      if (!formName) setFormName(target.name.replace(/\.hwpx$/i, ""));
      // 학습 캐시 적중(같은 구조 양식을 전에 매핑) → 그 매핑 자동 적용. 아니면 베타계정은 AI 자동.
      const cached = d.cached?.overrides;
      if (cached && Object.keys(cached).length) {
        const norm: Record<string, string> = {};
        for (const [key, role] of Object.entries(cached)) {
          const [t, rr, c] = key.split(",").map(Number);
          norm[trcKey(t, rr, c)] = role;
        }
        setOverrides(norm);
      } else if (betaUx) {
        await runAutoMap(d.grid, kind);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석 중 문제가 생겼어요.");
    } finally {
      setLoading(false);
    }
  }

  // 한글 .hwp 업로드 → 서버에서 .hwpx 로 자동 변환 후, 변환본을 그대로 분석 파이프라인에 투입.
  // (선생님이 .hwp/.hwpx 차이를 몰라도 평소 양식을 바로 올릴 수 있게.)
  async function convertHwp(f: File) {
    setError(null); setResult(null); setWarning(null); setFile(null);
    setHwpConvert({ name: f.name, status: "converting" });
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch("/api/forms/hwp-convert", { method: "POST", body: fd });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "변환에 실패했어요.");
      }
      const blob = await r.blob();
      const converted = new File([blob], f.name.replace(/\.hwp$/i, ".hwpx"), { type: "application/hwp+zip" });
      setHwpConvert(null);
      setFile(converted);
      void analyze(converted);
    } catch (e) {
      setHwpConvert({ name: f.name, status: "error", error: e instanceof Error ? e.message : "변환 중 문제가 생겼어요." });
    }
  }

  // AI 자동매핑 — 규칙 엔진이 못 잡은 칸까지 LLM 이 역할 제안(좌표 환각 차단·개인정보 마스킹은 서버에서).
  // 제안을 overrides 에 병합하고, 신뢰도<0.6 칸은 lowConf 로 표시(사람이 확인).
  async function runAutoMap(grid?: Cell[][], formTypeArg?: "record" | "schedule") {
    const g = grid ?? result?.grid;
    if (!g || !g.length) return;
    setAiLoading(true); setError(null);
    try {
      const r = await fetch("/api/forms/automap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grid: g, formType: formTypeArg ?? kind }),
      });
      const d = await r.json() as { suggestions?: Suggestion[]; error?: string };
      if (!r.ok) throw new Error(d.error || "AI 매핑 실패");
      const low = new Set<string>();
      setOverrides((prev) => {
        const next = { ...prev };
        for (const s of d.suggestions ?? []) {
          const key = trcKey(s.table, s.row, s.col);
          next[key] = s.role;
          if ((s.confidence ?? 1) < 0.6) low.add(key);
        }
        return next;
      });
      setLowConf(low);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI 매핑 중 문제가 생겼어요.");
    } finally {
      setAiLoading(false);
    }
  }

  async function downloadSample(trim = false) {
    if (!file) return;
    setDownloading(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (overridesArray.length) fd.append("overrides", JSON.stringify(overridesArray));
      const qs = new URLSearchParams({ kind });
      if (trim) qs.set("trim", "1");
      const r = await fetch(`/api/forms/sample?${qs}`, { method: "POST", body: fd });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || "샘플 생성 실패"); }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${file.name.replace(/\.hwpx$/i, "")}_샘플채움.hwpx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "샘플 생성 중 문제가 생겼어요.");
    } finally {
      setDownloading(false);
    }
  }

  async function saveForm() {
    if (!file || !formName.trim()) { setError("파일과 이름을 확인하세요."); return; }
    setSavingForm(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", formName.trim());
      fd.append("kind", kind);
      if (overridesArray.length) fd.append("overrides", JSON.stringify(overridesArray));
      const r = await fetch("/api/forms/saved", { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "저장 실패");
      setFormName("");
      loadSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 중 문제가 생겼어요.");
    } finally {
      setSavingForm(false);
    }
  }

  async function deleteForm(id: number, name?: string) {
    // 삭제는 되돌릴 수 없고, 분석→자동매핑→역할보정으로 만든 설정이 통째로 사라진다 — 반드시 확인.
    const label = name ? `'${name}' 양식` : "이 양식";
    if (!window.confirm(`${label}을(를) 삭제할까요?\n\n분석·자동매핑·역할보정으로 맞춰둔 설정이 함께 사라지고, 되돌릴 수 없어요.`)) return;
    try {
      const res = await fetch(`/api/forms/saved?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        alert("삭제하지 못했어요" + (e?.error ? `: ${e.error}` : ". 잠시 후 다시 시도해 주세요."));
        return;
      }
    } catch {
      alert("삭제 중 문제가 생겼어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
      return;
    }
    loadSaved();
  }

  // 슬롯 전환(기록지 ↔ 일정표) — 진행 중이던 업로드/분석을 초기화해 두 종류가 섞이지 않게 한다.
  function switchKind(k: "record" | "schedule") {
    if (k === kind) return;
    setKind(k);
    setFile(null); setResult(null); setError(null); setWarning(null);
    setOverrides({}); setLowConf(new Set()); setPicker(null); setFormName("");
  }

  // 셀프 보정 — 지정 가능 역할(양식 종류별). 같은 역할을 여러 칸에 지정 가능.
  // 기록지엔 발달바우처 전용 수동 역할(바우처분·추가구매·금액)을 더한다(AI 사전엔 없고 규칙엔진 담당).
  const SCALAR_ROLES = rolesForForm(kind).filter((r) => r.kind === "scalar").map((r) => r.role);
  const ROW_ROLES = kind === "record"
    ? [...rolesForForm("record").filter((r) => r.kind === "row").map((r) => r.role), "바우처(분)", "추가구매", "금액"]
    : rolesForForm(kind).filter((r) => r.kind === "row").map((r) => r.role);
  const effRole = (ti: number, cell: Cell): string | null => {
    const k = `${ti},${cell.r},${cell.c}`;
    return k in overrides ? (overrides[k] || null) : cell.role;
  };
  // 현재 슬롯(kind)에서 보일 역할만 — 통합 양식의 다른 영역 칸은 이 슬롯에서 숨겨 자기 영역만 매핑.
  const visRole = (ti: number, cell: Cell): string | null => {
    const r = effRole(ti, cell);
    return roleVisibleForKind(r, kind) ? r : null;
  };
  function assignRole(role: string) {
    if (!picker) return;
    const K = `${picker.t},${picker.r},${picker.c}`;
    setOverrides({ ...overrides, [K]: role }); // role "" = 해제. 중복제거 안 함(다중 허용)
    setPicker(null);
  }
  // 저장 시 칸의 채움 문단(p)을 함께 보낸다 — resolver가 grid 셀에 부여한 p를 되살려
  // 다문단 칸에서 엉뚱한 문단(p0)에 값이 채워지는 것을 막는다(서버 applyOverrides가 p를 사용).
  const cellP = new Map<string, number>();
  (result?.grid ?? []).forEach((cells, ti) =>
    cells.forEach((c) => cellP.set(`${ti},${c.r},${c.c}`, c.p ?? 0)));
  const overridesArray = Object.entries(overrides).map(([k, role]) => {
    const [t, r, c] = k.split(",").map(Number);
    return { table: t, row: r, col: c, p: cellP.get(k) ?? 0, role };
  });

  const recordForms = saved.filter((f) => f.kind === "record");
  const scheduleForms = saved.filter((f) => f.kind === "schedule");
  // 커버리지/누락 칸 — 일정표 슬롯에선 공통 칸(기관명·이름·생년월일)만 따진다(회기/결과는 기록지 영역).
  const coverageEntries = result
    ? Object.entries(result.coverage).filter(([k]) => kind === "record" || COMMON_COVERAGE.has(k))
    : [];
  const missing = coverageEntries.filter(([, v]) => !v).map(([k]) => FIELD_LABEL[k] ?? k);

  // 양식 점검 — 값이 들어갈(역할 지정된) 칸에 이미 작성 내용이 있으면 '빈 양식이 아님'. 경고만 표시(진행은 가능).
  const filledCells = result
    ? result.grid.flatMap((cells, ti) =>
        cells.flatMap((cell) => {
          // 이 슬롯(kind)에서 보이는 역할만 점검 — 다른 영역(통합 양식)의 작성값은 무시.
          const role = visRole(ti, cell);
          // 서명/확인란은 손서명용 — 플레이스홀더 글자가 있어도 '작성됨'으로 보지 않음.
          return role && role !== "서명" && isFilledValue(cell.text) ? [{ ti, r: cell.r, c: cell.c, role, text: cell.text.trim() }] : [];
        }),
      )
    : [];

  // 인라인 예시 미리보기 — 현재 지정된 역할에 SAMPLE 값을 채운 좌표맵(키 "t,r,c").
  // 회기 행(ROW) 역할은 표·행·열 순으로 정렬해 i번째 회기 예시를 순서대로 배정.
  function exampleFillMap(): Map<string, string> {
    const m = new Map<string, string>();
    if (!result) return m;
    const rowCells: Record<string, Array<{ ti: number; r: number; c: number }>> = {};
    result.grid.forEach((cells, ti) =>
      cells.forEach((cell) => {
        const role = visRole(ti, cell);
        if (!role) return;
        // 일정표 라벨은 '일정·관리번호'처럼 접두사로 인식됨 → 접두사 떼고 SAMPLE 조회(예시 미리보기 공백 방지).
        // '달력·*'(달력 칸)은 라벨 매핑이 아니라 자동 채움이므로 예시값에서 제외(접두사 유지 → 미매칭).
        const sr = role.replace(/^일정·/, "");
        if (ROW_PREVIEW.has(sr)) {
          (rowCells[sr] ??= []).push({ ti, r: cell.r, c: cell.c });
        } else {
          const ex = SAMPLE[sr];
          if (typeof ex === "string") m.set(trcKey(ti, cell.r, cell.c), ex);
        }
      }),
    );
    for (const role of Object.keys(rowCells)) {
      const list = Array.isArray(SAMPLE[role]) ? (SAMPLE[role] as string[]) : [];
      rowCells[role]
        .sort((a, b) => a.ti - b.ti || a.r - b.r || a.c - b.c)
        .forEach((cell, i) => {
          const v = list[i] ?? list[list.length - 1] ?? "";
          if (v) m.set(trcKey(cell.ti, cell.r, cell.c), v);
        });
    }
    return m;
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* 저장된 양식(기록지/일정표 각각 다수) */}
      <div className="card">
        <div className="card-body" style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>저장된 양식</h3>
            {planName && <span style={{ fontSize: 12, color: "var(--text-mute)" }}>현재 요금제: <b>{planName}</b></span>}
          </div>
          {/* 요금제별 저장 개수 안내 — 어디에도 표시가 없어 추가(센터마다 다른 양식 대비 여러 개 저장 가능) */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 12px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", fontSize: 12.5, color: "var(--text-soft)", lineHeight: 1.55 }}>
            <span style={{ fontSize: 14, lineHeight: 1.3 }}>ℹ️</span>
            <span>기록지·일정표 양식을 <b>종류별로 각각 {maxPerKind}개</b>까지 저장할 수 있어요(센터마다 양식이 다르면 여러 개 저장). 요금제별 한도 — <b>Solo 2개</b>·<b>Pro 5개</b>(무료체험·베타 5개).</span>
          </div>
          {(["record", "schedule"] as const).map((k) => {
            const list = k === "record" ? recordForms : scheduleForms;
            return (
              <div key={k}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-soft)", marginBottom: 4 }}>
                  {KIND_LABEL[k]} <span style={{ color: list.length >= maxPerKind ? "#8A2F1C" : "var(--text-mute)" }}>({list.length}/{maxPerKind})</span>
                </div>
                {list.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-mute)" }}>저장된 {KIND_LABEL[k]}가 없어요. 아래에서 양식을 올려 저장하세요. (센터마다 다르면 여러 개 저장)</p>
                ) : (
                  <div style={{ display: "grid", gap: 6 }}>
                    {list.map((f) => (
                      <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", padding: "8px 12px" }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{f.name}</span>
                        <button onClick={() => deleteForm(f.id, f.name)} style={{ background: "none", border: "none", fontSize: 12, color: "var(--danger, #8A2F1C)", cursor: "pointer" }}>삭제</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ display: "grid", gap: 14 }}>
          {/* 슬롯 선택 — 기록지 양식과 일정표 양식을 각각 따로 올린다(치료사가 헷갈리지 않게 먼저 고름) */}
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800 }}>어떤 양식을 넣을까요?</div>
            <div style={{ display: "flex", gap: 8 }}>
              {(["record", "schedule"] as const).map((k) => (
                <button key={k} type="button" onClick={() => switchKind(k)}
                  style={{
                    flex: 1, padding: "12px 10px", fontSize: 14.5, fontWeight: 800, borderRadius: 10, cursor: "pointer",
                    border: kind === k ? "2px solid var(--primary)" : "1px solid var(--border)",
                    background: kind === k ? "var(--primary-soft)" : "var(--surface)",
                    color: kind === k ? "var(--primary)" : "var(--text-soft)",
                  }}>
                  {k === "record" ? "📝 기록지 양식" : "📅 일정표 양식"}
                </button>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-mute)", lineHeight: 1.55 }}>
              기록지와 일정표는 <b>각각 따로</b> 올려서 저장해요. 지금은 <b>{KIND_LABEL[kind]} 양식</b>을 넣는 중이에요.
            </p>
          </div>
          {/* 항상 보이는 파일 형식 안내 — 선생님이 잘못된 파일로 헛걸음하지 않도록 */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 12px", borderRadius: 8, background: "var(--primary-soft)", border: "1px solid var(--primary)", fontSize: 12.5, color: "var(--primary)", lineHeight: 1.55 }}>
            <span style={{ fontSize: 15, lineHeight: 1.3 }}>📎</span>
            {hwpAutoConvert
              ? <span>한글 <b>.hwp · .hwpx</b> 양식을 올려주세요 — <b>.hwp는 올리면 자동으로 .hwpx로 변환</b>해 드려요. (PDF·스캔·이미지·사진은 안 돼요) 가능하면 <b>빈 양식</b>으로 올려주세요.</span>
              : <span><b>.hwpx 파일만</b> 인식해요 — 한글 <b>.hwp</b>·PDF·스캔·이미지·사진은 안 돼요. 한글에서 <b>“다른 이름으로 저장 → 한글 표준 문서(.hwpx)”</b>로 저장한 <b>빈 양식</b>을 올려주세요.</span>}
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            {/* 1단계: 파일 선택 → 즉시 자동 분석(별도 '분석' 버튼 없음) */}
            <label className="btn btn-primary" style={{ cursor: "pointer" }}>
              {loading ? "분석 중…" : file ? "다른 양식 선택" : `${KIND_LABEL[kind]} 양식 선택 (${hwpAutoConvert ? ".hwp·.hwpx" : ".hwpx"})`}
              <input type="file" accept={hwpAutoConvert ? ".hwp,.hwpx" : ".hwpx"} style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  e.target.value = ""; // 같은 파일 다시 고를 수 있게 초기화
                  if (f && /\.hwp$/i.test(f.name)) {
                    setFile(null); setResult(null); setWarning(null);
                    if (hwpAutoConvert) {
                      // (베타) 한글 .hwp → 거절하지 않고 .hwpx 로 자동 변환(팝업)
                      void convertHwp(f);
                    } else {
                      // 일반 계정 → 한글에서 .hwpx 로 저장하도록 단계별 안내
                      setError(`‘${f.name}’은(는) 한글 옛 형식(.hwp)이에요. 한글에서 이 파일을 연 뒤 ① [파일] → ② [다른 이름으로 저장] → ③ 파일 형식을 ‘한글 표준 문서 (*.hwpx)’로 선택해 저장하고, 그 .hwpx 파일을 올려주세요.`);
                    }
                    return;
                  }
                  if (f && !/\.hwpx$/i.test(f.name)) {
                    // .hwp 도 .hwpx 도 아닌 파일(PDF·이미지·스캔 등)은 즉시 거절
                    setFile(null); setResult(null); setWarning(null);
                    setError(`‘${f.name}’은(는) 한글 문서가 아니에요(.hwp·.hwpx만 됩니다). PDF·이미지·스캔본은 인식할 수 없어요.`);
                    return;
                  }
                  setFile(f); setResult(null); setError(null); setWarning(null);
                  if (f) void analyze(f);
                }} />
            </label>
            {file && <span style={{ fontSize: 13, color: "var(--text-soft)" }}>{file.name}</span>}
            {/* 2단계: (선택) AI 보완 매핑 */}
            {result && (
              <button className="btn" onClick={() => runAutoMap()} disabled={aiLoading || loading}
                title="규칙 자동인식이 놓친 칸까지 AI가 역할을 제안해요. 제안 후 칸을 클릭해 고칠 수 있어요.">
                {aiLoading ? `AI 매핑 중… ${aiElapsed}초` : "✨ AI로 칸 자동 매핑"}
              </button>
            )}
            {/* 3단계: 샘플로 확인 — 저장·출력과 동일하게 항상 5칸/5행으로 정리해 채워준다. */}
            {result && (
              <button className="btn" onClick={() => downloadSample(true)} disabled={downloading}
                title="회기 칸이 5개를 넘으면 5칸으로 정리해(저장·출력과 동일) 샘플을 채워줍니다.">
                {downloading ? "생성 중…" : "샘플로 확인 (.hwpx)"}
              </button>
            )}
            {result && ((result.spec?.extraSessionCols?.length ?? 0) > 0 || (result.spec?.extraResultRows?.length ?? 0) > 0) && (
              <span style={{ fontSize: 12, color: "var(--text-mute)" }}>
                회기·결과 칸을 <b>5칸으로 정리</b>해서 채워요{(result.spec?.extraSessionCols?.length ?? 0) > 0 ? ` (회기 ${result.spec?.extraSessionCols?.length}칸↓)` : ""}{(result.spec?.extraResultRows?.length ?? 0) > 0 ? ` (결과 ${result.spec?.extraResultRows?.length}행↓)` : ""}
              </span>
            )}
          </div>
          {aiLoading && (
            <div role="status" aria-live="polite" style={{
              display: "grid", gap: 8, padding: "12px 14px", borderRadius: 10,
              background: "var(--primary-soft)", border: "1px solid var(--primary)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 700, color: "var(--primary)" }}>
                <span className="ai-spin" style={{
                  width: 14, height: 14, borderRadius: "50%", display: "inline-block",
                  border: "2px solid currentColor", borderTopColor: "transparent",
                }} />
                ✨ AI가 양식 칸을 분석하고 있어요
                <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums", color: "var(--text-soft)", fontWeight: 600 }}>
                  {aiElapsed}초 경과
                </span>
              </div>
              {/* 정확한 진행률은 알 수 없어 — 예상 60초 기준으로 95%까지 서서히 차오르는 표시 */}
              <div style={{ height: 6, borderRadius: 999, background: "rgba(0,0,0,0.08)", overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${Math.min(95, Math.round((aiElapsed / 60) * 95))}%`,
                  background: "var(--primary)", borderRadius: 999, transition: "width 1s linear",
                }} />
              </div>
              <div style={{ fontSize: 12, color: "var(--text-soft)" }}>
                보통 30~80초 걸려요. 창을 닫지 말고 잠시만 기다려 주세요{aiElapsed >= 90 ? " — 양식이 커서 조금 더 걸리고 있어요." : "."}
              </div>
            </div>
          )}
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-mute)", lineHeight: 1.6 }}>
            <b>① 양식 선택</b>하면 바로 자동 인식해요(편집 가능한 <b>.hwpx</b> 빈 양식만 · .hwp·스캔·PDF 미지원).
            {betaUx
              ? <> <b>② AI가 자동으로 칸을 매핑</b>해요(30~80초). 결과가 안 맞으면 <b>✨ AI로 칸 자동 매핑</b>으로 다시 실행하고, <b>③ 샘플로 확인</b> 후 저장하세요.</>
              : <> 놓친 칸이 있으면 <b>② ✨ AI로 칸 자동 매핑</b>(30~80초)으로 채우고, <b>③ 샘플로 확인</b> 후 저장하세요.</>}
          </p>
        </div>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: 10, fontSize: 13.5, lineHeight: 1.6, background: "#F6E4DE", color: "#8A2F1C", border: "1px solid #E6C3B8" }}>
          {error}
        </div>
      )}
      {warning && !error && (
        <div style={{ padding: "10px 14px", borderRadius: 10, fontSize: 13.5, lineHeight: 1.6, background: "#FBF3DD", color: "#8A6422", border: "1px solid #E8D9A8" }}>
          ⚠ {warning}
        </div>
      )}

      {result && (
        <>
          <div className="card">
            <div className="card-body" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>이 양식 저장:</span>
              <span className="badge" style={{ fontSize: 13, fontWeight: 800, padding: "6px 12px", borderColor: "transparent", background: "var(--primary-soft)", color: "var(--primary)" }}>
                {kind === "record" ? "📝 기록지" : "📅 일정표"} 양식
              </span>
              <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder={`양식 이름 (예: A센터 ${KIND_LABEL[kind]})`}
                style={{ flex: 1, minWidth: 180, padding: "8px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 14, color: "var(--text)" }} />
              {(() => {
                const used = (kind === "record" ? recordForms : scheduleForms).length;
                const atLimit = used >= maxPerKind;
                return (
                  <button className="btn btn-primary" onClick={saveForm} disabled={savingForm || !formName.trim() || atLimit}
                    title={atLimit ? `${KIND_LABEL[kind]} 양식은 ${maxPerKind}개까지 저장할 수 있어요. 기존 양식을 삭제 후 저장하세요.` : undefined}>
                    {savingForm ? "저장 중…" : atLimit ? `저장 (한도 ${used}/${maxPerKind})` : "저장"}
                  </button>
                );
              })()}
            </div>
            {(kind === "record" ? recordForms : scheduleForms).length >= maxPerKind && (
              <p style={{ margin: "8px 16px 0", fontSize: 12.5, color: "#8A2F1C", lineHeight: 1.55 }}>
                {KIND_LABEL[kind]} 양식이 한도({maxPerKind}개)에 찼어요. 기존 양식을 삭제하면 새로 저장할 수 있어요{planName.includes("Solo") ? " (Pro로 올리면 5개까지)" : ""}.
              </p>
            )}
          </div>

          <div className="card">
            <div className="card-body" style={{ display: "grid", gap: 10 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>인식 결과</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {coverageEntries.map(([k, ok]) => (
                  <span key={k} className="badge" style={{
                    fontSize: 12, padding: "4px 10px", borderColor: "transparent",
                    background: ok ? "#DDEBD3" : "#F6E4DE", color: ok ? "#3F6132" : "#8A2F1C",
                  }}>
                    {ok ? "✓" : "✗"} {FIELD_LABEL[k] ?? k}
                  </span>
                ))}
              </div>
              {result.spec?.detail && result.spec.detail.length > 0 && (
                <p style={{ margin: 0, fontSize: 13, color: "var(--primary)" }}>＋ 별지(상세 결과표) {result.spec.detail.length}회분 인식</p>
              )}
              {result.spec?.schedule && result.spec.schedule.length > 0 && (
                <p style={{ margin: 0, fontSize: 13, color: "var(--primary)" }}>
                  ＋ 일정표 라벨 칸 {result.spec.schedule.length}개 인식 ({result.spec.schedule.map((s) => s.role).join(", ")})
                </p>
              )}
              {missing.length > 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: "#8A6422" }}>
                  ⚠ 못 찾은 칸: {missing.join(", ")} — 이 양식은 자동 인식이 일부 안 됐어요. 샘플로 확인 후 보정이 필요합니다.
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: "var(--primary)" }}>
                  ✓ 핵심 칸을 모두 인식했어요. 샘플로 채워 받아 실제로 맞는지 확인하세요.
                </p>
              )}
              {filledCells.length > 0 && (
                <p style={{ margin: 0, fontSize: 13, color: "#8A6422", lineHeight: 1.55 }}>
                  ⚠ 값이 들어갈 칸 {filledCells.length}곳에 <b>이미 내용</b>이 적혀 있어요(빈 양식이 아닐 수 있어요) —{" "}
                  {filledCells.slice(0, 4).map((f, i) => (
                    <span key={i}>{i > 0 ? ", " : ""}<b>{f.role}</b>=&ldquo;{f.text.length > 12 ? f.text.slice(0, 12) + "…" : f.text}&rdquo;</span>
                  ))}
                  {filledCells.length > 4 ? ` 외 ${filledCells.length - 4}곳` : ""}. 출력물에 옛 내용이 남을 수 있으니 <b>빈 양식</b> 사용을 권해요(이대로 진행도 가능).
                </p>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-body" style={{ display: "grid", gap: 12, overflowX: "auto" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-mute)", flex: 1, minWidth: 220 }}>
                  양식 표 미리보기 — <span style={{ background: "var(--primary-soft)", color: "var(--primary)", padding: "1px 6px", borderRadius: 4, fontWeight: 700 }}>색칠된 칸</span>이 자동 인식된 입력 위치예요. <b>칸을 클릭</b>하면 그 자리에서 역할을 고칠 수 있어요. <b>✨ AI로 칸 자동 매핑</b>으로 규칙이 놓친 칸까지 채울 수 있어요(센터·지자체마다 다른 양식 대응).
                </p>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-soft)", cursor: "pointer", whiteSpace: "nowrap" }}>
                  <input type="checkbox" checked={mapPreview} onChange={(e) => setMapPreview(e.target.checked)} />
                  예시로 채워서 미리보기
                </label>
              </div>
              {lowConf.size > 0 && (
                <p style={{ margin: 0, fontSize: 12.5, color: "#8A6422" }}>
                  ⚠ AI 신뢰도 낮은 칸 {lowConf.size}개(테두리 주황) — 꼭 클릭해서 맞는지 확인하세요.
                </p>
              )}
              {(() => {
                const fm = mapPreview ? exampleFillMap() : null;
                return (
                  <div style={{ display: "grid", gridTemplateColumns: mapPreview ? "1fr 1fr" : "1fr", gap: 14, alignItems: "start" }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text-soft)", marginBottom: 6 }}>
                        ✏️ 칸 매핑 <span style={{ fontWeight: 400, color: "var(--text-mute)" }}>— 칸 클릭해 역할 지정</span>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
                        {result.grid.map((cells, ti) => (
                          <div key={ti} style={{ flex: "0 1 auto", maxWidth: "100%" }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-soft)", marginBottom: 4 }}>표 {ti + 1}</div>
                            <TableView
                              cells={cells}
                              roleOf={(cell) => visRole(ti, cell)}
                              lowOf={(cell) => lowConf.has(trcKey(ti, cell.r, cell.c)) && roleVisibleForKind(effRole(ti, cell), kind)}
                              filledOf={(cell) => { const r = visRole(ti, cell); return !!r && r !== "서명" && isFilledValue(cell.text); }}
                              onCell={(r, c, text, x, y) => setPicker({ t: ti, r, c, text, x, y })}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                    {mapPreview && fm && (
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--primary)", marginBottom: 6 }}>
                          👁 예시 미리보기 <span style={{ fontWeight: 400, color: "var(--text-mute)" }}>— 지정한 역할이 이렇게 채워져요</span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
                          {result.grid.map((cells, ti) => (
                            <div key={ti} style={{ flex: "0 1 auto", maxWidth: "100%" }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-soft)", marginBottom: 4 }}>표 {ti + 1}</div>
                              <PreviewTable cells={cells} valOf={(cell) => fm.get(trcKey(ti, cell.r, cell.c)) ?? ""} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </>
      )}

      {/* 칸 클릭 시 그 자리에 뜨는 역할 선택 팝오버 */}
      {picker && (() => {
        const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
        const vh = typeof window !== "undefined" ? window.innerHeight : 800;
        const M = 8, GAP = 6; // 화면 가장자리 여백 / 클릭 지점과의 간격
        // 클릭 지점 위·아래 가용 공간을 재서 더 넓은 쪽으로 펼치고, 그 공간만큼만 높이를 잡는다
        // (넘치면 내부 스크롤). 이러면 박스가 화면 밖으로 내려가 '역할 비우기'가 잘리지 않는다.
        const spaceBelow = vh - picker.y - GAP - M;
        const spaceAbove = picker.y - GAP - M;
        const below = spaceBelow >= spaceAbove;
        const maxH = Math.min(below ? spaceBelow : spaceAbove, Math.round(vh * 0.85));
        const left = Math.max(M, Math.min(picker.x + GAP, vw - 240 - M));
        const vpos: React.CSSProperties = below
          ? { top: picker.y + GAP }
          : { bottom: vh - picker.y + GAP };
        return (
        <>
          <div onClick={() => setPicker(null)} style={{ position: "fixed", inset: 0, zIndex: 50 }} />
          <div style={{
            position: "fixed", zIndex: 51, left, ...vpos,
            width: 240, maxHeight: maxH, overflowY: "auto",
            background: "var(--surface)", border: "1px solid var(--primary)",
            borderRadius: 10, boxShadow: "0 6px 20px rgba(0,0,0,0.18)", padding: 10, display: "grid", gap: 8,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-soft)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              “{picker.text || "(빈칸)"}” 역할 지정
            </div>
            <div style={{ fontSize: 11, color: "var(--text-mute)" }}>기본</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SCALAR_ROLES.map((role) => (
                <button key={role} className="btn btn-sm" onClick={() => assignRole(role)}>{role}</button>
              ))}
            </div>
            {ROW_ROLES.length > 0 && (
              <>
                <div style={{ fontSize: 11, color: "var(--text-mute)" }}>회기 행 (칸마다 i번째 회기로 채움)</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {ROW_ROLES.map((role) => (
                    <button key={role} className="btn btn-sm" onClick={() => assignRole(role)}>{role}</button>
                  ))}
                </div>
              </>
            )}
            <div style={{ position: "sticky", bottom: -10, marginBottom: -10, background: "var(--surface)", display: "flex", gap: 6, borderTop: "1px solid var(--border)", padding: "8px 0 10px" }}>
              <button className="btn btn-sm" onClick={() => assignRole("")} style={{ color: "#8A2F1C" }}>역할 비우기</button>
              <button className="btn btn-sm" onClick={() => setPicker(null)}>취소</button>
            </div>
          </div>
        </>
        );
      })()}

      {/* 한글 .hwp 자동 변환 팝업 */}
      {hwpConvert && (
        <div
          onClick={() => hwpConvert.status === "error" && setHwpConvert(null)}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "22px 24px", maxWidth: 420, width: "100%", boxShadow: "0 10px 30px rgba(0,0,0,0.2)", display: "grid", gap: 14 }}>
            {hwpConvert.status === "converting" ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, fontWeight: 800 }}>
                  <span className="ai-spin" style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid var(--primary)", borderTopColor: "transparent", display: "inline-block" }} />
                  한글 파일(.hwp) 변환 중…
                </div>
                <div style={{ fontSize: 13, color: "var(--text-soft)", lineHeight: 1.6 }}>
                  <b>{hwpConvert.name}</b> 을(를) <b>.hwpx</b> 로 자동 변환하고 있어요. 잠시만요(보통 1~2초). 변환되면 바로 칸을 인식해 드려요.
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#8A2F1C" }}>변환하지 못했어요</div>
                <div style={{ fontSize: 13, color: "var(--text-soft)", lineHeight: 1.6 }}>{hwpConvert.error}</div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button className="btn btn-sm" onClick={() => setHwpConvert(null)}>닫기</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TableView({ cells, roleOf, lowOf, filledOf, onCell }: {
  cells: Cell[];
  roleOf: (cell: Cell) => string | null;
  lowOf?: (cell: Cell) => boolean;
  filledOf?: (cell: Cell) => boolean;
  onCell: (r: number, c: number, text: string, x: number, y: number) => void;
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
        const role = roleOf(cell);
        const hl = !!role;
        const low = hl && !!lowOf?.(cell);
        const filled = hl && !!filledOf?.(cell); // 값 칸인데 이미 작성됨 — 빈 양식 아님(경고)
        tds.push(
          <td key={c} colSpan={cell.cs} rowSpan={cell.rs}
            onClick={(e) => onCell(cell.r, cell.c, cell.text, e.clientX, e.clientY)}
            title={filled ? "이 칸엔 값이 들어가는데 이미 내용이 적혀 있어요 — 빈 양식을 권해요" : low ? "AI 신뢰도 낮음 — 클릭해서 확인/수정" : "클릭해서 역할 지정/해제"}
            style={{
              border: low ? "2px solid #D98324" : "1px solid var(--border)", padding: "3px 5px", fontSize: 11, verticalAlign: "top",
              background: filled ? "#FBEFD6" : hl ? "var(--primary-soft)" : "var(--surface)",
              minWidth: 40, maxWidth: 160, cursor: "pointer",
            }}>
            {hl && (
              <div style={{ fontSize: 9, fontWeight: 800, color: filled || low ? "#8A6422" : "var(--primary)", marginBottom: 1 }}>{filled ? "⚠ " : low ? "⚠ " : ""}{role}{filled ? " · 작성됨" : ""}</div>
            )}
            <div style={{ color: filled ? "#8A6422" : cell.text ? "var(--text)" : "var(--text-mute)", fontWeight: filled ? 700 : 400, whiteSpace: "normal", wordBreak: "break-all" }}>
              {cell.text || (hl ? "" : "·")}
            </div>
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

// 예시 미리보기 표 — 역할 지정 칸은 예시값(굵게·강조 배경), 나머지는 원본 텍스트(흐리게).
function PreviewTable({ cells, valOf }: { cells: Cell[]; valOf: (cell: Cell) => string }) {
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
        const v = valOf(cell);
        tds.push(
          <td key={c} colSpan={cell.cs} rowSpan={cell.rs}
            style={{
              border: "1px solid var(--border)", padding: "3px 5px", fontSize: 11, verticalAlign: "top",
              background: v ? "var(--primary-soft)" : "var(--surface)", minWidth: 40, maxWidth: 160,
            }}>
            <div style={{ color: v ? "var(--text)" : "var(--text-mute)", fontWeight: v ? 700 : 400, whiteSpace: "normal", wordBreak: "break-all" }}>
              {v || cell.text || "·"}
            </div>
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
