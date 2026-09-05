"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as XLSX from "xlsx";
import { minusMin } from "@/lib/constants";
import {
  SAVE_CONFLICT_STATUS, baseField, stampFromLoaded, stampFromSaveResponse,
  type SaveBase,
} from "@/lib/save-conflict";
import { useBetaUx } from "../BetaUxContext";

type RecordSessionData = {
  ordinal: number;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  voucher?: string | null;
  extra?: string | null;
  amount?: string | null;
  result?: string | null;
  resultExtra?: string | null;
  retroReason?: string | null;
  status?: string | null;
  apprNumber?: string | null;
  // 시작·종료시간을 임상가가 직접 고쳤는지(출처 표식). true 면 재시드가 못 덮는다.
  timeFixed?: boolean | null;
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

// 자동시작(=grouped 통째 교체)을 막을지 판단하는 단일 기준.
// 화면에 몇 명이 떠 있느냐가 아니라 "엑셀에서 온 데이터냐"가 본질 — 승인번호는 엑셀에만 있다.
// 아동 1명짜리 엑셀도 지켜야 하므로 개수로 세면 안 된다.
function hasExcelData(g: Grouped): boolean {
  return Object.values(g).some((rows) => rows.some((r) => r.appr));
}

// 그 아동의 탭 찾기 — 엑셀 라벨은 이름만, 앱 라벨은 "이름 · 서비스종류" 라 형식이 다를 수 있다.
function findTab(g: Grouped, cs: { name: string; serviceType: string; hasMultipleServices?: boolean }): string | null {
  const exact = cs.hasMultipleServices ? `${cs.name} · ${cs.serviceType}` : cs.name;
  if (g[exact]) return exact;
  return Object.keys(g).find((k) => k === cs.name || k.startsWith(`${cs.name} · `)) ?? null;
}

function parseYMD(s: string): { y: number; mo: number; d: number } | null {
  const m = String(s).match(/(\d{4})[.\-\/]\s*(\d{1,2})[.\-\/]\s*(\d{1,2})/);
  return m ? { y: +m[1], mo: +m[2], d: +m[3] } : null;
}

// 일정표 예정일 ↔ 회기(확정 제공일)를 "같은 일자" 기준으로 우선 매칭. 같은 날짜가 있으면
// 그 회기에 고정하고, 남은 예정일만 짝 없는 회기에 순서대로 붙인다. 회차가 통째로 밀리지 않는다.
// (예정 1·6·8·13·15 / 실제 1·6·8·15·20 → 15 는 15 에 그대로 붙고, 남은 13 이 20 일 회기로.
//  = "13일에 하기로 한 걸 20일에 했다" 한 건만 어긋난 것으로 잡힘)
function pairScheduleDays(
  scheduleDays: (number | null)[],
  rowFixedDays: (number | null)[]
): (number | null)[] {
  const schedSet = new Set<number>();
  for (const d of scheduleDays) if (d != null) schedSet.add(d);
  const usedSched = new Set<number>();
  const result: (number | null)[] = rowFixedDays.map((pd) => {
    // 예정일 하나는 회기 하나에만 붙는다. (하루 두 번 수업처럼 같은 날짜가 두 회기에
    // 걸리면 앞 회기만 일치로 보고, 뒤 회기는 남은 예정일과 짝지어 사유를 받게 한다)
    if (pd != null && schedSet.has(pd) && !usedSched.has(pd)) {
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

// 임상가가 직접 고친 시간 칸 — '노란 칸 = 직접 수정 가능' 규약은 그대로 두고(배경 유지),
// 테두리와 아래 글자 표시로 '이 값은 확정'을 알린다(색만으로 상태를 전달하지 않는다).
const FIXED_TIME_INPUT: CSSProperties = {
  background: "#FFF3D4",
  boxShadow: "inset 0 0 0 2px var(--primary)",
  fontWeight: 700,
};
const FIXED_TIME_TAG: CSSProperties = {
  fontSize: 10.5, fontWeight: 700, color: "var(--primary)",
  background: "var(--surface-2)", border: "1px solid var(--border)",
  borderRadius: 999, padding: "1px 6px", whiteSpace: "nowrap",
  display: "inline-block", marginTop: 3,
};

// 생년월일 비교 키 — 엑셀 "19.08.31" 과 DB "2019-08-31" 을 같은 사람으로 본다(끝 6자리 YYMMDD).
function birthKey(v: unknown): string {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length >= 6 ? d.slice(-6) : "";
}
function birthLabel(v: unknown): string {
  const k = birthKey(v);
  return k ? `${k.slice(0, 2)}.${k.slice(2, 4)}.${k.slice(4, 6)}` : "";
}
// 화면 탭 라벨 — 평소엔 이름만, 같은 이름의 다른 아동이 있을 때만 생년월일을 덧붙여 구분한다.
function childLabel(name: string, birth: unknown, needBirth: boolean): string {
  const b = birthLabel(birth);
  return needBirth && b ? `${name} (${b})` : name;
}

// 엑셀 업로드 병합 계획 — 기존 목록(prev)에 이번 파일(incoming)을 붙일 때의 탭 라벨을 정한다.
// 순수 함수(부수효과 없음) — setState 업데이터 안에서 계산하면 StrictMode·배치에서 두 번 돌거나
// 결과를 곧바로 읽지 못한다.
function planMerge(
  prev: Grouped,
  incoming: Array<{ name: string; bkey: string; rows: SessionRow[] }>,
): { next: Grouped; labelByKey: Map<string, string> } {
  const next: Grouped = { ...prev };
  const labelByKey = new Map<string, string>();
  // 이번 파일 안에 같은 이름이 둘 이상이면 그 이름은 전원 생년월일 라벨로 구분한다.
  const birthsByName = new Map<string, Set<string>>();
  for (const e of incoming) {
    const s = birthsByName.get(e.name) ?? new Set<string>();
    s.add(e.bkey);
    birthsByName.set(e.name, s);
  }
  for (const e of incoming) {
    let needBirth = (birthsByName.get(e.name)?.size ?? 1) > 1;
    // 이미 목록에 있는 같은 이름·다른 생년월일 아동도 함께 구분 라벨로 바꾼다(합쳐지면 안 된다).
    for (const [lab, rws] of Object.entries(next)) {
      const r0 = rws[0];
      if (!r0 || r0.name !== e.name || birthKey(r0.birth) === e.bkey) continue;
      needBirth = true;
      const other = childLabel(r0.name, r0.birth, true);
      if (other !== lab && !next[other]) { next[other] = rws; delete next[lab]; }
    }
    const label = childLabel(e.name, e.rows[0]?.birth ?? "", needBirth);
    labelByKey.set(`${e.name}|${e.bkey}`, label);
    next[label] = e.rows;
  }
  return { next, labelByKey };
}

// 회기 식별자 — 시간 잠금(timeFixed)과 회기 자리바꿈 정렬이 공통으로 쓰는 키.
// ⚠ 반드시 rows(엑셀·일정표에서 온 입력)에서만 만든다. 화면에서 고칠 수 있는 dates 를 섞으면
//   제공일자를 고치는 순간 키가 바뀌어 잠금이 대상을 잃거나(표식 소멸) 남의 회기에 붙는다
//   — "하루 두 번 결제면 제공일자 칸에서 고치세요" 안내를 따랐을 뿐인데 결제시간이 안 붙던 사고.
//   rows[i].use 와 appr 은 그 작업본이 바뀌기 전까지 불변이라 안전하다.
// 한 회기가 여러 별칭을 갖는다(승인번호 + 이용일자) — 일정표 초안(승인번호 없음)에서 잠근 뒤
// 엑셀이 붙어 승인번호가 생겨도 이용일자 별칭으로 이어진다.
// 같은 값이 두 번 나오면 #1, #2 … 로 갈라 서로 다른 회기가 같은 키를 갖지 않게 한다.
function rowIdentities(list: SessionRow[]): string[][] {
  const seen = new Map<string, number>();
  const uniq = (k: string) => {
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    return n === 0 ? k : `${k}#${n}`;
  };
  return list.map((r, i) => {
    const ids: string[] = [];
    if (r.appr) ids.push(uniq(`a:${r.appr}`));
    const p = parseYMD(r.use);
    if (p) ids.push(uniq(`u:${p.y}-${p.mo}-${p.d}`));
    if (ids.length === 0) ids.push(`o:${i + 1}`); // 이용일자도 승인번호도 없는 빈 칸
    return ids;
  });
}

// 이 작업본이 '몇 년 몇 월 기록지인가' — 첫 회기(연·월·일로 정렬된 맨 앞) 기준.
// 엑셀은 그 달 것만 나오고 일정표도 한 달치라 회기는 모두 같은 달이다.
// (전제가 깨져 여러 달이 섞이면 업로드 화면에서 경고를 띄운다)
function sheetPeriod(rows: SessionRow[]): { y: number; mo: number } | null {
  const p = rows.map((r) => parseYMD(r.use)).find(Boolean);
  return p ? { y: p.y, mo: p.mo } : null;
}

// RecordSheet 리마운트 key — 아동 + 회기 수 + 연·월.
// 이 넷 중 하나라도 바뀌면 내부 상태(시간·잠금·제공일자·일정표·소급사유 등)를 새로 시드해야 한다.
// (임상 서술 = 결과·이용자 상태·종합의견만 부모가 아동별로 이월해 다시 넣어준다)
function sheetKey(child: string, rows: SessionRow[]): string {
  const p = sheetPeriod(rows);
  return `${child}:${rows.length}:${p ? `${p.y}-${p.mo}` : "?"}`;
}

// 시각 문자열 정규화 — "9:40" → "09:40", "16:00:00" → "16:00", 그 외/빈값 → "".
// 엑셀 결제시간·일정표 시간·저장본 시간의 표기가 서로 달라도 같은 잣대로 비교·시드하기 위함.
function hm(v: unknown): string {
  const m = String(v ?? "").trim().match(/^(\d{1,2}):(\d{2})/);
  return m ? pad(Number(m[1])) + ":" + m[2] : "";
}

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

// 자동저장 실패 배너가 들어갈 최상위 자리(포털 대상)의 id.
// 배너 자체는 RecordSheet 안에서 만들어지지만, RecordSheet 는 카드(.card) 안에 있고
// 모바일에서 `.card { overflow-x: auto }`(globals.css) 때문에 그 안의 sticky 는 죽는다.
// 그래서 DOM 위치만 이 자리로 옮겨(포털) 화면 위에 고정한다 — 내용·동작은 그대로.
const SAVE_ALERT_SLOT = "record-save-alert-slot";

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
  // 한 아동의 회기가 여러 달에 걸친 파일(소급결제 등) — 어느 달 기록지로 잡혔는지 알린다.
  const [mixedMonthChildren, setMixedMonthChildren] = useState<string[]>([]);
  const [error, setError] = useState("");

  // ─── 직접 시작 (엑셀 없이) ────────────────────────────────────────────
  const monthOptions = useMemo(buildMonthOptions, []);
  const [manualCSId, setManualCSId] = useState<number | "">("");
  const [manualYm, setManualYm] = useState(monthOptions.find((o) => o.label.includes("이번 달"))?.value ?? monthOptions[0].value);
  const [manualLoading, setManualLoading] = useState(false);

  const [grouped, setGrouped] = useState<Grouped>({});
  const [curChild, setCurChild] = useState<string | null>(null);
  // 두 탭 충돌에서 '최신 내용 불러오기'를 고르면 올라간다 → RecordSheet key 가 바뀌어 리마운트.
  const [sheetReloadNonce, setSheetReloadNonce] = useState(0);
  // 현재 직접시작 아동의 일정표 회기 수 — 기록지 회기 수와 다르면 '다시 불러오기' 안내(일정표를 나중에 수정한 경우).
  const [schedCount, setSchedCount] = useState<number | null>(null);

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

  // 직접시작(단일 아동) 기록지의 일정표 회기 수를 불러와 기록지 회기 수와 비교.
  // (엑셀 다중아동 등은 비교하지 않음 — Object.keys(grouped).length===1 일 때만)
  useEffect(() => {
    const single = Object.keys(grouped).length === 1;
    if (typeof manualCSId !== "number" || !manualYm || !curChild || !single) { setSchedCount(null); return; }
    const cs = myServices.find((s) => s.id === manualCSId);
    const tag = cs ? (cs.hasMultipleServices ? `${cs.name} · ${cs.serviceType}` : cs.name) : null;
    if (!cs || tag !== curChild) { setSchedCount(null); return; }
    const [y, m] = manualYm.split("-").map(Number);
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/schedule/load?childServiceId=${manualCSId}&year=${y}&month=${m}`);
        if (!r.ok || cancelled) { if (!cancelled) setSchedCount(null); return; }
        const d = await r.json();
        const n = Array.isArray(d?.sessions) ? d.sessions.length : 0;
        if (!cancelled) setSchedCount(n > 0 ? n : null);
      } catch { if (!cancelled) setSchedCount(null); }
    })();
    return () => { cancelled = true; };
  }, [manualCSId, manualYm, curChild, grouped, myServices]);

  // 일정표/대시보드에서 ?cs=&ym= 로 넘어오면 해당 아동·월로 자동 작성 시작
  const searchParams = useSearchParams();
  const [autoStarted, setAutoStarted] = useState(false);
  useEffect(() => {
    if (!hydrated || autoStarted) return;
    const csParam = searchParams.get("cs");
    const ymParam = searchParams.get("ym");
    if (!csParam || !ymParam) return;
    const csId = Number(csParam);
    const cs = myServices.find((s) => s.id === csId);
    if (cs && monthOptions.some((o) => o.value === ymParam)) {
      setManualCSId(csId);
      setManualYm(ymParam);
      setAutoStarted(true);
      // 소비한 파라미터는 지운다 — 안 지우면 이 URL 에서 F5 만 눌러도 자동시작이 다시 돈다.
      try { window.history.replaceState({}, "", "/record"); } catch {}
      // 엑셀로 불러온 화면은 갈아끼우지 않는다(startManual 은 grouped 통째 교체) — 아동이 1명이어도.
      // 그 아동 탭이 있으면 이동만 한다.
      if (hasExcelData(grouped)) {
        const tab = findTab(grouped, cs);
        if (tab) setCurChild(tab);
      } else {
        void startManual(csId, ymParam);
      }
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
          // 시간 시드는 '결제시간'(예 "16:49:22") 하나만 쓴다. 실측(samples 3개·64행)에서
          // 서비스시작시간 == 서비스종료시간 이고 결제시간보다 1분쯤 일러 22건이 어긋났다.
          // 두 번째 시간 출처를 남겨두면 "왜 시간이 1분 다르지?"가 다시 살아나므로 대체 경로를 두지 않는다.
          payTime: col("결제시간"),
          pay: col("결제일자"),
          appr: col("승인번호"), amt: col("결제금액"), org: col("제공기관명"),
          kind: col("결제구분"),
        };
        if (ci.payTime < 0) {
          setError("'결제시간' 칸을 찾지 못했어요. 올바른 서비스제공내역 파일인지 확인해주세요.");
          return;
        }

        type Entry = { name: string; bkey: string; rows: SessionRow[] };
        const byKey = new Map<string, Entry>(); // key = 이름 + 생년월일 (동명이인 분리)
        let retroCount = 0;
        const retroByKey: Record<string, number> = {};
        for (let i = hi + 1; i < rows.length; i++) {
          const row = rows[i] as string[] | undefined;
          if (!row || !row[ci.name]) continue;
          const nm = String(row[ci.name]).trim();
          if (!nm) continue;
          const payKind = ci.kind >= 0 ? String(row[ci.kind] || "").trim() : "";
          // 과오반납·과오환수·취소 등 정정 항목은 실제 수업 회기가 아니므로 제외.
          // (이걸 회기로 세면 수업 횟수가 5회를 넘겨 기록지가 2장으로 늘어남)
          if (/과오|반납|환수|취소/.test(payKind)) continue;
          const birth = String(row[ci.birth] || "");
          const key = `${nm}|${birthKey(birth)}`;
          if (payKind.includes("소급")) {
            retroCount += 1;
            retroByKey[key] = (retroByKey[key] ?? 0) + 1;
          }
          // 결제시간 "16:49:22" → "16:49"(초 버림). 빈 칸이면 비워 두고 임상가가 입력한다
          // (서비스종료시간으로 대체하지 않는다).
          const e = byKey.get(key) ?? { name: nm, bkey: birthKey(birth), rows: [] };
          e.rows.push({
            name: nm,
            birth,
            use: String(row[ci.use] || ""),
            end: hm(row[ci.payTime]),
            pay: String(row[ci.pay] || ""),
            appr: String(row[ci.appr] || ""),
            // 엑셀 '결제금액'(=바우처 지원금 부분, 예 46,200)을 기록지 '총이용금액'에 넣지 않는다.
            // 총이용금액은 회당 단가(예 60,000)가 기본 — amt 를 비워 두면 RecordSheet 가 단가로 시드한다.
            amt: "",
            org: String(row[ci.org] || ""),
            payKind,
          });
          byKey.set(key, e);
        }
        // 회기 정렬은 연·월·일 전체로(일(day)만 비교하면 달이 섞였을 때 순서가 뒤집힌다).
        // 엑셀은 그 달 것만 나오는 게 정상이라 보통 결과는 같지만, 정렬 자체는 이쪽이 옳다.
        const dayNum = (s: string) => { const p = parseYMD(s); return p ? p.y * 10000 + p.mo * 100 + p.d : 0; };
        for (const e of byKey.values()) e.rows.sort((a, b) => dayNum(a.use) - dayNum(b.use));

        let ther = "";
        for (const r0 of rows) {
          if (!Array.isArray(r0)) continue;
          const k = r0.indexOf("제공인력 이름");
          if (k >= 0) { ther = String(r0[k + 1] || ""); break; }
        }

        const incoming = [...byKey.values()];
        const total = incoming.reduce((a, e) => a + e.rows.length, 0);
        const hadBefore = Object.keys(grouped).length; // 병합 전 화면에 있던 아동 수
        setTherapist(ther);
        // 새 엑셀을 기존 작업본에 '합쳐서' 붙인다(같은 아동은 새 데이터로 갱신, 나머지는 유지).
        // 예전엔 setGrouped(g) 로 통째 교체 → 어제 올린 엑셀·수정본이 오늘 새 엑셀 업로드로 사라졌음.
        const { next: mergedGroups, labelByKey } = planMerge(grouped, incoming);
        setGrouped(mergedGroups);
        // 엑셀은 그 달 것만 나오는 게 정상(소급건도 그 달 안에서 처리된다).
        // 전제가 깨져 여러 달이 섞이면 조용히 틀리지 않도록 알린다 — 안전망.
        const mixed = incoming
          .filter((e) => new Set(e.rows.map((r) => { const p = parseYMD(r.use); return p ? `${p.y}-${p.mo}` : ""; }).filter(Boolean)).size > 1)
          .map((e) => e.name);
        setMixedMonthChildren(mixed);
        setUploadInfo(
          hadBefore > 0
            ? `✓ ${incoming.length}명 불러와 기존 목록에 합쳤어요 · 치료사 ${ther || "-"} · 이번 파일 ${total}건 (이전에 불러온 아동은 그대로 유지됩니다)`
            : `✓ 불러오기 완료 · 치료사 ${ther || "-"} · 아동 ${incoming.length}명 · 총 ${total}건`
        );
        // 소급결제 경고 배너는 방금 올린 파일 기준으로 표시(어제 건은 이미 처리됨).
        const retroByChild: Record<string, number> = {};
        for (const [k, n] of Object.entries(retroByKey)) {
          const lab = labelByKey.get(k) ?? k.split("|")[0];
          retroByChild[lab] = (retroByChild[lab] ?? 0) + n;
        }
        setRetroChildren(Object.keys(retroByChild));
        setRetroByChild(retroByChild);
        setRetroCount(retroCount);
        const first = incoming[0];
        setCurChild(first ? (labelByKey.get(`${first.name}|${first.bkey}`) ?? first.name) : null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError("파일을 읽는 중 오류가 발생했어요: " + msg);
      }
    };
    r.readAsArrayBuffer(file);
  }

  const names = Object.keys(grouped);

  function resetRecord() {
    if (!window.confirm("화면에 불러온 내용만 지웁니다. 저장된 기록지는 그대로 있어요. 계속할까요?")) return;
    try {
      localStorage.removeItem(LS_DRAFT);
      localStorage.removeItem(LS_SCROLL);
    } catch {}
    setGrouped({});
    setCurChild(null);
    setRetroChildren([]);
    setRetroByChild({});
    setRetroCount(0);
    setMixedMonthChildren([]);
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

      {/* 자동저장 실패 배너가 붙는 자리 — 어떤 overflow 조상에도 들어가지 않도록 최상위(.content 직속)에 둔다.
          display:contents 라 자기 박스를 만들지 않는다 → 배너가 없을 때 .content 의 gap(20px) 도 먹지 않는다. */}
      <div id={SAVE_ALERT_SLOT} style={{ display: "contents" }} />

      {/* 직접 시작 — 엑셀 없이 */}
      <div className="card">
        <div className="card-header">
          <span className="step">1</span>
          <h2>아동·월 고르고 시작</h2>
          <span className="hint">일정표에 넣어둔 회기가 자동으로 채워져요</span>
          {names.length > 0 && (
            <button type="button" className="btn btn-sm" onClick={resetRecord} style={{ marginLeft: "auto", border: "1px solid var(--border)", background: "#fff", fontWeight: 600 }}>
              화면 비우기
            </button>
          )}
        </div>
        <div className="card-body">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
            <div className="field" style={{ flex: 1, minWidth: 200 }}>
              <label>아동 · 서비스</label>
              <select
                className="select"
                value={manualCSId === "" ? "" : String(manualCSId)}
                onChange={(e) => {
                  const v = e.target.value ? Number(e.target.value) : "";
                  setManualCSId(v);
                  if (!v) return;
                  // URL 자동시작과 같은 기준: 엑셀 화면은 안 건드리고 탭 이동만, 그 외엔 바로 시작.
                  if (hasExcelData(grouped)) {
                    const cs = myServices.find((s) => s.id === v);
                    const tab = cs ? findTab(grouped, cs) : null;
                    // 탭이 없으면 아무 일도 안 일어나 "왜 안 되지"만 남는다 — 이유와 다음 행동을 알린다.
                    if (tab) { setCurChild(tab); setError(""); }
                    else setError(`올린 엑셀에 '${cs?.name ?? "이 아동"}' 회기가 없어요. 이 아동만 따로 작성하려면 위 '화면 비우기' 후 다시 골라주세요.`);
                  } else if (names.length === 0) {
                    void startManual(v, manualYm);
                  }
                }}
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
          <h2>월말 엑셀 올리기 (선택)</h2>
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
              {mixedMonthChildren.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--danger)", fontWeight: 700, lineHeight: 1.6 }}>
                  ⚠ 이 파일에 <b>여러 달</b>이 섞여 있어요({mixedMonthChildren.join(", ")}) — 확인해주세요.
                  기록지는 <b>첫 회기의 달</b> 기준으로 만들어집니다.
                </div>
              )}
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

            {curChild && schedCount != null && grouped[curChild] && grouped[curChild].length !== schedCount && (
              <div className="flash warn" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span>
                  ⚠ 일정표 회기(<b>{schedCount}회</b>)와 기록지 회기(<b>{grouped[curChild].length}회</b>)가 달라요.
                  일정표를 수정했다면 일정표 기준으로 다시 불러오세요. (입력한 결과는 회기 순서대로 다시 채워져요)
                </span>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ marginLeft: "auto", fontWeight: 700 }}
                  onClick={() => startManual()}
                  disabled={manualLoading}
                >
                  {manualLoading ? "불러오는 중..." : `일정표 ${schedCount}회로 다시 불러오기`}
                </button>
              </div>
            )}
            {curChild && grouped[curChild] && (
              <RecordSheet
                // 회기 수를 key 에 포함 — 더 넓은 엑셀을 재업로드해 회기 수가 바뀌면
                // RecordSheet 를 리마운트해 내부 상태 배열(times 등)을 새 길이로 재시드한다.
                // (예전엔 key={curChild} 라 같은 아동 재업로드 시 옛 길이 상태가 남아
                //  times[i].start 접근에서 크래시 → "다시 시도/대시보드" 에러 화면이 떴음)
                // 연·월도 key 에 포함 — 같은 아동으로 3월→4월을 열었는데 회기 수가 같으면
                // 리마운트가 없어 3월의 제공일자·시간·잠금·일정표·소급사유·임상 서술이 4월 서류에
                // 그대로 실렸다(자동저장이 4월 기록으로 확정). 새 달은 전부 새로 시작하고,
                // 지난달 내용이 필요하면 시트 안의 '전월 기록 가져오기' 버튼을 쓴다.
                // 두 탭 충돌에서 '최신 내용 불러오기'를 고르면 nonce 를 올려 리마운트한다 —
                // 마운트 경로(엑셀 시드 → 저장본 복원)를 그대로 다시 타므로 별도 복원 로직이 필요 없다.
                key={`${sheetKey(curChild, grouped[curChild])}:${sheetReloadNonce}`}
                child={curChild}
                rows={grouped[curChild]}
                therapist={therapist}
                myServices={myServices}
                recordForm={recordForm}
                onReloadFromServer={() => setSheetReloadNonce((n) => n + 1)}
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
  onReloadFromServer,
}: {
  child: string;
  rows: SessionRow[];
  therapist: string;
  myServices: MyServiceOption[];
  recordForm: string;
  // 두 탭 충돌에서 '최신 내용 불러오기'를 고른 경우 — 부모가 이 시트를 리마운트해
  // 엑셀·저장본에서 처음부터 다시 시드한다(이 창에서 편집한 내용은 버린다).
  onReloadFromServer?: () => void;
}) {
  const betaUx = useBetaUx();
  // 연·월은 '회기가 가장 많은 달' 기준(sheetKey 와 동일). 첫 행만 보면 소급결제 한 건에
  // 시트 전체가 지난달로 잡혀 이번 달 작업이 지난달 레코드로 저장된다.
  const period = sheetPeriod(rows);
  const month: number | "" = period?.mo ?? "";
  // 화면 탭 라벨(child)에는 동명이인 구분용 생년월일이 붙을 수 있다 —
  // 출력·저장에 쓰는 '아동 이름'은 언제나 원본 이름을 쓴다.
  const birth = rows[0]?.birth ?? "";
  const childName = rows[0]?.name || child;
  // DB 매칭: 본인 담당 ChildService 중 라벨/이름이 일치 + 생년월일이 어긋나지 않을 것(동명이인 분리).
  // 직접 시작 모드는 라벨이 'name · serviceType' 인 경우가 있음.
  const bk = birthKey(birth);
  const birthOk = (c: MyServiceOption) => {
    const cb = birthKey(c.birthDate ?? "");
    return !bk || !cb || cb === bk; // 한쪽이라도 생년월일을 모르면 이름만으로 판단
  };
  const matchedService = myServices.find((c) => {
    const tag = c.hasMultipleServices ? `${c.name} · ${c.serviceType}` : c.name;
    return tag === child && birthOk(c);
  }) ?? myServices.find((c) => c.name === childName && birthOk(c));
  const childServiceId = matchedService?.id ?? null;
  // 연도도 이용일자 기준 — 연말경계(예: 1월에 작년 12월 기록 작성) 시 올해로 어긋나 분실되는 것 방지.
  const year = period?.y || new Date().getFullYear();
  const org = rows[0]?.org ?? "";

  // start/end times per column (editable)
  // 시간 우선순위(전 경로 공통): 임상가 직접수정 > 엑셀 결제시간 > 일정표 예정시간.
  // 시작시간은 언제나 종료 -50분(바우처 기관 공통 50분).
  const initial = rows.map((s) => {
    const end = hm(s.end); // "9:00" 같은 표기도 받아준다(예전엔 정규식에 걸려 시작시간이 빈칸)
    return { start: end ? minusMin(end, 50) : "", end };
  });
  const [times, setTimes] = useState(initial);
  // 임상가가 화면에서 직접 고친 시간 칸(출처 표식) — 엑셀·일정표 재시드가 덮지 못한다.
  // DB(RecordSession.timeFixed)에 저장·복원되므로 다른 PC·새로고침에서도 유지된다.
  // ⚠ 인덱스가 아니라 '회기 식별자'로 든다. 인덱스로 들면 회기 하나가 취소된 엑셀을 올렸을 때
  //    (회기 수가 같아 리마운트도 없다) 잠금이 엉뚱한 회기로 옮겨가 그 회기만 결제시간이
  //    영영 안 붙는다 — 이번 고객 신고와 같은 계열의 사고.
  //    식별자: 승인번호(a:) → 그 달에 하나뿐인 제공일(d:) → 회차(o:) 순.
  // ref = effect 안에서 항상 최신값을 읽기 위한 거울, state = 화면 배지·되돌리기 버튼 렌더용.
  const lockIdsRef = useRef<string[]>([]);
  const [lockIds, setLockIds] = useState<string[]>([]);
  function writeLocks(next: string[]) {
    lockIdsRef.current = next;
    setLockIds(next);
  }
  // 제공일자(월·일) — 편집 가능. 승인내역(서비스이용일자) 기준으로 시드하되, 하루 두 번 결제 등으로
  // 실제 수업일과 다르면 치료사가 기록지에서만 직접 고칠 수 있다(일정표는 건드리지 않음).
  const [dates, setDates] = useState(
    rows.map((s) => { const pu = parseYMD(s.use); return pu ? `${pu.mo}/${pu.d}` : String(s.use ?? ""); })
  );
  // 임상가가 직접 정한 제공일자 칸 — 나중에 엑셀이 와도 덮어쓰지 않는다(하루 두 번 결제 등).
  const dateFixedByUser = useRef<Set<number>>(new Set());
  const [vouchers, setVouchers] = useState(rows.map(() => "40"));
  const [extras, setExtras] = useState(rows.map(() => "10"));
  const [amounts, setAmounts] = useState(
    rows.map((s) => (s.amt && String(s.amt).trim()
      ? String(s.amt)
      : (matchedService?.defaultUnit ? matchedService.defaultUnit.toLocaleString("ko-KR") : "0")))
  );
  // 임상 서술은 달마다 새로 쓴다 — 아동·월이 바뀌면 리마운트되어 빈칸으로 시작한다.
  // 지난달 내용을 이어쓰려면 '전월 기록 가져오기' 버튼(copyPrevRecord).
  const [results, setResults] = useState(rows.map(() => ""));
  // 이용자 상태 (서식B 등 상태·결과 분리 양식에서 사용)
  const [statuses, setStatuses] = useState(rows.map(() => ""));
  // 상태·부모상담 입력칸 토글(회기별) — 기본은 접혀서 이전 화면 그대로, 필요한 사람만 연다.
  const [statusOpen, setStatusOpen] = useState<Set<number>>(new Set());
  // 제공일자(일정표) ≠ 승인일자(엑셀) 일 때 입력하는 사유. 저장 시 resultExtra 로 들어감.
  const [mismatchReasons, setMismatchReasons] = useState(rows.map(() => ""));
  // 소급결제 회기의 소급 사유. 저장 시 retroReason 으로 들어가고, 출력 결과 뒤 "* 소급 사유: …" 로 붙음.
  const [retroReasons, setRetroReasons] = useState(rows.map(() => ""));
  // 일정표에서 가져온 회기 예정일 (제공일자). 일정표 회기 ↔ 엑셀 행을 ordinal 로 매칭.
  // 일정표 없으면 null → 그땐 엑셀의 use 날짜로 대체.
  const [scheduleDays, setScheduleDays] = useState<(number | null)[]>(rows.map(() => null));
  // 일정표 회기의 '예정 종료시간' — 일(day) → "HH:MM". 회기 순번이 아니라 날짜로 들고 있다가
  // 제공일자 짝짓기(pairScheduleDays) 결과에 맞춰 회기에 붙인다. 순번으로 붙이면 취소·보강으로
  // 회차가 밀렸을 때 엉뚱한 예정시간(월 16:00 / 수 17:00)이 회기에 붙는다.
  const [scheduleEndByDay, setScheduleEndByDay] = useState<Record<number, string>>({});
  // 일정표 조회가 끝났는지(일정표가 없어서 비어도 true). 시간 확정은 저장본·일정표가 모두
  // 도착한 뒤에만 한다 — 두 fetch 응답 순서에 따라 옛값이 먼저 굳는 레이스 방지.
  const [scheduleLoaded, setScheduleLoaded] = useState(false);
  const [recordLoaded, setRecordLoaded] = useState(false);
  // 서버 저장본의 시간·출처표식(복원 대기). 저장된 기록이 없으면 null.
  const [savedTimes, setSavedTimes] = useState<
    ({ start: string | null; end: string | null; timeFixed: boolean } | null)[] | null
  >(null);
  // 저장본 복원 판정이 끝났는지 — 끝나기 전엔 재시드도 자동저장도 하지 않는다(옛값 선저장 방지).
  const [restoreDone, setRestoreDone] = useState(false);
  const savedApplied = useRef(false);
  // 시간이 자동으로 맞춰졌을 때의 안내(조용한 갱신 방지).
  const [timeNotice, setTimeNotice] = useState("");
  const [opinion, setOpinion] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [loadedRecordId, setLoadedRecordId] = useState<number | null>(null);
  const [autoStatus, setAutoStatus] = useState<"" | "saving" | "saved" | "error" | "authError" | "conflict">("");
  const recordTouched = useRef(false); // 사용자가 실제 입력했을 때만 자동저장(빈 기록 생성·덮어쓰기 방지)
  const savingRef = useRef(false);      // 자동저장 뮤텍스 — 겹쳐 돌면 회기 unique 충돌·중복 delete/insert
  const savePendingRef = useRef(false);
  const saveFailRef = useRef(0);
  // 401(다른 기기 로그인으로 세션이 지워짐) — 재시도해도 계속 401 이므로 사용자가
  // 다시 로그인하고 '지금 저장'을 누를 때까지 멈춘다. 자동 리다이렉트는 하지 않는다(작성분 소실).
  const authFailedRef = useRef(false);
  // ── 두 탭 덮어쓰기 방지(낙관적 잠금, lib/save-conflict.ts) ───────────────
  // 이 창이 마지막으로 읽거나 쓴 서버 저장본의 시각 + 그게 어느 (아동, 연, 월) 것인지.
  // 값의 출처는 **서버 응답(불러오기/저장)뿐**이다. null = '모른다'(아직 못 읽었거나 조회 실패)
  // → 그 상태에서는 저장 요청에서 baseUpdatedAt 키를 아예 빼 예전처럼 그냥 저장한다.
  //   (조회 한 번 실패한 것을 '저장본 없음'으로 단정하면 가짜 충돌로 저장이 멈춘다.)
  // ⚠ state 가 아니라 ref 인 이유: 저장할 때마다 값이 바뀌는데 state 로 두면 자동저장 effect 가
  //   다시 돌아 1.8초마다 영원히 저장한다(그리고 응답으로 갱신하지 않으면 자기 자신과 충돌한다).
  const baseRef = useRef<SaveBase | null>(null);
  // 충돌 중에는 자동저장을 멈춘다 — 계속 409 를 때리는 것도, 조용히 덮어쓰는 것도 안 된다.
  const conflictRef = useRef(false);
  // 사용자가 '이 창 내용으로 저장'을 고른 경우에만 켜지는 깃발(저장에 성공하면 스스로 꺼진다).
  const forceOverwriteRef = useRef(false);
  const [saveTick, setSaveTick] = useState(0);
  // 저장 실패 배너를 붙일 최상위 자리. 마운트 후에만 잡는다(SSR 렌더에는 없음 → hydration 안전).
  const [alertSlot, setAlertSlot] = useState<HTMLElement | null>(null);
  useEffect(() => { setAlertSlot(document.getElementById(SAVE_ALERT_SLOT)); }, []);

  // 시간 자동 갱신 안내는 잠시 뒤 스스로 사라진다(한 번 뜨면 영영 남지 않게).
  useEffect(() => {
    if (!timeNotice) return;
    const t = window.setTimeout(() => setTimeNotice(""), 8000);
    return () => window.clearTimeout(t);
  }, [timeNotice]);
  // 저장한 우리 센터 양식 — 있으면 출력 양식 선택
  const [savedForms, setSavedForms] = useState<Array<{ id: number; name: string; hasStatus?: boolean; hasHwp?: boolean }>>([]);
  const [outFormId, setOutFormId] = useState<number | "">("");
  useEffect(() => {
    fetch("/api/forms/saved")
      .then((r) => (r.ok ? r.json() : { forms: [] }))
      .then((d) => {
        const rf = (d.forms ?? []).filter((f: { kind: string }) => f.kind === "record");
        setSavedForms(rf);
        // 우리 센터 양식이 등록돼 있으면 그 양식을 기본 선택(없으면 발달바우처 기본 서식).
        setOutFormId((prev) => prev || (rf[0]?.id ?? ""));
      })
      .catch(() => {});
  }, []);
  // 상태·결과 분리 양식이면 회기별 '이용자 상태' 입력칸을 따로 보여준다 —
  // 내장 서식B(동탄) 또는 상태 전용 칸(예: 성심 '건강상태 및 부모상담')이 있는 저장 양식.
  const splitStatus =
    recordForm === "dongtan" ||
    (savedForms.find((f) => f.id === outFormId)?.hasStatus ?? false);

  const monthNumForLoad = typeof month === "number" ? month : parseInt(String(month)) || 0;

  // 저장된 기록지가 있으면 자동으로 불러와서 state 채우기 (월 단위)
  // 일정표 회기 날짜 불러와 scheduleDays 에 채워넣기.
  // ordinal(1번째, 2번째...) 로 엑셀 행과 매칭.
  useEffect(() => {
    // 등록 아동이 아니거나 월을 못 읽으면 기다릴 것이 없다 → 바로 '조회 완료'
    // (여기서 막히면 엑셀을 올려도 시간 재시드가 영영 안 돌아간다)
    if (!childServiceId || !monthNumForLoad) { setScheduleLoaded(true); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/schedule/load?childServiceId=${childServiceId}&year=${year}&month=${monthNumForLoad}`);
        if (!r.ok || cancelled) return;
        const sched = await r.json();
        if (cancelled) return;
        if (sched && Array.isArray(sched.sessions)) {
          const sess = sched.sessions as { day: number; time?: string | null }[];
          const days = sess.map((s) => s.day);
          // 일정표 시간은 "HH:MM~HH:MM" — 뒤쪽(종료)만 '일(day)별'로 보관한다(짝짓기 후 회기에 붙임).
          const byDay: Record<number, string> = {};
          for (const s of sess) {
            const e = hm(String(s.time ?? "").split("~")[1] ?? "");
            if (e) byDay[s.day] = e;
          }
          setScheduleDays(rows.map((_, i) => days[i] ?? null));
          setScheduleEndByDay(byDay);
        }
      } catch {} finally {
        // 일정표가 없거나 요청이 실패해도 '조회 완료'로 표시 — 복원·재시드가 영영 멈추면 안 된다.
        if (!cancelled) setScheduleLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [childServiceId, monthNumForLoad, year, rows]);

  // 승인내역(엑셀)이 나중에 올라오거나 바뀌면 제공일자를 확정일(서비스이용일자)로 다시 채운다.
  // 일정표로 미리 작성해 둔 '예정일'이 그대로 남아 있으면 화면에 예정일과 승인내역이 섞여
  // 회차가 한 칸씩 밀려 보이고, 없는 불일치 경고가 생겼다(회기 수가 같으면 리마운트도 안 됨).
  const apprSig = rows.map((s) => s.appr || "").join("|");
  useEffect(() => {
    if (!rows.some((s) => s.appr)) return; // 엑셀 없는 작업본은 기록지에 적은 날이 확정일
    setDates((prev) => prev.map((v, i) => {
      if (dateFixedByUser.current.has(i)) return v;
      const pu = parseYMD(rows[i]?.use ?? "");
      return pu ? `${pu.mo}/${pu.d}` : v;
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apprSig]);

  useEffect(() => {
    // 시간 재시드·복원은 아래 '시간 확정' effect 로 일원화 — 여기서는 저장본만 읽어 온다.
    if (!childServiceId || !monthNumForLoad) { setRecordLoaded(true); return; }
    // 아동/월 전환 — 자동저장 게이트 초기화(이전 아동 데이터로 잘못 저장 방지)
    recordTouched.current = false; setLoadedRecordId(null); setAutoStatus("");
    // 다른 달의 기준시각·충돌 상태를 끌고 가면 안 된다(그 달의 저장본을 아직 안 읽었다).
    baseRef.current = null; conflictRef.current = false; forceOverwriteRef.current = false;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/record/load?childServiceId=${childServiceId}&year=${year}&month=${monthNumForLoad}`);
        // 조회 자체가 실패하면(500·네트워크) 기준시각은 '모른다'로 남긴다 — 여기서 '저장본 없음'으로
        // 단정하면 서버에 기록이 있는데도 첫 저장이 409 가 되어 저장이 멈춘다(가짜 충돌).
        if (!r.ok || cancelled) return;
        const rec = await r.json();
        if (cancelled) return;
        // 조회에 성공했다 → 저장본이 없다는 것까지 '확인'된다(rec === null 이면 stamp = null).
        baseRef.current = { csId: childServiceId, y: year, m: monthNumForLoad, stamp: stampFromLoaded(rec) };
        if (!rec || !rec.id) return;
        setLoadedRecordId(rec.id);
        setOpinion(rec.opinion ?? "");
        if (rec.formId) setOutFormId(rec.formId); // 저장 시 기억한 출력 양식 복원
        // 저장본 ↔ 화면 회기 짝짓기 — 승인번호가 있으면 그걸로 맞춘다. 엑셀은 서비스이용일자
        // 순으로 정렬돼 들어오므로 회차 순번만 믿으면 회기가 통째로 밀려 붙는다.
        const byOrd = new Map<number, RecordSessionData>();
        const byAppr = new Map<string, RecordSessionData>();
        for (const s of rec.sessions as RecordSessionData[]) {
          byOrd.set(s.ordinal, s);
          if (s.apprNumber) byAppr.set(String(s.apprNumber), s);
        }
        const sm = {
          get(ord: number): RecordSessionData | undefined {
            const appr = rows[ord - 1]?.appr;
            if (appr && byAppr.size) return byAppr.get(appr); // 못 찾으면 새 회기 → 남의 값 붙이지 않음
            return byOrd.get(ord);
          },
        };
        // 시간은 여기서 바로 덮지 않는다 — 저장본의 출처표식(timeFixed)과 시드(엑셀·일정표)를
        // 모아 아래 '시간 확정' effect 에서 한 번에 판정한다.
        // 예전엔 무조건 덮어써서, 결제시간을 바꿔 재결제해도 옛 일정표 시간이 되살아났다.
        setSavedTimes(rows.map((_, i) => {
          const s = sm.get(i + 1);
          return s ? { start: s.startTime ?? null, end: s.endTime ?? null, timeFixed: s.timeFixed === true } : null;
        }));
        // 저장된 제공일자 복원 — 단, 승인번호 없이(=일정표 예정일로 미리) 저장해 둔 값이
        // 나중에 붙은 엑셀 확정일을 덮지 않게 한다. 엑셀이 있는 상태에서 저장된 값은
        // 임상가가 확정한 날짜이므로 그대로 살리고 재시드에서도 보호한다.
        setDates((prev) => prev.map((v, i) => {
          const s = sm.get(i + 1);
          if (!s?.date) return v;
          if (!s.apprNumber && rows[i]?.appr) return v; // 예정일 저장본 < 엑셀 확정일
          // 엑셀 없이 저장된 날짜는 일정표 예정일(또는 자리표시 날짜)의 사본일 수 있다.
          // 임상가 의도가 확인될 때만(승인번호 확정 저장 또는 일정변경 사유 기재) 확정으로
          // 잠근다. 안 잠긴 날짜는 아래 재시드 effect 가 현재 일정표 예정일로 맞춘다
          // (일정표 저장 전에 기록지가 먼저 자동저장되면 1·8·15…일이 영영 남던 문제).
          const reason = (s as { resultExtra?: string | null }).resultExtra ?? "";
          if (s.apprNumber || reason.trim()) dateFixedByUser.current.add(i);
          return s.date;
        }));
        setVouchers((prev) => prev.map((v, i) => sm.get(i + 1)?.voucher ?? v));
        setExtras((prev) => prev.map((v, i) => sm.get(i + 1)?.extra ?? v));
        // 총이용금액도 저장값으로 복원 — 회차별로 다른 금액을 저장하면 그대로 유지된다.
        // (이렇게 해야 재진입 시 화면이 stale 시드값으로 채워져 자동저장에 덮어쓰이는 일이
        //  없다. 예전 버그로 엑셀 결제금액이 저장된 과거 기록은 마이그레이션
        //  scripts/fix-record-amounts.ts 로 회당단가로 일괄 교정.)
        setAmounts((prev) => prev.map((v, i) => sm.get(i + 1)?.amount ?? v));
        setResults((prev) => prev.map((v, i) => sm.get(i + 1)?.result ?? v));
        setStatuses((prev) => prev.map((v, i) => sm.get(i + 1)?.status ?? v));
        setMismatchReasons((prev) => prev.map((v, i) => {
          const sess = sm.get(i + 1);
          // 일부 RecordSession 에 resultExtra 가 있을 수도 있음
          return (sess as { resultExtra?: string | null } | undefined)?.resultExtra ?? v;
        }));
        setRetroReasons((prev) => prev.map((v, i) => sm.get(i + 1)?.retroReason ?? v));
        setSavedMsg(`✓ ${rec.year}년 ${rec.month}월 저장된 기록을 불러왔어요.`);
      } catch {} finally {
        // 저장된 기록이 없거나 요청이 실패해도 '조회 완료' — 시간 확정이 영영 멈추면 안 된다.
        if (!cancelled) setRecordLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [childServiceId, year, monthNumForLoad]);

  // 전월 기록 가져오기 — 가장 최근 저장된 기록의 result/opinion 을 현재 기록 폼에 복사.
  // 회기 수가 달라도 가능한 만큼만 복사.
  // 직전 달만 보면 방학·휴직으로 한 달이 비었을 때 막다른 길이 된다(이월 수단이 이 버튼뿐이다).
  // → 최대 3개월 거슬러 올라가며 처음 찾은 기록을 쓰고, '몇 월 것인지'를 반드시 알린다.
  const PREV_LOOKBACK = 3;
  async function copyPrevRecord() {
    if (!childServiceId) {
      alert("아동을 먼저 선택하세요.");
      return;
    }
    try {
      let found: { y: number; m: number; rec: { id: number; opinion?: string | null; sessions: RecordSessionData[] } } | null = null;
      let py = year, pm = monthNumForLoad;
      for (let back = 0; back < PREV_LOOKBACK; back++) {
        pm -= 1;
        if (pm < 1) { py -= 1; pm = 12; } // 연말 경계 — 1월 → 작년 12·11·10월
        const r = await fetch(`/api/record/load?childServiceId=${childServiceId}&year=${py}&month=${pm}`);
        if (!r.ok) continue; // 권한·파라미터 오류는 그 달만 건너뛴다
        const rec = await r.json();
        if (rec && rec.id) { found = { y: py, m: pm, rec }; break; } // 찾으면 즉시 중단(보통 1회)
      }
      if (!found) {
        alert(`최근 ${PREV_LOOKBACK}개월 안에 저장된 기록이 없어요.`);
        return;
      }
      const { y: fy, m: fm, rec } = found;
      // opinion 복사
      setOpinion(rec.opinion ?? "");
      // 각 회차 result 를 현재 회차에 매핑 (앞에서부터)
      const recSessions = rec.sessions as RecordSessionData[];
      setResults((prev) => prev.map((v, i) => recSessions[i]?.result ?? v));
      setStatuses((prev) => prev.map((v, i) => recSessions[i]?.status ?? v));
      // 바우처·추가구매(분)·총이용금액도 이월 — 마지막 회차 20/30 같은 회차별 설정을
      // 매달 다시 입력하지 않도록. 회차 수가 달라도 앞에서부터 가능한 만큼만 복사.
      setVouchers((prev) => prev.map((v, i) => recSessions[i]?.voucher ?? v));
      setExtras((prev) => prev.map((v, i) => recSessions[i]?.extra ?? v));
      setAmounts((prev) => prev.map((v, i) => recSessions[i]?.amount ?? v));
      // 가져온 내용은 사용자 입력과 동일하게 취급 → 자동저장이 보존하도록 게이트 해제.
      recordTouched.current = true;
      // 어느 달에서 가져왔는지 반드시 보인다 — 3개월 전 서술을 이번 달 기록으로 확정하면 안 된다.
      setSavedMsg(`✓ ${fy}년 ${fm}월 기록 내용을 가져왔어요 (바우처·추가구매 분·총이용금액 포함). 내용이 이번 달과 맞는지 확인해주세요. 자동 저장됩니다.`);
    } catch {
      alert("불러오기 실패");
    }
  }

  // format "hwp" = 구버전 한글(2002~2014)용 HWP 5.0 바이너리 — 내장 기본 서식에서만 지원.
  async function downloadHwpx(format?: "hwp") {
    setDownloading(true);
    try {
      const monthNum = typeof month === "number" ? month : parseInt(String(month)) || 0;
      const sessionsPayload = rows.map((s, i) => {
        const pp = parseYMD(s.pay);
        // 출력 useDay = 확정 제공일(제공일자 칸 > 승인내역 이용일자). 일정표 예정일은 쓰지 않는다.
        const useDayNum = fixedDays[i] ?? null;
        return {
          date: dates[i] || "",
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
          // 소급 사유는 소급결제 회기에서만 출력한다(화면에 칸이 없는 회기의 옛 값 유출 방지).
          retroReason: (s.payKind || "").includes("소급") ? (retroReasons[i] || undefined) : undefined,
          status: statuses[i] || undefined,
        };
      });
      const payload = {
        // 탭 라벨(동명이인 구분용 생년월일 포함)이 아니라 원본 이름을 찍는다.
        childName,
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
        format,
      };
      const res = await fetch("/api/record/hwpx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const ext = format === "hwp" ? "hwp" : "hwpx";
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        alert(`한글파일(.${ext}) 생성 실패: ` + (e.error ?? res.status));
        return;
      }
      const blob = await res.blob();
      // 회기 5개 초과면 서버가 .zip 으로 묶어 보냄
      const isZip = blob.type === "application/zip";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${childName}_${monthNum}월_기록지.${isZip ? "zip" : ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setDownloading(false);
    }
  }

  // 임상가가 화면에서 직접 고친 시간 = 확정값. 여기(사용자 입력)에서만 표식을 세운다.
  // 재시드·복원 같은 자동 경로에서는 절대 세우지 않는다(세우면 다음 엑셀이 못 고친다).
  function setEnd(i: number, v: string) {
    lockTime(i);
    setTimes((prev) => {
      const next = [...prev];
      const e = hm(v); // "9:40" 처럼 한 자리 시각도 인식(예전엔 시작시간이 옛값으로 남았다)
      next[i] = { end: v, start: e ? minusMin(e, 50) : next[i].start };
      return next;
    });
  }
  function setStart(i: number, v: string) {
    lockTime(i);
    setTimes((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], start: v };
      return next;
    });
  }
  function setDate(i: number, v: string) {
    dateFixedByUser.current.add(i);
    setDates((prev) => { const n = [...prev]; n[i] = v; return n; });
  }
  // 확정 제공일 — 제공일자 칸("M/D")의 '일'이 최우선, 없으면 승인내역 서비스이용일자.
  // 일정표는 '예정일'일 뿐이므로 확정일 판정에 쓰지 않는다(예정 13일 → 실제 20일 제공이 정상).
  const fixedDays = useMemo(
    () => rows.map((s, i) => {
      const m = String(dates[i] ?? "").match(/(\d{1,2})\s*$/);
      return m ? +m[1] : (parseYMD(s.use)?.d ?? null);
    }),
    [rows, dates],
  );

  // 일정표 예정일 ↔ 회기 짝짓기(확정일 기준). 결제일로 짝지으면 결제가 하루라도 밀린 회기부터
  // 예정일이 통째로 한 칸씩 밀려 없는 불일치가 줄줄이 생겼다.
  const schedDays = useMemo(() => pairScheduleDays(scheduleDays, fixedDays), [scheduleDays, fixedDays]);

  // ── 시간(시작·종료) 확정 ────────────────────────────────────────────────
  // 우선순위: ① 임상가 직접수정(timeFixed) > ② 엑셀 결제시간 > ③ 일정표 예정시간.
  // 예전엔 저장값이 '예정 시드'인지 '확정값'인지 추론했고(승인번호 유무·예정시간 일치),
  // 그 추론이 어긋나 일정표 예정시간이 결제시간을 덮어 출력되는 사고가 났다.
  // 이제는 출처를 DB(RecordSession.timeFixed)에 저장해 추론 없이 판정한다.
  const excelEnds = useMemo(() => rows.map((s) => (s.appr ? hm(s.end) : "")), [rows]);
  // 일정표 예정 종료시간을 '짝지어진 예정일' 기준으로 회기에 붙인다(순번 매칭 금지 — B-2).
  const schedEnds = useMemo(
    () => schedDays.map((d) => (d != null ? (scheduleEndByDay[d] ?? "") : "")),
    [schedDays, scheduleEndByDay],
  );
  // 그 회기의 '자동 시드' 종료시간 — 엑셀이 있으면 엑셀, 없으면 일정표.
  const seedEnds = useMemo(
    () => rows.map((_, i) => excelEnds[i] || schedEnds[i] || ""),
    [rows, excelEnds, schedEnds],
  );
  const seedSig = seedEnds.join("|");
  const savedSig = savedTimes
    ? savedTimes.map((s) => (s ? `${s.timeFixed ? 1 : 0}${s.start ?? ""}-${s.end ?? ""}` : "")).join("|")
    : "";

  // 회기 식별자 — 잠금·자리바꿈 정렬이 함께 쓰는 키(인덱스·화면 상태 금지, rowIdentities 참고).
  // 제공일자를 고쳐도, 같은 날짜가 둘이 돼도 키가 흔들리지 않는다.
  const rowIds = useMemo(() => rowIdentities(rows), [rows]);
  const lockIdsOf = (i: number): string[] => rowIds[i] ?? [`o:${i + 1}`];
  const isLocked = (i: number) => lockIdsOf(i).some((id) => lockIdsRef.current.includes(id));
  // 화면용 — lockIds(state)가 바뀌면 다시 계산된다.
  const timeFixed = useMemo(
    () => rows.map((_, i) => (rowIds[i] ?? []).some((id) => lockIds.includes(id))),
    [rows, rowIds, lockIds],
  );
  function lockTime(i: number) {
    const add = lockIdsOf(i).filter((id) => !lockIdsRef.current.includes(id));
    if (add.length) writeLocks([...lockIdsRef.current, ...add]);
  }
  function unlockTime(i: number) {
    const ids = new Set(lockIdsOf(i));
    const next = lockIdsRef.current.filter((id) => !ids.has(id));
    if (next.length !== lockIdsRef.current.length) writeLocks(next);
  }

  // (1) 저장본 적용 — 저장본·일정표가 모두 도착한 뒤 딱 한 번.
  useEffect(() => {
    if (!recordLoaded || !scheduleLoaded || savedApplied.current) return;
    savedApplied.current = true;
    if (savedTimes) {
      // 응답이 늦는 사이 임상가가 이미 고친 칸은 저장본이 잠금을 지우지 못한다(그대로 유지).
      const preLocked = rows.map((_, i) => isLocked(i));
      const next = [...lockIdsRef.current];
      rows.forEach((_, i) => {
        if (savedTimes[i]?.timeFixed !== true) return;
        for (const id of lockIdsOf(i)) if (!next.includes(id)) next.push(id);
      });
      writeLocks(next);
      setTimes((prev) => prev.map((t, i) => {
        const s = savedTimes[i];
        if (!s) return t;
        if (preLocked[i]) return t;                                                 // 방금 손으로 고친 칸
        if (s.timeFixed) return { start: s.start ?? t.start, end: s.end ?? t.end }; // 확정값 복원
        // 표식 없는 저장값 = 시드. 새 시드(엑셀>일정표)가 있으면 시드가 이긴다.
        // (예전 기록은 모두 표식이 없으므로 여기서 결제시간·일정표로 자연 교정된다)
        if (seedEnds[i]) return t;
        // 시드가 아예 없는 작업본(빈 5칸 등)은 저장값을 살린다 — 지우면 손입력이 날아간다.
        return { start: s.start ?? t.start, end: s.end ?? t.end };
      }));
    }
    setRestoreDone(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordLoaded, scheduleLoaded, savedSig]);

  // (1-b) 제공일자 재시드 — 엑셀이 없는 작업본은 일정표 예정일이 시드다. 일정표가 나중에
  //       저장되거나 예정일이 바뀌면, 잠기지 않은 날짜 칸을 현재 예정일로 다시 채운다.
  //       (임상가가 직접 고친 칸·일정변경 사유를 적은 칸은 그대로. 엑셀이 오면 이 경로 비활성.)
  useEffect(() => {
    if (!restoreDone) return;
    if (rows.some((s) => s.appr)) return; // 엑셀 있으면 확정일(서비스이용일자) 체계
    if (!monthNumForLoad || !scheduleDays.some((d) => d != null)) return;
    setDates((prev) => prev.map((v, i) => {
      if (dateFixedByUser.current.has(i)) return v;
      const d = scheduleDays[i];
      return d != null ? `${monthNumForLoad}/${d}` : v;
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoreDone, scheduleDays]);

  // (2) 시드 재적용 — 엑셀이 나중에 붙거나 일정표 시간이 바뀌면 잠기지 않은 칸을 다시 채운다.
  //     일정표로 먼저 열어 둔 뒤 회기 수가 같은 엑셀을 올리면 리마운트가 없어(key = 아동+회기수+연월)
  //     일정표 예정시간이 그대로 출력됐다(고객 신고: 4회 전부 15:10~16:00).
  //     ⚠ 변경 건수는 setTimes 업데이터 밖(순수 계산)에서 센다 — 업데이터 안에서 세면
  //       React 가 그 함수를 나중에/두 번 부를 때 배너가 침묵하거나 2배로 센다.
  // (2-a) 회기 자리바꿈 정렬 — 취소·보강이 반영된 엑셀을 다시 올리면(회기 수가 같아 리마운트 없음)
  //   같은 회기가 다른 자리로 간다. 값은 자리(index)에 매여 있으므로 회기를 따라 옮겨준다.
  //   잠금과 똑같은 식별자(rowIdentities)를 쓴다 — 한 곳만 고치면 둘 다 따라온다.
  //   ⚠ 지금은 times 만 옮긴다. 결과·상태·금액 등 나머지 배열로 넓히려면 이 moves 를 그대로 쓰면 된다.
  const rowsRef = useRef(rows);
  const rowMoves = useMemo(() => {
    const prev = rowsRef.current;
    if (prev === rows || prev.length !== rows.length) return null;
    const prevIds = rowIdentities(prev);
    const oldIdx = new Map<string, number>();
    prevIds.forEach((ids, i) => { for (const k of ids) if (!oldIdx.has(k)) oldIdx.set(k, i); });
    const moves = rows.map((_, i) => {
      for (const k of rowIds[i] ?? []) { const j = oldIdx.get(k); if (j !== undefined) return j; }
      return -1;
    });
    return moves.every((j, i) => j === i || j === -1) ? null : moves; // 자리 그대로면 정렬 불필요
  }, [rows, rowIds]);
  const alignedTimes = useMemo(
    () => (rowMoves ? times.map((t, i) => (rowMoves[i] >= 0 ? (times[rowMoves[i]] ?? t) : t)) : times),
    [rowMoves, times],
  );
  useEffect(() => { rowsRef.current = rows; }, [rows]);

  // (2-b) 시드 재적용 — 엑셀이 나중에 붙거나 일정표 시간이 바뀌면 잠기지 않은 칸을 다시 채운다.
  //     일정표로 먼저 열어 둔 뒤 회기 수가 같은 엑셀을 올리면 리마운트가 없어(key = 아동+회기수+연월)
  //     일정표 예정시간이 그대로 출력됐다(고객 신고: 4회 전부 15:10~16:00).
  //     ⚠ 변경 건수는 setTimes 업데이터 밖(순수 계산)에서 센다 — 업데이터 안에서 세면
  //       React 가 그 함수를 나중에/두 번 부를 때 배너가 침묵하거나 2배로 센다.
  const seedTarget = useMemo(
    () => alignedTimes.map((t, i) => {
      if (timeFixed[i]) return t;                       // 임상가 확정값은 잠금
      const end = seedEnds[i];
      if (!end) return t;
      const start = minusMin(end, 50);
      return (t.start === start && t.end === end) ? t : { start, end };
    }),
    [alignedTimes, timeFixed, seedEnds],
  );
  useEffect(() => {
    if (!restoreDone) return; // 복원 판정 전에는 손대지 않는다
    const changed = seedTarget.map((v, i) => (v === times[i] ? -1 : i)).filter((i) => i >= 0);
    if (changed.length === 0) return;
    setTimes(seedTarget);
    // 안내는 '자동 시드로 새로 채워진 칸'만 센다(자리 이동만 한 확정값은 제외).
    const seeded = changed.filter((i) => !timeFixed[i] && seedEnds[i]);
    if (seeded.length === 0) return;
    const excelChanged = seeded.filter((i) => excelEnds[i]).length;
    setTimeNotice(
      excelChanged
        ? `⏱ 결제내역(엑셀)의 결제시간에 맞춰 ${excelChanged}개 회기의 시작·종료시간을 갱신했어요. 직접 고친 칸은 그대로 둡니다.`
        : `⏱ 일정표 시간에 맞춰 ${seeded.length}개 회기의 시작·종료시간을 갱신했어요. 직접 고친 칸은 그대로 둡니다.`
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedTarget, restoreDone]);

  // 시간을 자동 시드로 되돌리기 — 잠금 해제 수단.
  // (없으면 "엑셀을 다시 올려도 시간이 안 고쳐져요" 문의가 난다. 새로고침으로도 안 풀린다)
  function revertTime(i: number) {
    const end = seedEnds[i];
    unlockTime(i);
    if (end) {
      setTimes((prev) => {
        const next = [...prev];
        next[i] = { start: minusMin(end, 50), end };
        return next;
      });
    }
    recordTouched.current = true; // 버튼 클릭은 onChangeCapture 가 못 잡는다 → 자동저장 게이트 직접 해제
    setTimeNotice(
      !end
        ? "⏱ 되돌릴 자동 시간(결제내역·일정표)이 없어 잠금만 풀었어요. 시간은 직접 입력하세요."
        : excelEnds[i]
          ? "⏱ 결제내역(엑셀)의 결제시간으로 되돌렸어요."
          : "⏱ 일정표 시간으로 되돌렸어요."
    );
  }

  // 두 탭 충돌에서 '최신 내용 불러오기'를 고른 경우.
  // ⚠ 순서가 중요하다 — **서버 저장본을 먼저 확인한 뒤에** 이 창 내용을 버린다(리마운트).
  //   먼저 버리고 나서 조회가 실패하면 이 창 내용도 서버 내용도 없는 막다른 길이 된다.
  //   (일정표 reloadFromServer 와 같은 방식·같은 안내)
  const [reloadingFromServer, setReloadingFromServer] = useState(false);
  async function reloadFromServer() {
    if (!childServiceId || !monthNumForLoad) return;
    setReloadingFromServer(true);
    try {
      let r: Response;
      try {
        r = await fetch(`/api/record/load?childServiceId=${childServiceId}&year=${year}&month=${monthNumForLoad}`);
      } catch {
        alert("불러오기 실패 — 인터넷 연결을 확인해 주세요. 지금 화면 내용은 그대로 두었어요.");
        return;
      }
      if (!r.ok) {
        alert(r.status === 401
          ? "다른 기기에서 로그인되어 로그아웃된 상태예요 — 새 탭에서 다시 로그인한 뒤 다시 눌러주세요. 지금 화면 내용은 그대로 두었어요."
          : "불러오기 실패 — 잠시 뒤 다시 눌러주세요. 지금 화면 내용은 그대로 두었어요.");
        return;
      }
      const rec = await r.json().catch(() => null);
      if (!rec || !rec.id) {
        alert("서버에 저장된 이 달 기록지를 찾지 못했어요. ‘이 창 내용으로 저장’을 고르면 지금 화면 그대로 저장됩니다.");
        return;
      }
      onReloadFromServer?.(); // 서버 저장본을 확인한 뒤에만 이 창 내용을 버리고 다시 시드한다
    } finally {
      setReloadingFromServer(false);
    }
  }

  // 작업 중 자동 저장 — 사용자가 실제 입력했거나(이미 저장된 기록 편집 중) 일 때만 조용히 서버 저장.
  // (다른 컴퓨터에서도 같은 아동·월을 고르면 자동으로 불러와짐)
  async function autoSaveRecord() {
    if (!childServiceId) return;
    if (loadedRecordId === null && !recordTouched.current) return;
    if (!restoreDone) return; // 저장본 복원 전에는 저장하지 않는다(옛값·빈값 선저장 방지)
    if (authFailedRef.current) return; // 로그아웃 상태 — 다시 로그인 후 사용자가 눌러야 재개
    // 다른 창이 먼저 저장해 충돌한 상태 — 사용자가 어느 쪽을 남길지 고를 때까지 저장을 멈춘다.
    if (conflictRef.current && !forceOverwriteRef.current) return;
    // 저장이 겹치면 서버가 회기를 지우고 다시 넣는 사이 다른 저장이 끼어들어
    // unique(recordId, ordinal) 충돌·중복 삭제가 난다 → 한 번에 하나만, 나머지는 다시 예약.
    if (savingRef.current) { savePendingRef.current = true; return; }
    savingRef.current = true;
    setAutoStatus("saving");
    try {
      const payload = {
        childServiceId, year, month: monthNumForLoad, org, childName, childBirth: birth, opinion,
        sessions: rows.map((s, i) => {
          const pp = parseYMD(s.pay); const useDayNum = fixedDays[i] ?? null;
          const isRetro = (s.payKind || "").includes("소급");
          return {
            ordinal: i + 1, date: dates[i] || "", startTime: times[i].start, endTime: times[i].end,
            voucher: vouchers[i], extra: extras[i], amount: amounts[i],
            useDay: useDayNum !== null ? String(useDayNum) : "", payDay: pp ? String(pp.d) : "",
            apprNumber: s.appr, result: results[i], resultExtra: mismatchReasons[i] || undefined,
            // 소급 사유는 소급결제 회기에서만 — 화면에 입력칸이 없는 회기의 옛 값이
            // 몰래 실려 출력물에 "* 소급 사유: …" 로 찍히는 일을 막는다.
            retroReason: isRetro ? (retroReasons[i] || undefined) : undefined,
            status: statuses[i] || undefined,
            // 시간 출처표식 — 이게 저장돼야 다른 PC·새로고침에서도 직접수정이 보존되고,
            // 표식 없는 시드값은 엑셀·일정표로 자동 교정된다.
            timeFixed: timeFixed[i] === true,
          };
        }),
        formId: outFormId || undefined,
        // 두 탭 덮어쓰기 방지 — 이 창이 불러온 시점의 저장본 시각. 그 사이 다른 창이 저장했으면
        // 서버가 409 로 거절한다(작성분을 조용히 지우지 않는다).
        // 기준시각을 '모르는' 상태면 키 자체가 빠져 예전처럼 그냥 저장된다(가짜 충돌 방지).
        ...baseField(baseRef.current, childServiceId, year, monthNumForLoad),
        ...(forceOverwriteRef.current ? { overwrite: true } : {}),
      };
      const res = await fetch("/api/record/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) {
        const j = await res.json();
        setLoadedRecordId(j.recordId);
        // ⚠ 새 기준시각으로 갱신 — 이걸 빼먹으면 두 번째 저장부터 자기 자신과 충돌해 저장이 멈춘다.
        baseRef.current = { csId: childServiceId, y: year, m: monthNumForLoad, stamp: stampFromSaveResponse(j) };
        forceOverwriteRef.current = false;
        conflictRef.current = false;
        setAutoStatus("saved");
        saveFailRef.current = 0;
      } else if (res.status === SAVE_CONFLICT_STATUS) {
        // 같은 아동·같은 달이 이 창 밖(=다른 탭)에서 먼저 저장됐다.
        // 1계정 1기기(lib/auth.ts)라 '다른 기기'는 401 로 갈리므로 여기로 오지 않는다.
        // 어느 쪽을 남길지는 임상 서술이 걸린 결정이므로 반드시 사용자가 고른다.
        conflictRef.current = true;
        forceOverwriteRef.current = false;
        savePendingRef.current = false;
        saveFailRef.current = 0;
        setAutoStatus("conflict");
      } else if (res.status === 401) {
        // 이 계정은 단일 세션(lib/auth.ts createSession 이 기존 세션을 지운다)이라
        // 집에서 로그인하면 센터 PC 창은 쿠키만 남아 화면은 멀쩡한데 저장만 401 이 된다.
        // 재시도는 무의미 → 멈추고, 새 탭 로그인 후 이어서 저장하도록 안내한다.
        authFailedRef.current = true;
        savePendingRef.current = false;
        setAutoStatus("authError");
      } else {
        saveFailRef.current += 1;
        setAutoStatus("error"); // 조용히 실패하면 기록이 사라진 걸 아무도 모른다
        if (saveFailRef.current < 3) savePendingRef.current = true;
      }
    } catch {
      saveFailRef.current += 1;
      setAutoStatus("error");
      if (saveFailRef.current < 3) savePendingRef.current = true;
    } finally {
      savingRef.current = false;
      // 밀린 저장은 최신 값으로 다시 예약한다(옛 payload 를 그대로 재전송하지 않는다).
      if (savePendingRef.current) { savePendingRef.current = false; setSaveTick((t) => t + 1); }
    }
  }

  useEffect(() => {
    if (!childServiceId) return;
    if (loadedRecordId === null && !recordTouched.current) return;
    if (!restoreDone) return; // 저장본·일정표 응답이 1.8초를 넘겨도 옛값이 먼저 써지지 않게
    if (conflictRef.current) return; // 충돌 중 — 사용자가 고를 때까지 예약도 하지 않는다
    const t = window.setTimeout(() => { void autoSaveRecord(); }, 1800);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childServiceId, year, monthNumForLoad, rows, times, timeFixed, dates, vouchers, extras, amounts, results, statuses, mismatchReasons, retroReasons, opinion, fixedDays, outFormId, loadedRecordId, restoreDone, saveTick]);

  // 제공일자(월·일) = 실제 서비스이용일자(승인내역 원본). 예전엔 일정표 매칭일(useDays)을
  // 썼는데, 회기가 옮겨지거나 결제일과 어긋나면 승인내역·일정표 어디에도 없는 날짜가 찍혔음.
  const topCols = rows.map((s, i) => {
    const pu = parseYMD(s.use);
    const md = pu ? `${pu.mo}/${pu.d}` : s.use;
    return { i, md };
  });

  return (
    <div className="sheet" onChangeCapture={() => { recordTouched.current = true; }}>
      {/* 자동저장 실패 경고 — 데이터 소실 경고라 화면 아래가 아니라 상단에 고정해 둔다.
          (결과 서술을 길게 쓰며 스크롤하는 동안에도 눈에 들어와야 한다)
          이 시트는 카드 안이고 모바일에서 .card 가 overflow-x:auto 라 여기서는 sticky 가 죽는다
          → 최상위 자리(SAVE_ALERT_SLOT)로 포털해 띄운다. 내용·동작은 예전 하단 배너 그대로. */}
      {alertSlot && (autoStatus === "error" || autoStatus === "authError" || autoStatus === "conflict") &&
        createPortal(
          <div className="save-alert-sticky">
            {autoStatus === "conflict" ? (
              /* 같은 아동·같은 달을 다른 탭에서도 열어 둔 상태. 저장은 '병합'이 아니라 '전면 교체'라
                 어느 쪽이든 한쪽 내용은 사라진다 → 무엇을 잃는지 밝히고 사용자가 고르게 한다.
                 고를 때까지 자동저장은 멈춘다(conflictRef). */
              <div className="flash warn" style={{ margin: 0, fontWeight: 700, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", boxShadow: "0 2px 8px rgba(0,0,0,.08)" }}>
                <span>
                  ⚠ 이 달 기록지가 <b>이 창 밖에서 바뀌었어요</b>(같은 아동·같은 달을 열어 둔 다른 탭) — 지금 이 창의 내용은 아직 저장되지 않았습니다.
                  <br />
                  저장은 덧붙이기가 아니라 통째로 바꾸는 것이라 <b>나중에 저장한 쪽이 앞서 저장한 내용을 통째로 지웁니다.</b> 어느 쪽을 남길지 골라주세요.
                  <br />
                  <span style={{ fontWeight: 500 }}>
                    고르기 전에 <b>한글파일(.hwpx) 다운로드</b>로 지금 화면 내용을 받아두면 안전해요.
                  </span>
                </span>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ fontWeight: 700 }}
                  disabled={reloadingFromServer}
                  onClick={() => {
                    if (!confirm("서버에 저장된 최신 내용을 불러옵니다.\n지금 이 창에 쓴 내용(결과·종합의견 등)은 사라집니다. 계속할까요?")) return;
                    void reloadFromServer();
                  }}
                >
                  {reloadingFromServer ? "불러오는 중…" : "최신 내용 불러오기 (이 창에 쓴 내용은 사라짐)"}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  style={{ fontWeight: 700 }}
                  onClick={() => {
                    if (!confirm("이 창의 내용으로 저장합니다.\n다른 곳에서 저장한 내용은 사라집니다. 계속할까요?")) return;
                    forceOverwriteRef.current = true;
                    conflictRef.current = false;
                    recordTouched.current = true;
                    setAutoStatus("saving");
                    void autoSaveRecord();
                  }}
                >
                  이 창 내용으로 저장 (다른 곳의 내용을 덮어씀)
                </button>
              </div>
            ) : autoStatus === "error" ? (
              <div className="flash warn" style={{ margin: 0, fontWeight: 700, boxShadow: "0 2px 8px rgba(0,0,0,.08)" }}>
                ⚠ 저장에 실패했어요 — 다시 시도하고 있어요. 계속 이 표시가 남으면 인터넷 연결을 확인하고,
                창을 닫기 전에 <b>한글파일(.hwpx) 다운로드</b>로 작성 내용을 먼저 받아두세요.
              </div>
            ) : (
              <div className="flash warn" style={{ margin: 0, fontWeight: 700, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", boxShadow: "0 2px 8px rgba(0,0,0,.08)" }}>
                <span>
                  ⚠ 다른 기기에서 로그인되어 이 창은 <b>로그아웃된 상태</b>예요 — 지금은 저장되지 않습니다.
                  화면에 쓴 내용은 그대로 있으니, 새 탭에서 다시 로그인한 뒤 <b>지금 저장</b>을 누르세요.
                </span>
                <a className="btn btn-sm" href="/login" target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700 }}>
                  새 탭에서 다시 로그인 →
                </a>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  style={{ fontWeight: 700 }}
                  onClick={() => {
                    authFailedRef.current = false;
                    saveFailRef.current = 0;
                    recordTouched.current = true;
                    setAutoStatus("");
                    setSaveTick((t) => t + 1);
                  }}
                >
                  지금 저장
                </button>
              </div>
            )}
          </div>,
          alertSlot,
        )}
      <div className="sheet-title">발달재활서비스 제공 기록지 ({month}월)</div>
      <table className="meta-tbl">
        <tbody>
          <tr><td className="lbl">제공기관명</td><td colSpan={3}>{org}</td></tr>
          <tr>
            <td className="lbl">이용자</td><td>{childName}</td>
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
      <div
        style={{
          margin: "10px 0",
          padding: "8px 12px",
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-sm)",
          fontSize: 12.5,
          color: "var(--text-soft)",
          lineHeight: 1.6,
        }}
      >
        ✏️ <b style={{ background: "#FFF3D4", padding: "0 4px", borderRadius: 3 }}>노란색 칸</b>은 직접 수정할 수 있어요 — 제공일자(월·일), 시작·종료시간, 바우처(분)·추가구매(분), 총이용금액.
        바우처 지원금이 소진되는 마지막 회차는 보통 바우처 20분 / 추가구매 30분으로 바꿉니다. 저장하면 이 달 기록에 그대로 남습니다.
        <button
          type="button"
          className="btn btn-sm"
          style={{ marginLeft: 6, verticalAlign: "middle" }}
          onClick={() => {
            const last = rows.length - 1;
            if (last < 0) return;
            setVouchers((p) => p.map((v, i) => (i === last ? "20" : v)));
            setExtras((p) => p.map((v, i) => (i === last ? "30" : v)));
            recordTouched.current = true; // 버튼 클릭은 onChangeCapture 가 못 잡는다 → 자동저장 게이트 직접 해제
          }}
          title="마지막 회차의 바우처(분)·추가구매(분)만 20 / 30 으로 바꿉니다. 금액은 건드리지 않아요."
        >
          마지막 회차 20/30
        </button>
        <details style={{ marginTop: 6 }}>
          <summary style={{ cursor: "pointer" }}>⏱ 시작·종료시간이 자동으로 바뀌는 이유</summary>
          <div style={{ marginTop: 4 }}>
            시작·종료시간은 <b>결제내역(엑셀)</b>이 있으면 결제시간, 없으면 <b>일정표 시간</b>으로 자동으로 맞춰져요.
            직접 고친 칸은 <b>직접 수정</b> 표시가 붙고 그대로 지켜집니다(되돌리려면 그 칸의 ↺ 버튼).
          </div>
        </details>
      </div>
      {timeNotice && (
        <div className="tip" style={{ marginBottom: 10 }}>{timeNotice}</div>
      )}
      <div className="scroll">
        <table className="prov-tbl">
          <tbody>
            <tr>
              <th rowSpan={2} style={{ width: 90 }}>내용 / 월·일</th>
              {topCols.map((c) => (
                <th key={c.i} style={{ padding: 4 }}>
                  <input
                    value={dates[c.i] ?? ""}
                    onChange={(e) => setDate(c.i, e.target.value)}
                    style={{ width: 64, textAlign: "center", fontWeight: 700 }}
                    title="제공일자(월·일) — 직접 수정할 수 있어요. 하루 두 번 결제 등으로 실제 수업일과 다르면 여기서 고치세요(일정표는 안 바뀝니다)."
                  />
                </th>
              ))}
            </tr>
            <tr><td style={{ background: "#fff", border: "none" }}></td></tr>
            <tr>
              <td className="rowlbl">시작시간</td>
              {topCols.map((c) => (
                <td key={c.i}>
                  <input
                    value={times[c.i]?.start ?? ""}
                    onChange={(e) => setStart(c.i, e.target.value)}
                    style={timeFixed[c.i] ? FIXED_TIME_INPUT : undefined}
                  />
                  {timeFixed[c.i] && <div style={FIXED_TIME_TAG}>✎ 직접 수정</div>}
                </td>
              ))}
            </tr>
            <tr>
              <td className="rowlbl">종료시간</td>
              {topCols.map((c) => (
                <td key={c.i}>
                  <input
                    value={times[c.i]?.end ?? ""}
                    onChange={(e) => setEnd(c.i, e.target.value)}
                    style={timeFixed[c.i] ? FIXED_TIME_INPUT : undefined}
                  />
                  {timeFixed[c.i] && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
                      <span style={FIXED_TIME_TAG}>✎ 직접 수정</span>
                      <button
                        type="button"
                        onClick={() => revertTime(c.i)}
                        title={
                          excelEnds[c.i]
                            ? `결제내역(엑셀)의 결제시간 ${minusMin(excelEnds[c.i], 50)}~${excelEnds[c.i]} 으로 되돌립니다.`
                            : seedEnds[c.i]
                              ? `일정표 시간 ${minusMin(seedEnds[c.i], 50)}~${seedEnds[c.i]} 으로 되돌립니다.`
                              : "되돌릴 자동 시간이 없어 직접 수정 표시만 풉니다."
                        }
                        style={{
                          fontSize: 10.5, lineHeight: 1.2, padding: "1px 5px", cursor: "pointer",
                          border: "1px solid var(--border)", borderRadius: 999,
                          background: "var(--surface)", color: "var(--text-soft)", whiteSpace: "nowrap",
                        }}
                      >
                        ↺ {excelEnds[c.i] ? "결제시간" : seedEnds[c.i] ? "일정표" : "표시 풀기"}
                      </button>
                    </div>
                  )}
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
          // 제공일자 = 확정일(임상가가 고친 값 > 승인내역 서비스이용일자). 화면·출력·대조 모두 이 값.
          const useD = fixedDays[i] ?? null;
          const payD = pp ? pp.d : null;
          const hasBoth = useD !== null && payD !== null;
          const match = hasBoth && useD === payD;
          const isRetro = (s.payKind || "").includes("소급");
          // 일정표는 '예정일' — 확정 제공일과 다르면 예정이 바뀐 것이므로 그 회기에만 사유를 받는다.
          // (예정 13일 → 실제 20일 제공이면 20일 회기 한 칸에만 뜬다. 15일처럼 예정대로 한
          //  회기는 그대로 일치로 남는다.)
          const schedD = schedDays[i] ?? null;
          const schedMismatch = schedD !== null && useD !== null && schedD !== useD;
          // 사유는 여기 하나만 받는다 — 일정표 예정일과 기록지 확정일이 같은 회기는 사유 없음.
          // 결제일(승인일자)이 다른 건 사유 대상이 아니라 안내만(소급건은 아래 '소급 사유'가 따로 있다).
          const needReason = schedMismatch;
          return (
            <div
              key={i}
              className={"result-row" + (betaUx ? " compact" : "") + (needReason ? " mismatch" : "")}
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
                {!hasBoth && <span className="sub-mute" style={{ fontSize: 11.5 }}>(엑셀 미업로드)</span>}
                {schedMismatch && (
                  <span className="warnflag">⚠ 일정표 예정 {schedD}일 → 실제 제공 {useD}일 — 사유 작성 필요</span>
                )}
                {!schedMismatch && hasBoth && !match && (
                  <span className="sub-mute" style={{ fontSize: 11.5 }}>결제일이 제공일과 달라요(참고)</span>
                )}
                {!schedMismatch && schedD !== null && <span className="okflag">✓ 일정표와 같음</span>}
              </div>
              {(() => {
                // 결과가 기본(이전 화면 그대로). 상태·결과 분리 양식이면 오른쪽 위 토글로
                // '이용자 상태·부모상담' 작은 칸을 결과 오른쪽에 연다. 내용이 있으면 항상 열림
                // (숨겨진 채 출력되는 것 방지).
                const hasStatusText = (statuses[i] ?? "").trim() !== "";
                const stOpen = splitStatus && (statusOpen.has(i) || hasStatusText);
                return (
                  <>
                    {splitStatus && (
                      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
                        <button
                          type="button"
                          disabled={stOpen && hasStatusText}
                          title={stOpen && hasStatusText ? "내용이 있으면 닫히지 않아요(출력에 들어가요)" : "이 서식은 결과와 별도로 상태·부모상담 칸이 있어요"}
                          onClick={() => setStatusOpen((p) => { const n = new Set(p); if (stOpen) n.delete(i); else n.add(i); return n; })}
                          style={{ background: "none", border: "1px solid var(--border)", borderRadius: 8, padding: "3px 10px", fontSize: 12, color: "var(--primary)", cursor: stOpen && hasStatusText ? "default" : "pointer", fontWeight: 700 }}
                        >
                          {stOpen ? (hasStatusText ? "이용자 상태·부모상담 (작성 중)" : "이용자 상태·부모상담 닫기") : "+ 이용자 상태·부모상담"}
                        </button>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                      <textarea
                        className="textarea"
                        rows={betaUx ? 3 : 6}
                        value={results[i]}
                        placeholder=""
                        style={{ flex: 1, minWidth: 0 }}
                        onChange={(e) => setResults((p) => { const n = [...p]; n[i] = e.target.value; return n; })}
                      />
                      {stOpen && (
                        <textarea
                          className="textarea"
                          rows={betaUx ? 3 : 6}
                          value={statuses[i]}
                          placeholder="이용자 상태·부모상담"
                          style={{ flex: "0 0 38%", minWidth: 0 }}
                          onChange={(e) => setStatuses((p) => { const n = [...p]; n[i] = e.target.value; return n; })}
                        />
                      )}
                    </div>
                  </>
                );
              })()}
              {needReason && (
                <div style={{ marginTop: 8 }}>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--danger)", marginBottom: 4 }}>
                    일정 변경 사유
                  </label>
                  <input
                    className="input"
                    value={mismatchReasons[i]}
                    placeholder={`예) ${schedD}일 예정이었으나 아동 사정으로 ${useD}일에 제공함`}
                    onChange={(e) => setMismatchReasons((p) => { const n = [...p]; n[i] = e.target.value; return n; })}
                  />
                </div>
              )}
              {isRetro && (
                <div style={{ marginTop: 8 }}>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--danger)", marginBottom: 4 }}>
                    소급 사유
                  </label>
                  <input
                    className="input"
                    value={retroReasons[i]}
                    placeholder="예) 카드 미소지로 6/8 수업 후 소급결제 진행함"
                    onChange={(e) => setRetroReasons((p) => { const n = [...p]; n[i] = e.target.value; return n; })}
                  />
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>
                    기록지 결과 칸 아래에 <b>* 소급 사유: …</b> 로 표기돼요.
                  </div>
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
          rows={betaUx ? 3 : 5}
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
          title="가장 최근 기록(최대 3개월 전까지)의 결과·총평을 복사 — 어느 달에서 가져왔는지 아래에 표시됩니다 (수정 후 저장)"
        >
          전월 기록 가져오기
        </button>
        {savedForms.length > 0 ? (
          <select
            value={outFormId}
            onChange={(e) => setOutFormId(e.target.value ? Number(e.target.value) : "")}
            title="출력 양식 — 우리 센터 양식 또는 발달바우처 기본 서식"
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 13, color: "var(--text)" }}
          >
            <option value="">발달바우처 기본 서식</option>
            {savedForms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        ) : (
          <Link href="/forms" className="sub-mute" style={{ fontSize: 12, whiteSpace: "nowrap" }} title="우리 센터 양식을 올리면 평소 쓰던 양식으로 출력돼요(안 올리면 발달바우처 기본 서식 사용)">
            발달바우처 기본 서식 사용 중 · <b>우리 센터 양식 올리기 →</b>
          </Link>
        )}
        <button className="btn btn-primary" onClick={() => downloadHwpx()} disabled={downloading}>
          {downloading ? "생성 중..." : "한글파일(.hwpx) 다운로드"}
        </button>
        {/* 구버전 한글용 .hwp — 내장 기본 서식, 또는 .hwp 원본을 보관 중인 저장 양식에서 지원. */}
        {((!outFormId && recordForm !== "dongtan" && recordForm !== "namyangju") ||
          (savedForms.find((f) => f.id === outFormId)?.hasHwp ?? false)) && (
          <button
            className="btn"
            onClick={() => downloadHwpx("hwp")}
            disabled={downloading}
            title="한글 2002~2014 같은 구버전에서도 수정할 수 있는 형식이에요. hwpx가 읽기 전용으로 열리는 센터에 제출할 때 쓰세요."
          >
            구버전용(.hwp)
          </button>
        )}
      </div>
      <div className="sub-mute" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.6 }}>
        💾 작성하면 <b>자동으로 저장</b>돼요{autoStatus === "saving" ? " (저장 중…)" : autoStatus === "saved" ? " ✓ 저장됨" : ""}.
        다른 컴퓨터(집·센터 등)에서도 위에서 <b>같은 아동·월</b>을 고르면 이어서 작성할 수 있어요.
        {/* 실패 안내 본문은 화면 위 고정 배너에만 둔다(위아래 중복 금지). 여기서는 가리키기만. */}
        {autoStatus === "error" && <b style={{ color: "var(--danger)" }}> ⚠ 지금은 저장 실패 — 화면 위 안내를 확인하세요.</b>}
        {autoStatus === "authError" && <b style={{ color: "var(--danger)" }}> ⚠ 로그아웃되어 저장되지 않았어요 — 화면 위 안내를 확인하세요.</b>}
        {autoStatus === "conflict" && <b style={{ color: "var(--danger)" }}> ⚠ 이 창 밖에서 바뀌어 지금은 저장이 멈춰 있어요 — 화면 위 안내에서 골라주세요.</b>}
      </div>
    </div>
  );
}
