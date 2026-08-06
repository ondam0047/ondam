// 기록지 .hwp(HWP 5.0 바이너리) 생성기 — 한글 2002+ 호환 다운로드용.
//
// PoC(2026-08-05, 한글 실기동 3회 검증)로 확정된 조합:
//   1. 원본 .hwp 의 CFB 컨테이너·FileHeader·PrvText·PrvImage·요약정보를 바이트 그대로 재사용
//   2. DocInfo 는 원본 레코드 기반으로 우리가 직접 append (hwplib 이 쓴 것은 버림 —
//      hwplib writer 는 NUMBERING 버전게이트 오류로 "손상" 파일을 만든다)
//   3. Section0 만 hwplib(fill CLI)이 채운 것으로 교체
//   4. 빈 PARA_LINE_SEG 잔재 제거 + 바뀐 단락의 낡은 줄 위치 캐시 제거
// 좌표(CellEdit)·자동축소 계산은 hwpx 경로와 100% 공유(PoC 로 좌표 체계 일치 실증).

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { readContainer, writeContainer, findStream } from "@/lib/hwp/cfb";
import { parseRecords, serializeRecords, TAG, type Rec } from "@/lib/hwp/record";
import {
  cloneCharShape,
  cloneParaShape,
  charShapeHeight,
  paraShapeSpacing,
} from "@/lib/hwp/docinfo";
import {
  scanTables,
  paraChildren,
  cellText,
  dropLineSegs,
  dropEmptyLineSegs,
} from "@/lib/hwp/section";
import { chooseFontHeight, MIN_FONT_HEIGHT, TIGHT_LINE_SPACING } from "@/lib/record-autofit-core";
import {
  AUTOFIT,
  STANDARD_SPEC,
  buildCoordEdits,
  foldStandardExtra,
  type RecordPayload,
} from "@/lib/record-hwpx";
import type { CellEdit } from "@/lib/record-fill";

const JAR = process.env.HWP2HWPX_JAR || "/opt/baroilji/bin/hwp2hwpx-cli.jar";
const JAVA = process.env.JAVA_BIN || "java";
const TIMEOUT_MS = 30_000;

export const RECORD_TEMPLATE_HWP_PATH = path.join(process.cwd(), "samples", "기록지_template.hwp");
const MAX_SESSIONS = 5;

// 표 밖 제목 단락 "기록지 ( N월 )" 채우기용 특수 edit — Fill.java 가 titleLabel 키로 구분.
type FillEdit = CellEdit | { titleLabel: string; value: string };

// ── Java fill: hwplib 으로 셀 채운 .hwp 를 받는다(Section0 만 쓰고 나머지는 버림) ──
async function runFill(templateHwp: Buffer, edits: FillEdit[]): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "hwpfill-"));
  const inPath = path.join(dir, "in.hwp");
  const editsPath = path.join(dir, "edits.json");
  const outPath = path.join(dir, "out.hwp");
  try {
    await writeFile(inPath, templateHwp);
    await writeFile(editsPath, JSON.stringify(edits), "utf8");
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(JAVA, ["-jar", JAR, "fill", inPath, editsPath, outPath], {
        stdio: ["ignore", "ignore", "pipe"],
      });
      let err = "";
      proc.stderr.on("data", (d) => (err += String(d)));
      const timer = setTimeout(() => {
        proc.kill("SIGKILL");
        reject(new Error(".hwp 채우기 시간 초과"));
      }, TIMEOUT_MS);
      proc.on("error", (e) => {
        clearTimeout(timer);
        reject(new Error(`.hwp 채우기 실행 실패(서버 변환 환경 미설정) [${e.message}]`));
      });
      proc.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`.hwp 채우기 실패${err.trim() ? ` [${err.trim().slice(0, 200)}]` : ""}`));
      });
    });
    return await readFile(outPath);
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── 자동축소 .hwp 어댑터 — hwpx autoFitRecordFont 와 동일 계산(코어 공유) ──
function autoFitHwp(
  dinfo: Rec[],
  sec: Rec[],
  opts: { resultTable: number; narrativeCols: number[] }
): { sec: Rec[]; touched: number[] } {
  const tables = scanTables(sec);
  if (opts.resultTable >= tables.length) return { sec, touched: [] };
  const tbl = tables[opts.resultTable];
  const rows = [...new Set(tbl.cells.map((c) => c.row))].sort((a, b) => a - b);
  const minRow = rows[0] ?? 0;
  const headerRows = 1;
  const touched: number[] = [];
  const charCache = new Map<string, number>();
  const paraCache = new Map<string, number>();

  for (const c of tbl.cells) {
    if (c.row < minRow + headerRows || !opts.narrativeCols.includes(c.col)) continue;
    // 여백: 셀 자체 여백이 전부 0 이면 표 안 여백을 쓴다(hwpx 어댑터와 동일)
    let [L, R, T, B] = c.margin;
    if (L === 0 && R === 0 && T === 0 && B === 0) [L, R, T, B] = tbl.inMargin;
    const textWidth = Math.max(1, c.w - (L + R));
    const usable = Math.max(1, c.h - (T + B));

    const txt = cellText(sec, c).trim();
    if (!txt) continue;
    // 글자 든 첫 단락의 charShape/paraShape id
    let baseChar: number | undefined;
    let basePara: number | undefined;
    for (const pi of c.paras) {
      const kids = paraChildren(sec, pi);
      const hasText = kids.some(
        (k) => sec[k].tag === TAG.PARA_TEXT && sec[k].pay.length > 0
      );
      if (!hasText) continue;
      const pcs = kids.find((k) => sec[k].tag === TAG.PARA_CHARSHAPE && sec[k].pay.length >= 8);
      if (pcs !== undefined) baseChar = sec[pcs].pay.readUInt32LE(4);
      basePara = sec[pi].pay.readUInt16LE(8);
      break;
    }
    if (baseChar === undefined || basePara === undefined) continue;
    const baseFont = charShapeHeight(dinfo, baseChar);
    if (!baseFont) continue;
    const sp = paraShapeSpacing(dinfo, basePara);
    const basePct = sp && sp.kind === 0 ? sp.value : 135;
    const usePct = Math.min(basePct, TIGHT_LINE_SPACING);

    const chosen = chooseFontHeight({
      text: txt,
      textWidth,
      usableHeight: usable,
      baseFont,
      spacingPct: usePct,
      minFont: MIN_FONT_HEIGHT,
    });

    let newChar = baseChar;
    if (chosen < baseFont) {
      const key = `${baseChar}:${chosen}`;
      if (!charCache.has(key)) charCache.set(key, cloneCharShape(dinfo, baseChar, chosen));
      newChar = charCache.get(key)!;
    }
    let newPara = basePara;
    if (usePct < basePct) {
      const key = `${basePara}:${usePct}`;
      if (!paraCache.has(key)) paraCache.set(key, cloneParaShape(dinfo, basePara, usePct));
      newPara = paraCache.get(key)!;
    }
    if (newChar === baseChar && newPara === basePara) continue;

    for (const pi of c.paras) {
      const ph = sec[pi];
      if (newPara !== basePara && ph.pay.readUInt16LE(8) === basePara) {
        ph.pay.writeUInt16LE(newPara, 8);
      }
      for (const k of paraChildren(sec, pi)) {
        if (sec[k].tag === TAG.PARA_CHARSHAPE && newChar !== baseChar) {
          const p = sec[k].pay;
          for (let o = 0; o + 8 <= p.length; o += 8) {
            if (p.readUInt32LE(o + 4) === baseChar) p.writeUInt32LE(newChar, o + 4);
          }
        }
      }
    }
    touched.push(...c.paras);
  }
  return { sec: dropLineSegs(sec, touched), touched };
}

