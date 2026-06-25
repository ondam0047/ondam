// 기록지 결과(narrative) 글자 크기 자동 맞춤 — 긴 결과 텍스트가 고정 칸을 넘쳐
// 다음 표(부모상담/의견란)와 겹치거나 2장으로 밀려나는 것을 막되, 글자는 최대한 크게.
//
// 사용자 요구: 기록지는 무조건 한 장 안에서 끝나야 한다(셀·표 높이 불변). 표 4개가
// 페이지를 꽉 채워 결과 칸이 작으므로, 긴 결과는 칸 안에 들어가도록 글자를 맞춘다.
// 두 레버로 칸 안의 세로 공간을 최대한 확보해 "맞는 가장 큰 글자"를 고른다:
//   (1) 빈 보조 단락 제거: 채운 narrative 셀에 텍스트 없는 빈 <hp:p> 가 더 있으면 삭제
//       (최소 1개 단락 유지). 그만큼 한 줄을 회수해 글자 키우기에 쓴다.
//   (2) 줄 간격(lineSpacing) 좁히기: narrative 단락의 paraPr 를 복제해 lineSpacing 을
//       좁힌 값으로 바꿔 참조. 한글 줄높이 ≈ fontHeight × lineSpacing% 이므로, 좁히면
//       같은 칸 높이에 더 큰 글자가 들어간다(행간만 좁힘; 자간은 안 건드림).
//
// 메커니즘: 한글은 run charPrIDRef → header.xml <hh:charPr height>, 단락 paraPrIDRef →
// header.xml <hh:paraPr><hh:lineSpacing> 를 참조한다. 필요한 height·lineSpacing 조합의
// charPr/paraPr 를 header 에 복제 추가(기존 정의 복제 + 값만 교체 + 새 id)하고 run/단락이
// 그 id 를 참조하게 한다. 셀/표 높이·표 사이 문단·뒤 표 위치 캐시는 건드리지 않는다.

const TBL_OPEN = "<hp:tbl";
const TBL_CLOSE = "</hp:tbl>";
const TC_OPEN = "<hp:tc";
const TC_CLOSE = "</hp:tc>";

function findNthTable(xml: string, n: number): [number, number] | null {
  let idx = 0;
  for (let i = 0; i <= n; i++) {
    const a = xml.indexOf(TBL_OPEN, idx);
    if (a < 0) return null;
    const b = xml.indexOf(TBL_CLOSE, a);
    if (b < 0) return null;
    const end = b + TBL_CLOSE.length;
    if (i === n) return [a, end];
    idx = end;
  }
  return null;
}

// 텍스트의 표시 폭(한글·전각 1.0, 그 외 0.55)을 글자 수 환산값으로 추정.
function displayUnits(text: string): number {
  let u = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    const wide =
      (code >= 0x1100 && code <= 0x11ff) ||
      (code >= 0x3000 && code <= 0x303f) ||
      (code >= 0x3130 && code <= 0x318f) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0xff00 && code <= 0xffef);
    u += wide ? 1 : 0.55;
  }
  return u;
}

// 글자 폭 charWidth(≈ fontHeight) 에서, 가용 폭 textWidth 안에 paraText 가 차지할 줄 수.
function estimateLines(paraText: string, textWidth: number, charWidth: number): number {
  if (textWidth <= 0 || charWidth <= 0) return 1;
  const perLine = Math.max(1, Math.floor(textWidth / charWidth));
  const segments = paraText.split(/\r?\n/);
  let lines = 0;
  for (const seg of segments) {
    const units = displayUnits(seg);
    lines += Math.max(1, Math.ceil(units / perLine));
  }
  return Math.max(1, lines);
}

function unescapeXml(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

type CellInfo = {
  start: number;
  end: number;
  col: number;
  row: number;
  cellHeight: number; // cellSz height (고정 — 바꾸지 않음)
  textWidth: number; // 가용 텍스트 폭(셀너비 − 좌우여백)
  vMargin: number; // 셀 상하 안쪽 여백 합(top+bottom)
  text: string; // 셀 텍스트(모든 <hp:t> 연결)
  narrCharPr: number | undefined; // 글자 든 단락의 첫 run charPrIDRef
  narrParaPr: number | undefined; // 글자 든 단락의 paraPrIDRef
  emptyParaCount: number; // 텍스트 없는 빈 단락 수(삭제 대상)
};

function cellMargins(
  cell: string,
  tblIn: { top: number; bottom: number; left: number; right: number }
): { vMargin: number; hMargin: number } {
  const cm = cell.match(
    /<hp:cellMargin[^>]*\bleft="(\d+)"[^>]*\bright="(\d+)"[^>]*\btop="(\d+)"[^>]*\bbottom="(\d+)"/
  );
  if (cm) {
    const left = Number(cm[1]);
    const right = Number(cm[2]);
    const top = Number(cm[3]);
    const bottom = Number(cm[4]);
    if (left > 0 || right > 0 || top > 0 || bottom > 0) {
      return { vMargin: top + bottom, hMargin: left + right };
    }
  }
  return { vMargin: tblIn.top + tblIn.bottom, hMargin: tblIn.left + tblIn.right };
}

// 한 단락이 글자(<hp:t> 내용)를 갖는가.
function paraHasText(pXml: string): boolean {
  for (const m of pXml.matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/g)) {
    if (m[1].length > 0) return true;
  }
  return false;
}

