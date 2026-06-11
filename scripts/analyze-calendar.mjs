// 일정표 양식의 달력/격자 구조 분석용 (일회성).
// 사용: node scripts/analyze-calendar.mjs <section0.xml 경로>
import { readFileSync } from "node:fs";

function parseTables(xml) {
  const tbls = [];
  let p = 0;
  while (true) {
    const a = xml.indexOf("<hp:tbl", p); if (a < 0) break;
    const b = xml.indexOf("</hp:tbl>", a); if (b < 0) break;
    const head = xml.slice(a, xml.indexOf(">", a) + 1);
    const rc = head.match(/rowCnt="(\d+)"/)?.[1];
    const cc = head.match(/colCnt="(\d+)"/)?.[1];
    const t = xml.slice(a, b + 9); p = b + 9;
    const cells = []; let q = 0;
    while (true) {
      const ca = t.indexOf("<hp:tc", q); if (ca < 0) break;
      const cb = t.indexOf("</hp:tc>", ca); if (cb < 0) break;
      const c = t.slice(ca, cb + 8); q = cb + 8;
      const ad = c.match(/<hp:cellAddr colAddr="(\d+)" rowAddr="(\d+)"/);
      const sp = c.match(/<hp:cellSpan colSpan="(\d+)" rowSpan="(\d+)"/);
      const sz = c.match(/<hp:cellSz width="(\d+)" height="(\d+)"/);
      const ts = [...c.matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/g)].map((m) => m[1]);
      const text = ts.join("").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
      const pc = (c.match(/<hp:p\b/g) || []).length;
      if (ad) cells.push({ r: +ad[2], c: +ad[1], cs: sp ? +sp[1] : 1, rs: sp ? +sp[2] : 1, p: pc, w: sz ? +sz[1] : 0, h: sz ? +sz[2] : 0, text });
    }
    tbls.push({ rowCnt: rc ? +rc : null, colCnt: cc ? +cc : null, cells });
  }
  return tbls;
}

const xml = readFileSync(process.argv[2], "utf8");
const tbls = parseTables(xml);
console.log(`표 ${tbls.length}개\n`);
for (let i = 0; i < tbls.length; i++) {
  const { rowCnt, colCnt, cells } = tbls[i];
  const rows = [...new Set(cells.map((c) => c.r))].sort((a, b) => a - b);
  const cols = [...new Set(cells.map((c) => c.c))].sort((a, b) => a - b);
  const txt = cells.map((c) => c.text).join(" ").slice(0, 80);
  const isCal = /[일월화수목금토]/.test(txt) && cells.filter((c) => /^[일월화수목금토]$/.test(c.text)).length >= 4;
  console.log(`[표${i}] rowCnt=${rowCnt} colCnt=${colCnt} rows=${rows.length} cols=${cols.length} cells=${cells.length}${isCal ? "  <<< 달력후보" : ""}`);
  console.log(`   요약: ${txt}`);
  // 달력 후보면 격자 전체 덤프
  if (isCal || process.argv[3] === "all") {
    for (const r of rows) {
      const rc = cells.filter((c) => c.r === r).sort((a, b) => a.c - b.c);
      const line = rc.map((c) => `c${c.c}${c.cs > 1 || c.rs > 1 ? `(${c.cs}x${c.rs})` : ""}:${JSON.stringify(c.text).slice(0, 14)}[p${c.p}]`).join(" | ");
      console.log(`   r${r}: ${line}`);
    }
  }
  console.log("");
}
