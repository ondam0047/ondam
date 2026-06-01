// 영상 촬영용 가짜 서비스제공내역 엑셀 3종 생성.
// 실행: npm run seed:demo-excel
//
// 출력:
//   samples/demo/서비스제공내역_정상.xlsx
//   samples/demo/서비스제공내역_위반.xlsx   (간격 위반 1~2건 포함)
//   samples/demo/서비스제공내역_소급.xlsx   (소급결제 1건 포함)
//
// 시드 데이터(seed-demo.ts) 와 일관된 아동·승인번호·날짜 구조.

import * as XLSX from "xlsx";
import { mkdirSync } from "node:fs";
import path from "node:path";

const OUT_DIR = path.join(process.cwd(), "samples", "demo");
mkdirSync(OUT_DIR, { recursive: true });

const CENTER_NAME = "꿈나라발달언어센터";
const THERAPIST_NAME = "김다온";

// 시드와 동일한 12명 + 같은 요일·시간대 패턴.
const CHILDREN: Array<{
  name: string;
  birth: string;
  dows: number[];      // 0=일 ... 6=토
  start: string;
  end: string;
  count: number;
}> = [
  { name: "김가나", birth: "19.05.12", dows: [1, 4], start: "09:00", end: "09:50", count: 8 },
  { name: "이다라", birth: "20.03.08", dows: [1, 4], start: "09:50", end: "10:40", count: 8 },
  { name: "박마바", birth: "18.11.22", dows: [1, 4], start: "10:40", end: "11:30", count: 8 },
  { name: "최사아", birth: "21.01.30", dows: [2, 5], start: "09:00", end: "09:50", count: 8 },
  { name: "정자차", birth: "20.07.14", dows: [2, 5], start: "09:50", end: "10:40", count: 8 },
  { name: "강카타", birth: "19.09.03", dows: [2, 5], start: "10:40", end: "11:30", count: 8 },
  { name: "윤파하", birth: "17.12.18", dows: [3],    start: "13:30", end: "14:20", count: 4 },
  { name: "임가다", birth: "20.02.25", dows: [1, 4], start: "13:30", end: "14:20", count: 8 },
  { name: "송라마", birth: "21.06.07", dows: [1, 4], start: "14:20", end: "15:10", count: 8 },
  { name: "조바사", birth: "19.04.11", dows: [2, 5], start: "13:30", end: "14:20", count: 8 },
  { name: "한아자", birth: "20.10.21", dows: [2, 5], start: "15:10", end: "16:00", count: 8 },
  { name: "백차카", birth: "18.08.05", dows: [3],    start: "16:00", end: "16:50", count: 4 },
];

function pad(n: number) { return String(n).padStart(2, "0"); }

// 지난달 기준으로 데이터 생성 (영상에서 '지난달 엑셀 도착' 시나리오).
function lastMonth() {
  const now = new Date();
  const t = now.getFullYear() * 12 + now.getMonth() - 1;
  return { year: Math.floor(t / 12), month: (t % 12) + 1 };
}

function daysOfMonth(year: number, month: number, dows: number[], take: number): number[] {
  const dim = new Date(year, month, 0).getDate();
  const out: number[] = [];
  for (let d = 1; d <= dim; d++) {
    if (dows.includes(new Date(year, month - 1, d).getDay())) out.push(d);
    if (out.length >= take) break;
  }
  return out;
}

let apprCounter = 5000;
function genApprNum(): string {
  apprCounter += 1;
  return `5009${String(apprCounter).padStart(8, "0")}`;
}

// 결제 시간 — 회기 종료 + 1~3분 (정상). 위반 케이스는 호출자가 직접 지정.
function payTimeAfter(endHHMM: string, addMin: number): string {
  const [h, m] = endHHMM.split(":").map(Number);
  const tot = h * 60 + m + addMin;
  return `${pad(Math.floor(tot / 60))}:${pad(tot % 60)}`;
}

type Row = {
  대상자: string;
  생년월일: string;
  서비스이용일자: string;
  서비스시작시간: string;
  서비스종료시간: string;
  결제일자: string;
  결제시간: string;
  승인번호: string;
  결제금액: string;
  결제구분: string;
  제공기관명: string;
};