function parseCells(tbl: string): CellInfo[] {
  const im = tbl.match(
    /<hp:inMargin[^>]*\bleft="(\d+)"[^>]*\bright="(\d+)"[^>]*\btop="(\d+)"[^>]*\bbottom="(\d+)"/
  );
  const tblIn = {
    left: im ? Number(im[1]) : 141,
    right: im ? Number(im[2]) : 141,
    top: im ? Number(im[3]) : 141,
    bottom: im ? Number(im[4]) : 141,
  };

  const cells: CellInfo[] = [];
  let pos = 0;
  while (true) {
    const a = tbl.indexOf(TC_OPEN, pos);
    if (a < 0) break;
    const b = tbl.indexOf(TC_CLOSE, a);
    if (b < 0) break;
    const end = b + TC_CLOSE.length;
    const cell = tbl.slice(a, end);
    pos = end;
    const ad = cell.match(/<hp:cellAddr colAddr="(\d+)" rowAddr="(\d+)"/);
    const sz = cell.match(/<hp:cellSz width="(\d+)" height="(\d+)"/);
    if (!ad || !sz) continue;
    const { vMargin, hMargin } = cellMargins(cell, tblIn);
    const cellWidth = Number(sz[1]);
    const text = (cell.match(/<hp:t>([\s\S]*?)<\/hp:t>/g) ?? [])
      .map((m) => m.replace(/<\/?hp:t>/g, ""))
      .join("");
    // 단락 단위로 글자 있는 단락(narrative)·빈 단락 수 파악.
    let narrCharPr: number | undefined;
    let narrParaPr: number | undefined;
    let emptyParaCount = 0;
    let totalParas = 0;
    for (const pm of cell.matchAll(/<hp:p\b[\s\S]*?<\/hp:p>/g)) {
      totalParas++;
      const p = pm[0];
      if (paraHasText(p)) {
        if (narrCharPr === undefined) {
          const r = p.match(/<hp:run\s+charPrIDRef="(\d+)"/);
          if (r) narrCharPr = Number(r[1]);
          const pp = p.match(/<hp:p\b[^>]*\bparaPrIDRef="(\d+)"/);
          if (pp) narrParaPr = Number(pp[1]);
        }
      } else {
        emptyParaCount++;
      }
    }
    // 빈 단락은 최소 1개 단락 유지를 전제로 삭제 가능 — 글자 단락이 있으면 빈 단락 전부.
    const deletableEmpty = narrCharPr !== undefined ? emptyParaCount : Math.max(0, totalParas - 1);
    cells.push({
      start: a,
      end,
      col: Number(ad[1]),
      row: Number(ad[2]),
      cellHeight: Number(sz[2]),
      textWidth: Math.max(1, cellWidth - hMargin),
      vMargin,
      text,
      narrCharPr,
      narrParaPr,
      emptyParaCount: deletableEmpty,
    });
  }
  return cells;
}

// ─── header.xml charPr/paraPr 조회·복제 추가 ─────────────────────────────

function charPrHeight(header: string, id: number): number | null {
  const m = header.match(new RegExp(`<hh:charPr\\b[^>]*\\bid="${id}"[^>]*\\bheight="(\\d+)"`));
  return m ? Number(m[1]) : null;
}

// narrative paraPr 의 lineSpacing(PERCENT 값). 못 찾으면 null.
function paraLineSpacingPercent(header: string, id: number): number | null {
  const def = findDef(header, "paraPr", id);
  if (!def) return null;
  const m = def.match(/<hh:lineSpacing type="PERCENT" value="(\d+)"/);
  return m ? Number(m[1]) : null;
}

function findDef(header: string, tag: "charPr" | "paraPr", id: number): string | null {
  const re = new RegExp(`<hh:${tag}\\b[^>]*\\bid="${id}"[\\s\\S]*?<\\/hh:${tag}>`);
  const m = header.match(re);
  return m ? m[0] : null;
}

function itemCnt(header: string, container: "charProperties" | "paraProperties"): number {
  const m = header.match(new RegExp(`<hh:${container}\\b[^>]*\\bitemCnt="(\\d+)"`));
  return m ? Number(m[1]) : 0;
}

