// 기록지 양식 자동매핑 리졸버 — PoC (결정론, 라벨+표 기하).
// 입력: 빈/채워진 발달바우처 제공기록지 .hwpx 의 Contents/section0.xml 경로(들).
// 출력: 양식별 CoordSpec(좌표맵: [table,row,col]) + 필드 커버리지.
//
// 실행:
//   1) .hwpx 압축 해제:  unzip -o form.hwpx "Contents/section0.xml" -d /tmp/x
//   2) node scripts/resolver-poc.mjs /tmp/x/Contents/section0.xml [...]
//
// 검증: 사용자 실제 6종(원주·대구파주·순천·남양주·발달제공·복사본)에서 핵심 필드 100% 매핑.
// 설계 문서: C:\Users\user\Downloads\기록지양식.md
//
// 본 구현 시 lib/record-resolver.ts 로 승격 + lib/hwpx.ts(readSection0)로 .hwpx 직접 파싱.

import { readFileSync } from "node:fs";

// ── HWPX 표 격자 파서 ──
export function parseTables(xml) {
  const tbls = [];
  let p = 0;
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
      const text = ts.join("").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
      const pc = (c.match(/<hp:p\b/g) || []).length;
      if (ad) cells.push({ r: +ad[2], c: +ad[1], cs: sp ? +sp[1] : 1, rs: sp ? +sp[2] : 1, p: pc, text, norm: text.replace(/\s/g, "") });
    }
    tbls.push(cells);
  }
  return tbls;
}

const isNote = (s) => /☞/.test(s) || /(표기합니다|기재하|바랍니다|받아야|확인하고)/.test(s) || s.length > 24;
const rowCells = (t, r) => t.filter((c) => c.r === r).sort((a, b) => a.c - b.c);
const DATEX = new Set(["누계", "합계", "소계", "계"]);