// 정상 시나리오 — 12명 × N회기 (한 행 = 한 회기), 결제 간격 정상.
function buildRows(opts: { violationCount?: number; retroCount?: number } = {}): Row[] {
  const { year, month } = lastMonth();
  const rows: Row[] = [];

  for (const c of CHILDREN) {
    const days = daysOfMonth(year, month, c.dows, c.count);
    for (const d of days) {
      const useDate = `${year}.${pad(month)}.${pad(d)}`;
      rows.push({
        대상자: c.name,
        생년월일: c.birth,
        서비스이용일자: useDate,
        서비스시작시간: c.start,
        서비스종료시간: c.end,
        결제일자: useDate,
        결제시간: payTimeAfter(c.end, 2 + Math.floor(Math.random() * 2)),
        승인번호: genApprNum(),
        결제금액: "65,000",
        결제구분: "정상결제",
        제공기관명: CENTER_NAME,
      });
    }
  }

  // 정렬: 결제일자 → 결제시간 (실제 엑셀처럼)
  rows.sort((a, b) =>
    a.결제일자 === b.결제일자
      ? a.결제시간.localeCompare(b.결제시간)
      : a.결제일자.localeCompare(b.결제일자)
  );

  // 위반 시나리오 — 같은 날 연속 결제 사이 간격을 강제로 너무 짧게 조작.
  // 예: 결제 N 의 시간을 직전 결제 + 25분 으로 (정상 50분 대비 너무 가까움).
  if (opts.violationCount && opts.violationCount > 0) {
    let tweaked = 0;
    for (let i = 1; i < rows.length && tweaked < opts.violationCount; i++) {
      if (rows[i].결제일자 !== rows[i - 1].결제일자) continue;
      const prev = rows[i - 1].결제시간;
      const [h, m] = prev.split(":").map(Number);
      const tot = h * 60 + m + 25; // 25분 후 = 너무 가까움
      rows[i].결제시간 = `${pad(Math.floor(tot / 60))}:${pad(tot % 60)}`;
      tweaked += 1;
    }
  }

  // 소급결제 시나리오 — N개의 서로 다른 아동의 회기를 각각 1건씩 소급결제로 표시.
  // (분산되어야 영상 시연·UX 테스트에 더 자연스러움)
  if (opts.retroCount && opts.retroCount > 0) {
    const used = new Set<string>();
    let placed = 0;
    // 뒤에서부터 훑되, 아동별 1건씩만 표시
    for (let i = rows.length - 1; i >= 0 && placed < opts.retroCount; i--) {
      const child = rows[i].대상자;
      if (!used.has(child)) {
        rows[i].결제구분 = "소급결제";
        used.add(child);
        placed += 1;
      }
    }
  }

  return rows;
}

// 실제 전자바우처 엑셀처럼 상단에 메타 정보 행 → 빈 줄 → 헤더 → 데이터.
function writeWorkbook(rows: Row[], outName: string) {
  // 메타 행: '제공인력 이름' 키 다음 셀에 값 (RecordClient 가 그렇게 파싱).
  const meta = [
    ["발달재활서비스 서비스제공내역", "", "", "", "", "", "", "", "", "", ""],
    ["제공기관명", CENTER_NAME, "", "제공인력 이름", THERAPIST_NAME, "", "", "", "", "", ""],
    [],
  ];

  const header = [
    "대상자", "생년월일",
    "서비스이용일자", "서비스시작시간", "서비스종료시간",
    "결제일자", "결제시간",
    "승인번호", "결제금액", "결제구분",
    "제공기관명",
  ];

  const data = rows.map((r) => [
    r.대상자, r.생년월일,
    r.서비스이용일자, r.서비스시작시간, r.서비스종료시간,
    r.결제일자, r.결제시간,
    r.승인번호, r.결제금액, r.결제구분,
    r.제공기관명,
  ]);

  const aoa = [...meta, header, ...data];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "서비스제공내역");

  const outPath = path.join(OUT_DIR, outName);
  XLSX.writeFile(wb, outPath);
  console.log(`✓ ${outPath} (${rows.length} 회기)`);
}

function main() {
  console.log("📊 데모 엑셀 생성...");

  apprCounter = 5000;
  writeWorkbook(buildRows(), "서비스제공내역_정상.xlsx");

  apprCounter = 6000;
  writeWorkbook(buildRows({ violationCount: 2 }), "서비스제공내역_위반.xlsx");

  apprCounter = 7000;
  writeWorkbook(buildRows({ retroCount: 3 }), "서비스제공내역_소급.xlsx");

  console.log("\n✅ 완료. samples/demo/ 폴더에 3개 파일 생성됨.");
  console.log("   영상 촬영 시 이 엑셀을 기록지·승인내역 점검 페이지에 드래그.");
}

main();