// charPr·paraPr 를 복제 추가하는 header 패처. 새 항목은 각 컨테이너 끝에 붙이고
// itemCnt 를 증가. 새 id = 추가 시점의 itemCnt(0..itemCnt-1 다음 번호).
function makeHeaderPatcher(header0: string) {
  let header = header0;
  let nextCharId = itemCnt(header, "charProperties");
  let nextParaId = itemCnt(header, "paraProperties");
  const charCache = new Map<string, number>();
  const paraCache = new Map<string, number>();
  return {
    get header() {
      return header;
    },
    // baseId charPr 를 복제하되 height 만 newHeight 로. 새 id 반환.
    shrunkCharPr(baseId: number, newHeight: number): number {
      const key = `${baseId}:${newHeight}`;
      const hit = charCache.get(key);
      if (hit !== undefined) return hit;
      const def = findDef(header, "charPr", baseId);
      if (!def) {
        charCache.set(key, baseId);
        return baseId;
      }
      const newId = nextCharId++;
      const cloned = def
        .replace(/(<hh:charPr\b[^>]*?\bid=")\d+(")/, `$1${newId}$2`)
        .replace(/(<hh:charPr\b[^>]*?\bheight=")\d+(")/, `$1${newHeight}$2`);
      header = header.replace("</hh:charProperties>", `${cloned}</hh:charProperties>`);
      header = header.replace(
        /(<hh:charProperties\b[^>]*\bitemCnt=")(\d+)(")/,
        (_m, p1, p2, p3) => `${p1}${Number(p2) + 1}${p3}`
      );
      charCache.set(key, newId);
      return newId;
    },
    // baseId paraPr 를 복제하되 lineSpacing(PERCENT) 만 newPercent 로. 새 id 반환.
    tightParaPr(baseId: number, newPercent: number): number {
      const key = `${baseId}:${newPercent}`;
      const hit = paraCache.get(key);
      if (hit !== undefined) return hit;
      const def = findDef(header, "paraPr", baseId);
      if (!def) {
        paraCache.set(key, baseId);
        return baseId;
      }
      const newId = nextParaId++;
      const cloned = def
        .replace(/(<hh:paraPr\b[^>]*?\bid=")\d+(")/, `$1${newId}$2`)
        .replace(
          /(<hh:lineSpacing type="PERCENT" value=")\d+(")/g,
          `$1${newPercent}$2`
        );
      header = header.replace("</hh:paraProperties>", `${cloned}</hh:paraProperties>`);
      header = header.replace(
        /(<hh:paraProperties\b[^>]*\bitemCnt=")(\d+)(")/,
        (_m, p1, p2, p3) => `${p1}${Number(p2) + 1}${p3}`
      );
      paraCache.set(key, newId);
      return newId;
    },
  };
}

// 셀에서 텍스트 없는 빈 단락(<hp:p>…</hp:p>)을 삭제(최소 1개 단락은 남김).
function removeEmptyParagraphs(cell: string): string {
  const paras = [...cell.matchAll(/<hp:p\b[\s\S]*?<\/hp:p>/g)];
  if (paras.length <= 1) return cell;
  const remainHasText = paras.some((m) => paraHasText(m[0]));
  let removed = 0;
  let out = cell;
  // 끝→앞으로 삭제(인덱스 보존). 글자 단락이 하나도 없으면 첫 단락은 보존.
  for (let i = paras.length - 1; i >= 0; i--) {
    const m = paras[i];
    const p = m[0];
    if (paraHasText(p)) continue;
    if (!remainHasText && i === 0) continue; // 모두 빈 단락이면 첫 단락 유지.
    if (paras.length - removed <= 1) break; // 최소 1개 단락 유지.
    out = out.slice(0, m.index!) + out.slice(m.index! + p.length);
    removed++;
  }
  return out;
}

export type AutoFitOptions = {
  resultTable: number;
  narrativeCols: number[]; // 결과 narrative 가 들어가는 열(들)
  headerRows?: number; // 제외할 머리행 수(기본 1)
  minFontHeight?: number; // 글자 크기 하한(기본 450 = 4.5pt)
  tightLineSpacing?: number; // 좁힌 줄 간격 % (기본 110). 행간만 좁힘.
};

export type AutoFitResult = { section: string; header: string };