export function resolve(tbls) {
  const spec = { _cov: {} };

  // HEADER: 라벨 → 같은 행 오른쪽 인접 셀(라벨 colSpan 다음 칸)
  const headerLabels = { org: /제공기관명/, serviceArea: /제공영역/, name: /성명/, birth: /생년월일/ };
  for (let ti = 0; ti < tbls.length; ti++) {
    for (const cell of tbls[ti]) {
      if (isNote(cell.text)) continue;
      for (const [key, re] of Object.entries(headerLabels)) {
        if (spec[key]) continue;
        if (re.test(cell.norm) && cell.norm.length <= 8) {
          const val = tbls[ti].find((x) => x.r === cell.r && x.c === cell.c + cell.cs);
          if (val) spec[key] = [ti, val.r, val.c];
        }
      }
    }
  }

  // DATE AXIS: '월일'+'내용' 셀이 있는 표/행 → 라벨 span 뒤 칸들(누계 등 제외, 앞 5개)
  let dt = -1, drow = -1, dcols = [];
  for (let ti = 0; ti < tbls.length && dt < 0; ti++) {
    for (const cell of tbls[ti]) {
      if (cell.norm.includes("월일") && cell.norm.includes("내용")) {
        dt = ti; drow = cell.r;
        const after = rowCells(tbls[ti], cell.r).filter((x) => x.c >= cell.c + cell.cs && !DATEX.has(x.norm));
        dcols = after.slice(0, 5).map((x) => x.c);
        break;
      }
    }
  }
  spec.date = dcols.map((c) => [dt, drow, c]);

  // SESSION ROWS (date 표 안): 라벨 행 × 날짜 열
  const dtab = dt >= 0 ? tbls[dt] : [];
  const labelRows = (re) => [...new Set(dtab.filter((c) => re.test(c.norm)).map((c) => c.r))].sort((a, b) => a - b);
  const valsAt = (row) => dcols.map((c) => [dt, row, c]);
  const startRows = labelRows(/시작시간/), endRows = labelRows(/종료시간/);
  if (startRows.length > 1) { // 다서비스 블록(대구·파주)
    spec.serviceBlocks = startRows.map((r, i) => ({ block: i, start: valsAt(r), end: valsAt(endRows[i] ?? r + 1) }));
    spec.start = valsAt(startRows[0]); spec.end = valsAt(endRows[0]);
  } else if (startRows.length === 1) {
    spec.start = valsAt(startRows[0]); if (endRows[0] != null) spec.end = valsAt(endRows[0]);
  }
  const extraRow = labelRows(/추가구매/)[0];
  if (extraRow != null) {
    spec.extra = valsAt(extraRow);
    const vRow = dtab.filter((c) => /바우처/.test(c.norm) && c.r < extraRow).map((c) => c.r).sort((a, b) => b - a)[0];
    if (vRow != null) spec.voucher = valsAt(vRow);
  }

  // 금액: 총이용금액 섹션. 자부담+총금액 라벨 있으면 3행 분해(원주), 없으면 단일.
  const amtLabel = dtab.find((c) => /총.?이용금액/.test(c.norm));
  if (amtLabel) {
    const copay = dtab.find((c) => /자부담/.test(c.norm) && c.r >= amtLabel.r);
    const tot = dtab.find((c) => /총\s*금액/.test(c.norm) && c.r >= amtLabel.r);
    const vAmt = dtab.find((c) => /바우처/.test(c.norm) && c.r >= amtLabel.r);
    if (copay && tot && vAmt) {
      spec.voucherAmount = valsAt(vAmt.r); spec.copayAmount = valsAt(copay.r); spec.amount = valsAt(tot.r);
    } else {
      spec.amount = valsAt(amtLabel.r);
    }
  }

  // RESULT 표: date 표가 아닌 표에서 결과 헤더 라벨 ≥2 인 행 = 헤더, 그 아래 = 회기(5개)
  const RES = [/제공일자|서비스일자|서비스제공일자/, /승인일자/, /승인번호/, /이용자.?상태|상태/, /서비스결과|결과/, /기타사항/, /^시간$/];
  for (let ti = 0; ti < tbls.length && !spec.result; ti++) {
    if (ti === dt) continue;
    const rows = [...new Set(tbls[ti].map((c) => c.r))].sort((a, b) => a - b);
    for (const r of rows) {
      const rc = rowCells(tbls[ti], r);
      const hits = rc.filter((c) => RES.some((re) => re.test(c.norm)) && !isNote(c.text));
      if (hits.length >= 2) {
        const colOf = (re) => { const h = rc.find((c) => re.test(c.norm)); return h ? h.c : null; };
        const map = {
          date: colOf(/제공일자|서비스일자|서비스제공일자/), apprDate: colOf(/승인일자/),
          apprNum: colOf(/승인번호/), time: colOf(/^시간$/),
          status: colOf(/이용자.?상태/), result: colOf(/서비스결과|기타사항|상태및서비스결과|상태\s*및/),
        };
        const dataRows = rows.filter((rr) => rr > r).slice(0, 5);
        spec.result = dataRows.map((rr) => {
          const o = {}; for (const [k, cc] of Object.entries(map)) if (cc != null) o[k] = [ti, rr, cc]; return o;
        });
        spec._resultTable = ti; spec._resultHeaderRow = r;
        break;
      }
    }
  }

  for (const k of ["org", "name", "birth", "date", "start", "end", "voucher", "extra", "amount", "result"]) {
    const v = spec[k]; spec._cov[k] = Array.isArray(v) ? v.length > 0 : !!v;
  }
  return spec;
}

// ── CLI ──
const files = process.argv.slice(2);
if (files.length === 0) {
  console.log("usage: node scripts/resolver-poc.mjs <section0.xml> [...]");
} else {
  for (const f of files) {
    const s = resolve(parseTables(readFileSync(f, "utf8")));
    const cov = Object.entries(s._cov).map(([k, v]) => `${v ? "✓" : "✗"}${k}`).join(" ");
    console.log(`\n### ${f}\ncov: ${cov}`);
    console.log("  header:", JSON.stringify({ org: s.org, name: s.name, birth: s.birth, serviceArea: s.serviceArea }));
    console.log("  date:", JSON.stringify(s.date));
    console.log("  start/end/voucher/extra/amount rows ok;", s.serviceBlocks ? `serviceBlocks=${s.serviceBlocks.length};` : "", s.voucherAmount ? "amount=3행;" : "");
    console.log("  result:", s.result?.length, "rows, cols", s.result?.[0] ? JSON.stringify(Object.keys(s.result[0])) : "-");
  }
}