// ── 조립: 원본 컨테이너 + 우리 DocInfo + hwplib Section0 ──
function isCompressed(container: ReturnType<typeof readContainer>): boolean {
  const fh = container.data.get(findStream(container, "FileHeader"))!;
  return (fh.readUInt32LE(36) & 1) === 1;
}

function readStreamRecords(container: ReturnType<typeof readContainer>, name: string): Rec[] {
  const raw = container.data.get(findStream(container, name))!;
  return parseRecords(isCompressed(container) ? inflateRawSync(raw) : raw);
}

export async function generateOneRecordSheetHwp(
  templateHwp: Buffer,
  p: RecordPayload
): Promise<Buffer> {
  // 1단계는 standard 양식만 — 다른 내장 양식은 .hwp 템플릿 판이 검증되면 추가.
  const folded = foldStandardExtra(p);
  const edits: FillEdit[] = buildCoordEdits(STANDARD_SPEC, folded);
  // 제목 "발달재활서비스 제공기록지 ( N월 )" — hwpx 의 fillTitleParenMonth 와 동일 의도.
  if (p.month) edits.push({ titleLabel: "기록지", value: String(p.month) });

  const filledHwp = await runFill(templateHwp, edits);

  const orig = readContainer(templateHwp);
  const filled = readContainer(filledHwp);

  let sec = dropEmptyLineSegs(readStreamRecords(filled, "Section0"));
  const dinfo = readStreamRecords(orig, "DocInfo");
  sec = autoFitHwp(dinfo, sec, AUTOFIT.standard).sec;

  orig.data.set(findStream(orig, "DocInfo"), deflateRawSync(serializeRecords(dinfo)));
  orig.data.set(findStream(orig, "Section0"), deflateRawSync(serializeRecords(sec)));
  return writeContainer(orig);
}

// 회기 수에 따라 1장 또는 N장으로 분할 — hwpx buildRecordSheets 와 동일 규칙.
export async function buildRecordSheetsHwp(
  templateHwp: Buffer,
  p: RecordPayload
): Promise<Buffer[]> {
  const chunks: RecordPayload["sessions"][] = [];
  for (let i = 0; i < p.sessions.length; i += MAX_SESSIONS) {
    chunks.push(p.sessions.slice(i, i + MAX_SESSIONS));
  }
  if (chunks.length === 0) chunks.push([]);
  const out: Buffer[] = [];
  for (const sessions of chunks) {
    out.push(await generateOneRecordSheetHwp(templateHwp, { ...p, sessions }));
  }
  return out;
}