// 결과 narrative 를 칸에 맞추되 글자를 최대화. section0·header 둘 다 갱신해 반환.
export function autoFitRecordFont(
  section: string,
  header: string,
  opts: AutoFitOptions
): AutoFitResult {
  const headerRows = opts.headerRows ?? 1;
  const minFont = opts.minFontHeight ?? 450;
  const tightPct = opts.tightLineSpacing ?? 110;
  const SAFETY_LINES = 0.5;
  const t = findNthTable(section, opts.resultTable);
  if (!t) return { section, header };
  const tbl = section.slice(t[0], t[1]);
  const cells = parseCells(tbl);
  if (cells.length === 0) return { section, header };

  const rows = Array.from(new Set(cells.map((c) => c.row))).sort((a, b) => a - b);
  const minRow = rows[0] ?? 0;

  const patcher = makeHeaderPatcher(header);
  type CellPatch = {
    start: number;
    end: number;
    fromCharId: number;
    toCharId: number;
    fromParaId?: number;
    toParaId?: number;
  };
  const cellPatches: CellPatch[] = [];

  for (const c of cells) {
    if (c.row < minRow + headerRows) continue; // 머리행 제외
    if (!opts.narrativeCols.includes(c.col)) continue;
    const txt = unescapeXml(c.text).trim();
    if (!txt) continue;
    const baseId = c.narrCharPr;
    if (baseId === undefined) continue;
    const baseFont = charPrHeight(header, baseId);
    if (!baseFont) continue;

    const usable = Math.max(1, c.cellHeight - c.vMargin);

    // 레버 1: 빈 보조 단락 제거 → narrative 단락만 남으므로 빈 단락 줄(0)만 차지.
    //         (제거는 아래 section 갱신 시 실제 수행; 여기선 줄 수 계산에서 빈단락 제외.)
    // 레버 2: 줄 간격 좁히기 → 줄높이 = font × tightPct/100.
    const baseSpacingPct = paraLineSpacingPercent(header, c.narrParaPr ?? -1) ?? 135;
    const usePct = Math.min(baseSpacingPct, tightPct); // 원래가 더 좁으면 그대로.

    const lineHeight = (font: number, pct: number) => Math.round((font * pct) / 100);
    const fits = (font: number): boolean => {
      const pitch = lineHeight(font, usePct);
      const cap = Math.max(1, Math.floor(usable / pitch));
      const need = estimateLines(txt, c.textWidth, font) + SAFETY_LINES; // 빈단락 제거됨
      return need <= cap;
    };

    // baseFont 부터 위로는 안 키우고(원본 크기 상한), 아래로 50씩 내리며 맞는 최대 폰트.
    // 단, 빈단락 제거 + 줄간격 축소로 baseFont 가 그대로 맞을 수도 있다(그래도 줄간격은
    // 좁히는 게 안전마진↑ 이므로 paraPr 는 항상 좁힌 값으로 바꾼다).
    let chosen = baseFont;
    if (!fits(baseFont)) {
      chosen = minFont;
      for (let f = baseFont - 50; f >= minFont; f -= 50) {
        chosen = f;
        if (fits(f)) break;
      }
    }

    // 적용: 글자크기(필요 시 축소) + 줄간격(좁힘). 둘 중 하나라도 바뀌면 패치.
    const toCharId = chosen < baseFont ? patcher.shrunkCharPr(baseId, chosen) : baseId;
    const baseParaId = c.narrParaPr;
    const toParaId =
      baseParaId !== undefined && usePct < baseSpacingPct
        ? patcher.tightParaPr(baseParaId, usePct)
        : undefined;

    const charChanged = toCharId !== baseId;
    const paraChanged = toParaId !== undefined && toParaId !== baseParaId;
    const needsEmptyRemoval = c.emptyParaCount > 0;
    if (!charChanged && !paraChanged && !needsEmptyRemoval) continue;

    cellPatches.push({
      start: c.start,
      end: c.end,
      fromCharId: baseId,
      toCharId,
      fromParaId: paraChanged ? baseParaId : undefined,
      toParaId: paraChanged ? toParaId : undefined,
    });
  }

  if (cellPatches.length === 0) return { section, header };

  // 셀을 끝→앞으로 갱신(인덱스 보존):
  //  (a) 빈 단락 제거, (b) narrative run charPrIDRef 교체, (c) narrative 단락 paraPrIDRef 교체.
  let outTbl = tbl;
  for (const p of cellPatches.sort((a, b) => b.start - a.start)) {
    let cell = outTbl.slice(p.start, p.end);
    cell = removeEmptyParagraphs(cell);
    if (p.toCharId !== p.fromCharId) {
      cell = cell.replace(
        new RegExp(`(<hp:run\\s+charPrIDRef=")${p.fromCharId}(")`, "g"),
        `$1${p.toCharId}$2`
      );
    }
    if (p.fromParaId !== undefined && p.toParaId !== undefined && p.toParaId !== p.fromParaId) {
      cell = cell.replace(
        new RegExp(`(<hp:p\\b[^>]*\\bparaPrIDRef=")${p.fromParaId}(")`, "g"),
        `$1${p.toParaId}$2`
      );
    }
    outTbl = outTbl.slice(0, p.start) + cell + outTbl.slice(p.end);
  }

  const outSection = section.slice(0, t[0]) + outTbl + section.slice(t[1]);
  return { section: outSection, header: patcher.header };
}
