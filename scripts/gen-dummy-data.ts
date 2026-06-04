// 튜토리얼 영상용 더미 엑셀 2종 생성 (가상 데이터 — 실제 인물 아님).
//  1) 아동등록_샘플.xlsx        : [내 아동 → 엑셀로 가져오기] 데모용 (바로일지 양식)
//  2) 서비스제공내역_샘플.xlsx  : [기록지 자동완성] · [승인내역 점검] 데모용 (전자바우처 모사)
// 가상 아동 12명 · 소급결제 3건 · 결제시간 겹침(점검 위반) 3건 포함.
// 실행: node --experimental-strip-types scripts/gen-dummy-data.ts
import * as XLSX from "xlsx";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = "docs/dummy";
mkdirSync(OUT, { recursive: true });
const pad = (n: number) => String(n).padStart(2, "0");
const DOW_KO = ["일", "월", "화", "수", "목", "금", "토"];

// 표준 회기 시간대 (lib/constants SLOTS 와 동일)
const SLOTS = [
  "09:00-09:50", "09:50-10:40", "10:40-11:30", "11:30-12:20",
  "13:30-14:20", "14:20-15:10", "15:10-16:00", "16:00-16:50",
  "16:50-17:40", "17:40-18:30", "18:30-19:20",
];
const startOf = (s: string) => s.split("-")[0];
const endOf = (s: string) => s.split("-")[1];
const addMin = (hhmm: string, mins: number) => {
  const [h, mn] = hhmm.split(":").map(Number);
  const t = h * 60 + mn + mins;
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
};

// ── 가상 아동 12명 (실제 인물 아님). dows: 1=월~5=금 ─────────────
type Child = { name: string; birth: string; dows: number[]; copay: number; slot?: string };
const CAST: Child[] = [
  { name: "김하늘", birth: "2019.03.05", dows: [1, 3], copay: 40000 },
  { name: "이바다", birth: "2020.07.21", dows: [2, 4], copay: 40000 },
  { name: "박가온", birth: "2018.11.02", dows: [1, 5], copay: 20000 },
  { name: "정아라", birth: "2021.01.15", dows: [3, 5], copay: 0 },
  { name: "최도윤", birth: "2019.09.09", dows: [2, 5], copay: 80000 },
  { name: "한서준", birth: "2020.02.18", dows: [1, 4], copay: 40000 },
  { name: "오지우", birth: "2018.06.30", dows: [2, 3], copay: 60000 },
  { name: "윤서아", birth: "2021.05.11", dows: [4, 5], copay: 0 },
  { name: "임도현", birth: "2019.12.25", dows: [1, 2], copay: 40000 },
  { name: "강시우", birth: "2020.10.08", dows: [3, 4], copay: 20000 },
  { name: "조하린", birth: "2018.08.14", dows: [1, 3], copay: 80000 },
  { name: "배은우", birth: "2021.04.02", dows: [2, 4], copay: 40000 },
];

// 같은 요일에 같은 시간대가 겹치지 않도록 시간대 자동 배정 (→ 자연발생 위반 0)
const usage = new Map<number, Set<number>>(); // weekday → 사용된 slot index
for (const c of CAST) {
  let chosen = -1;
  for (let i = 0; i < SLOTS.length; i++) {
    if (c.dows.every((d) => !(usage.get(d)?.has(i)))) { chosen = i; break; }
  }
  if (chosen < 0) chosen = 0;
  c.slot = SLOTS[chosen];
  for (const d of c.dows) {
    if (!usage.has(d)) usage.set(d, new Set());
    usage.get(d)!.add(chosen);
  }
}

const UNIT = 35000;
const ORG = "햇살아동발달센터";
const THERAPIST = "김다정";

