// 달력 탐지+배치 검증 (일회성). lib 로직을 그대로 복제해 실제 양식에 대해 결과 출력.
import { readFileSync } from "node:fs";

function parseTables(xml) {
  const tbls = []; let p = 0;
  while (true) {
    const a = xml.indexOf("<hp:tbl", p); if (a < 0) break;
    const b = xml.indexOf("</hp:tbl>", a); if (b < 0) break;
    const t = xml.slice(a, b + 9); p = b + 9;
    const cells = []; let q = 0;
    while (true) {
      const ca = t.indexOf("<hp:tc", q); if (ca < 0) break;
      const cb = t.indexOf("</hp:tc>", ca); if (cb < 0) break;
      const c = t.slice(ca, cb + 8); q = cb + 8;
      const ad = c.match(/<hp:cellAddr colAddr="(\d+)" rowAddr="(\d+)"/);
      const sp = c.match(/<hp:cellSpan colSpan="(\d+)" rowSpan="(\d+)"/);
      const ts = [...c.matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/g)].map((m) => m[1]);
      const text = ts.join("").replace(/\s+/g, " ").trim();
      if (ad) cells.push({ r: +ad[2], c: +ad[1], cs: sp ? +sp[1] : 1, rs: sp ? +sp[2] : 1, text, norm: text.replace(/\s/g, "") });
    }
    tbls.push(cells);
  }
  return tbls;
}
const WD = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
const WN = ["일", "월", "화", "수", "목", "금", "토"];

function detect(tbls, candidates) {
  for (const ti of candidates) {
    const t = tbls[ti]; if (!t) continue;
    const rows = [...new Set(t.map((c) => c.r))].sort((a, b) => a - b);
    for (const hr of rows) {
      const wd = t.filter((c) => c.r === hr && c.norm.length === 1 && WD[c.norm] !== undefined).sort((a, b) => a.c - b.c);
      if (wd.length < 4) continue;
      const cols = wd.map((c) => ({ dow: WD[c.norm], startCol: c.c, span: c.cs }));
      const bodyRows = rows.filter((r) => r > hr);
      const weeks = []; const span0 = cols[0].span, c0 = cols[0].startCol;
      for (let i = 0; i + 1 < bodyRows.length; i += 2) {
        const ra = bodyRows[i], rb = bodyRows[i + 1];
        const aCell = t.find((c) => c.r === ra && c.c === c0);
        const aIsContent = span0 > 1 && aCell != null && aCell.cs === span0;
        weeks.push(aIsContent ? { numberRow: rb, contentRow: ra } : { numberRow: ra, contentRow: rb });
      }
      if (!weeks.length) continue;
      return { table: ti, headerRow: hr, leftmostDow: cols[0].dow, cols, weeks };
    }
  }
  return null;
}
function place(cal, year, month, sessions) {
  const dim = new Date(year, month, 0).getDate();
  const firstDow = new Date(year, month - 1, 1).getDay();
  const colByDow = new Map(cal.cols.map((c) => [c.dow, c]));
  const timeByDay = new Map(sessions.map((s) => [s.day, s.time]));
  const dayPos = new Map(); let week = 0;
  for (let d = 1; d <= dim; d++) {
    const dow = (firstDow + d - 1) % 7;
    if (d > 1 && dow === cal.leftmostDow) week++;
    dayPos.set(d, { week, dow });
  }
  const dayAt = (w, dow) => { for (const [d, pos] of dayPos) if (pos.week === w && pos.dow === dow) return d; return null; };
  const lines = [];
  for (let w = 0; w < cal.weeks.length; w++) {
    const cells = cal.cols.map((col) => {
      const d = dayAt(w, col.dow);
      const time = d ? (timeByDay.get(d) ?? "") : "";
      return `${WN[col.dow]}:${d ?? "·"}${time ? `(${time})` : ""}`;
    });
    lines.push(`주${w}: ` + cells.join("  "));
  }
  return lines;
}

const file = process.argv[2];
const tbls = parseTables(readFileSync(file, "utf8"));
const cal = detect(tbls, tbls.map((_, i) => i));
if (!cal) { console.log("달력 미탐지"); process.exit(0); }
console.log(`달력=표${cal.table} 헤더행=${cal.headerRow} 요일=${cal.cols.map((c) => WN[c.dow]).join("")} 주수=${cal.weeks.length}`);
console.log(`주행쌍: ${cal.weeks.map((w) => `(숫자${w.numberRow}/내용${w.contentRow})`).join(" ")}`);
console.log("\n=== 2026년 6월, 회기 3·9·16·23·30 (10:00~10:50) ===");
const sess = [3, 9, 16, 23, 30].map((d) => ({ day: d, time: "10:00~10:50" }));
for (const l of place(cal, 2026, 6, sess)) console.log(l);
