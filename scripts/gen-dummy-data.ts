// 튜토리얼 영상용 더미 엑셀 2종 생성 (가상 데이터 — 실제 인물 아님).
//  1) 아동등록_샘플.xlsx        : [내 아동 → 엑셀로 가져오기] 데모용 (바로일지 양식)
//  2) 서비스제공내역_샘플.xlsx  : [기록지 자동완성] · [승인내역 점검] 데모용 (전자바우처 모사)
// 실행: node --experimental-strip-types scripts/gen-dummy-data.ts
import * as XLSX from "xlsx";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = "docs/dummy";
mkdirSync(OUT, { recursive: true });
const pad = (n: number) => String(n).padStart(2, "0");

// ── 가상 아동 명단 (실제 인물 아님) ──────────────────────────────
// dow: 0=일 1=월 2=화 3=수 4=목 5=금 6=토
const CAST = [
  { name: "김하늘", birth: "2019.03.05", dows: [1, 3], slot: "10:00-10:50", copay: 40000 },
  { name: "이바다", birth: "2020.07.21", dows: [2, 4], slot: "13:30-14:20", copay: 40000 },
  { name: "박가온", birth: "2018.11.02", dows: [1, 5], slot: "15:10-16:00", copay: 20000 },
  { name: "정아라", birth: "2021.01.15", dows: [3, 5], slot: "11:30-12:20", copay: 0 },
  { name: "최도윤", birth: "2019.09.09", dows: [2, 5], slot: "16:00-16:50", copay: 80000 },
];
const UNIT = 35000;          // 2026 회당 단가
const ORG = "햇살아동발달센터"; // 가상 제공기관
const THERAPIST = "김다정";    // 가상 제공인력
const DOW_KO = ["일", "월", "화", "수", "목", "금", "토"];

// ── 1) 아동등록_샘플.xlsx ────────────────────────────────────────
{
  const header = ["성명", "생년월일", "시간", "요일", "단가", "본인부담금", "목표 회기", "메모"];
  const rows = CAST.map((c) => [
    c.name, c.birth, c.slot.replace("-", "~"),
    c.dows.map((d) => DOW_KO[d]).join(", "),
    UNIT, c.copay, 8, "",
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws["!cols"] = [{ wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 11 }, { wch: 10 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "아동등록");
  writeFileSync(`${OUT}/아동등록_샘플.xlsx`, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  console.log("작성: 아동등록_샘플.xlsx");
}

// ── 2) 서비스제공내역_샘플.xlsx (전자바우처 모사) ─────────────────
{
  const Y = 2026, M = 6;                 // 2026년 6월
  const dim = new Date(Y, M, 0).getDate();
  const endOf = (slot: string) => slot.split("-")[1];           // "10:50"
  const startOf = (slot: string) => slot.split("-")[0];
  const addMin = (hhmm: string, mins: number) => {
    const [h, mn] = hhmm.split(":").map(Number);
    let t = h * 60 + mn + mins;
    return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
  };

  type Row = { name: string; birth: string; use: string; start: string; end: string; pay: string; payTime: string; appr: string; amt: number; org: string; kind: string };
  const data: Row[] = [];
  let seq = 1;
  for (let d = 1; d <= dim; d++) {
    const wd = new Date(Y, M - 1, d).getDay();
    for (const c of CAST) {
      if (!c.dows.includes(wd)) continue;
      const use = `${Y}.${pad(M)}.${pad(d)}`;
      const row: Row = {
        name: c.name, birth: c.birth, use,
        start: startOf(c.slot), end: endOf(c.slot),
        pay: use, payTime: addMin(endOf(c.slot), 2),  // 결제시간 = 종료 +2분
        appr: `V${Y}${pad(M)}${pad(d)}${pad(seq++)}`,
        amt: UNIT, org: ORG, kind: "정상결제",
      };
      data.push(row);
    }
  }

  // ── 시연용 이상치 2건 ──
  // (a) 소급결제: 박가온 첫 회기를 다음달 초 결제로
  const retro = data.find((r) => r.name === "박가온");
  if (retro) { retro.kind = "소급결제"; retro.pay = `${Y}.${pad(M + 1)}.02`; }
  // (b) 결제시간 겹침: 6/10(수) 정아라 결제시간을 김하늘 직후(<40분)로 당김 → 점검에서 빨간색
  const t1 = data.find((r) => r.name === "김하늘" && r.use === `${Y}.06.10`);
  const t2 = data.find((r) => r.name === "정아라" && r.use === `${Y}.06.10`);
  if (t1 && t2) { t1.payTime = "10:52"; t2.payTime = "11:08"; } // 16분 간격 → 위반 시연

  // 정렬: 일자→결제시간
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
  console.log(`작성: 서비스제공내역_샘플.xlsx (${data.length}행, 소급 1건·겹침 시연 1쌍)`);
}
console.log("완료 →", OUT);