// ── 1) 아동등록_샘플.xlsx ────────────────────────────────────────
{
  const header = ["성명", "생년월일", "시간", "요일", "단가", "본인부담금", "목표 회기", "메모"];
  const rows = CAST.map((c) => [
    c.name, c.birth, c.slot!.replace("-", "~"),
    c.dows.map((d) => DOW_KO[d]).join(", "),
    UNIT, c.copay, 8, "",
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws["!cols"] = [{ wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 11 }, { wch: 10 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "아동등록");
  writeFileSync(`${OUT}/아동등록_샘플.xlsx`, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  console.log(`작성: 아동등록_샘플.xlsx (아동 ${CAST.length}명)`);
}

// ── 2) 서비스제공내역_샘플.xlsx (전자바우처 모사) ─────────────────
{
  const Y = 2026, M = 6;
  const dim = new Date(Y, M, 0).getDate();
  type Row = { name: string; birth: string; use: string; start: string; end: string; pay: string; payTime: string; appr: string; amt: number; org: string; kind: string };
  const data: Row[] = [];
  let seq = 1;
  for (let d = 1; d <= dim; d++) {
    const wd = new Date(Y, M - 1, d).getDay();
    for (const c of CAST) {
      if (!c.dows.includes(wd)) continue;
      const use = `${Y}.${pad(M)}.${pad(d)}`;
      data.push({
        name: c.name, birth: c.birth, use,
        start: startOf(c.slot!), end: endOf(c.slot!),
        pay: use, payTime: addMin(endOf(c.slot!), 2),
        appr: `V${Y}${pad(M)}${pad(d)}${pad(seq++)}`,
        amt: UNIT, org: ORG, kind: "정상결제",
      });
    }
  }

  // (a) 소급결제 3건 — 서로 다른 아동의 첫 회기를 다음달 초 결제로
  const retroNames = ["박가온", "윤서아", "강시우"];
  for (const nm of retroNames) {
    const r = data.find((x) => x.name === nm);
    if (r) { r.kind = "소급결제"; r.pay = `${Y}.${pad(M + 1)}.${pad(2 + retroNames.indexOf(nm))}`; }
  }

  // (b) 결제시간 겹침(점검 위반) 3건 — 회기 2개 이상인 날 3곳에서 한 쌍을 16분 간격으로
  const byDay = new Map<string, Row[]>();
  for (const r of data) {
    if (r.kind === "소급결제") continue;          // 소급은 결제일이 달라 제외
    (byDay.get(r.use) ?? byDay.set(r.use, []).get(r.use)!).push(r);
  }
  const dayKeys = [...byDay.keys()].filter((k) => (byDay.get(k)!.length >= 2)).sort();
  // 가운데쪽 날짜 3개 선택(겹치지 않게)
  const picks = [dayKeys[2], dayKeys[Math.floor(dayKeys.length / 2)], dayKeys[dayKeys.length - 3]]
    .filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 3);
  const violationNote: string[] = [];
  for (const key of picks) {
    // 그날 마지막 두 회기를 16분 간격으로 → 뒤에 회기가 없어 연쇄 위반 방지(정확히 1건/날)
    const rows = byDay.get(key)!.slice().sort((a, b) => a.payTime.localeCompare(b.payTime));
    const a = rows[rows.length - 2], b = rows[rows.length - 1];
    b.payTime = addMin(a.payTime, 16);
    violationNote.push(`${key} (${a.name} ${a.payTime} ↔ ${b.name} ${b.payTime})`);
  }

  data.sort((a, b) => a.use.localeCompare(b.use) || a.payTime.localeCompare(b.payTime));

  const headerRow = ["대상자", "생년월일", "서비스이용일자", "서비스시작시간", "서비스종료시간", "결제일자", "결제시간", "승인번호", "결제금액", "제공기관명", "결제구분"];
  const aoa: (string | number)[][] = [
    ["사회서비스 전자바우처 — 서비스제공내역(샘플·가상데이터)"],
    ["제공기관명", ORG, "", "제공인력 이름", THERAPIST, "", `${Y}년 ${M}월`],
    [],
    headerRow,
    ...data.map((r) => [r.name, r.birth, r.use, r.start, r.end, r.pay, r.payTime, r.appr, r.amt, r.org, r.kind]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 9 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "서비스제공내역");
  writeFileSync(`${OUT}/서비스제공내역_샘플.xlsx`, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  console.log(`작성: 서비스제공내역_샘플.xlsx (${data.length}행 · 소급 ${retroNames.length}건 · 겹침 ${picks.length}건)`);
  console.log("  겹침 시연일:", violationNote.join(" / "));
}
console.log("완료 →", OUT);
