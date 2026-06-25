// 기록지 HWPX 생성기 — 단일·일괄 라우트에서 공용 사용.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { crc32, deflateRawSync } from "node:zlib";
import {
  buildZip,
  patchFiles,
  readHeader,
  readSection0,
  type ZipEntry,
} from "@/lib/hwpx";
import { fillCells, type CellEdit, type Coord } from "@/lib/record-fill";
import { autoFitRecordFont } from "@/lib/record-autofit";
import type { RecordFormKey } from "@/lib/record-forms";

const MAX_SESSIONS = 5;

export type RecordSessionDetail = {
  date: string;
  startTime: string;
  endTime: string;
  voucher: string;
  extra: string;
  amount: string;
  useDay: string;
  payDay: string;
  apprNumber: string;
  result: string;
  resultExtra?: string;
  status?: string; // 이용자 상태 (상태·결과 칸이 분리된 양식용; 합쳐진 양식은 미사용)
};

export type RecordPayload = {
  childName: string;
  childBirth: string;
  org: string;
  month: number;
  sessions: RecordSessionDetail[];
  opinion?: string;
  // 치료 종류(예: "언어재활"). 서비스 종류별 블록이 있는 양식(대구/파주)에서 사용.
  serviceType?: string;
};

export const RECORD_TEMPLATE_PATH = path.join(process.cwd(), "samples", "기록지_template.hwpx");


// ─── 지역 양식(좌표 기반) ──────────────────────────────────────────────
// 빈 원본 양식을 셀 좌표로 채운다. 회기 칸은 표준형과 동일하게 5칸 고정
// (6회기부터 분할). 양식마다 결과표 칸 구성이 달라 result 매핑이 다르다.

type CoordSpec = {
  org?: Coord;
  name?: Coord;
  birth?: Coord;
  serviceArea?: Coord; // 동탄: 제공영역 (현재 입력 데이터 없음 → 비움)
  date: Coord[];
  start: Coord[];
  end: Coord[];
  voucher: Coord[];
  extra: Coord[];
  amount: Coord[];
  // 금액을 바우처/자부담으로 나누는 양식(원주형)용. 총금액을 분(分) 비율로 분배.
  voucherAmount?: Coord[];
  copayAmount?: Coord[];
  result: Array<{
    date?: Coord;
    time?: Coord;
    apprDate?: Coord;
    apprNum?: Coord;
    status?: Coord; // 동탄: 이용자 상태 (현재 입력 데이터 없음 → 비움)
    result?: Coord;
  }>;
  note?: Coord; // 비고 ← 종합의견(opinion)
  // 서비스 종류별로 시작/종료 시간을 다른 블록에 넣는 양식(대구/파주)용.
  // serviceType 에 keyword 가 포함되면 그 블록, 없으면 serviceBlockDefault 사용.
  serviceBlocks?: Array<{ keyword: string; start: Coord[]; end: Coord[] }>;
  serviceBlockDefault?: { start: Coord[]; end: Coord[] };
  // 별지(2페이지) 상세 결과표 — 회기별 (서비스일자·승인일자·승인번호·결과 narrative).
  detail?: Array<{
    date?: Coord;
    apprDate?: Coord;
    apprNum?: Coord;
    result?: Coord;
  }>;
};

const COL5 = [4, 5, 6, 7, 8];
const ROW5 = [1, 2, 3, 4, 5];

// 동탄형: 회기 칸 9개지만 5칸만 사용. 결과표 5열(서비스일자·승인일자·승인번호·상태·결과).
const DONGTAN_SPEC: CoordSpec = {
  org: [0, 0, 2],
  serviceArea: [0, 1, 2],
  name: [0, 2, 2],
  birth: [0, 3, 2],
  date: COL5.map((c) => [1, 0, c] as Coord),
  start: COL5.map((c) => [1, 2, c] as Coord),
  end: COL5.map((c) => [1, 3, c] as Coord),
  voucher: COL5.map((c) => [1, 5, c] as Coord),
  extra: COL5.map((c) => [1, 6, c] as Coord),
  amount: COL5.map((c) => [1, 7, c] as Coord),
  result: ROW5.map((r) => ({
    date: [2, r, 0] as Coord, // 서비스 제공 일자
    apprDate: [2, r, 1] as Coord, // 승인일자
    apprNum: [2, r, 2] as Coord,
    status: [2, r, 3] as Coord, // 이용자의 상태
    result: [2, r, 4] as Coord, // 서비스 결과
  })),
};

// 남양주형: 회기 칸 6개지만 5칸만 사용. 결과표 4열(승인일자·시간·승인번호·기타사항).
// '서비스 결과' 전용 칸이 없어 결과 narrative 는 기타사항 칸에 넣는다.
const NAMYANGJU_SPEC: CoordSpec = {
  org: [0, 0, 2],
  serviceArea: [0, 1, 2],
  name: [0, 2, 2],
  birth: [0, 3, 2],
  date: COL5.map((c) => [1, 0, c] as Coord),
  start: COL5.map((c) => [1, 2, c] as Coord),
  end: COL5.map((c) => [1, 3, c] as Coord),
  voucher: COL5.map((c) => [1, 5, c] as Coord),
  extra: COL5.map((c) => [1, 6, c] as Coord),
  amount: COL5.map((c) => [1, 7, c] as Coord),
  result: ROW5.map((r) => ({
    apprDate: [2, r, 0] as Coord, // 승인일자
    time: [2, r, 1] as Coord, // 시간
    apprNum: [2, r, 2] as Coord,
    result: [2, r, 3] as Coord, // 기타사항(수업일자변경 등) ← 결과 narrative
  })),
};

const COORD_SPECS: Record<Exclude<RecordFormKey, "standard">, CoordSpec> = {
  dongtan: DONGTAN_SPEC,
  namyangju: NAMYANGJU_SPEC,
};

// 결과(narrative) 표의 위치·결과 칸 열 — 긴 결과 글자크기 자동축소용.
// 세 양식 모두 결과표는 table index 2, 데이터 행은 1~5(머리행 1개).
const AUTOFIT: Record<RecordFormKey, { resultTable: number; narrativeCols: number[] }> = {
  standard: { resultTable: 2, narrativeCols: [3] }, // 이용자 상태 및 서비스 결과
  dongtan: { resultTable: 2, narrativeCols: [4] }, // 서비스 결과
  namyangju: { resultTable: 2, narrativeCols: [3] }, // 기타사항(결과 narrative)
};

const TEMPLATE_FILES: Record<RecordFormKey, string> = {
  standard: "기록지_template.hwpx",
  dongtan: "기록지_template_dongtan.hwpx",
  namyangju: "기록지_template_namyangju.hwpx",
};

function push(edits: CellEdit[], c: Coord | undefined, value: string) {
  if (!c) return;
  edits.push({ table: c[0], row: c[1], col: c[2], p: c[3], value });
}

// 총금액을 바우처분:추가구매분 비율로 나눔. 합은 항상 총액과 일치(반올림 차이는 자부담에 흡수).
function splitAmount(
  amount: string,
  voucherMin: string,
  extraMin: string
): { voucher: string; copay: string } {
  const total = Number(String(amount).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(total) || total === 0) return { voucher: "", copay: "" };
  const v = Number(String(voucherMin).replace(/[^\d.]/g, "")) || 0;
  const e = Number(String(extraMin).replace(/[^\d.]/g, "")) || 0;
  const denom = v + e;
  const fmt = (n: number) => n.toLocaleString("ko-KR");
  if (denom <= 0) return { voucher: fmt(total), copay: "" };
  const voucherWon = Math.round((total * v) / denom);
  return { voucher: fmt(voucherWon), copay: fmt(total - voucherWon) };
}

function buildCoordEdits(spec: CoordSpec, p: RecordPayload): CellEdit[] {
  const sessions = p.sessions.slice(0, MAX_SESSIONS);
  const edits: CellEdit[] = [];
  push(edits, spec.org, p.org);
  push(edits, spec.name, p.childName);
  push(edits, spec.birth, p.childBirth);
  push(edits, spec.serviceArea, "");

  // 서비스 종류별 블록이 있으면 치료 종류에 맞는 시작/종료 칸을 고른다.
  let startCoords = spec.start;
  let endCoords = spec.end;
  if (spec.serviceBlocks?.length) {
    const st = p.serviceType ?? "";
    const blk = spec.serviceBlocks.find((b) => st.includes(b.keyword)) ?? spec.serviceBlockDefault;
    if (blk) {
      startCoords = blk.start;
      endCoords = blk.end;
    }
  }

  for (let i = 0; i < MAX_SESSIONS; i++) {
    const s = sessions[i];
    push(edits, spec.date[i], s?.date ?? "");
    push(edits, startCoords[i], s?.startTime ?? "");
    push(edits, endCoords[i], s?.endTime ?? "");
    push(edits, spec.voucher[i], s?.voucher ?? "");
    push(edits, spec.extra[i], s?.extra ?? "");
    push(edits, spec.amount[i], s?.amount ?? "");
    if (spec.voucherAmount || spec.copayAmount) {
      const split = s
        ? splitAmount(s.amount, s.voucher, s.extra)
        : { voucher: "", copay: "" };
      push(edits, spec.voucherAmount?.[i], split.voucher);
      push(edits, spec.copayAmount?.[i], split.copay);
    }
    const r = spec.result[i];
    if (r) {
      push(edits, r.date, s?.date ?? "");
      push(edits, r.time, s?.endTime ?? "");
      push(edits, r.apprDate, s ? s.payDay || s.date || "" : "");
      push(edits, r.apprNum, s?.apprNumber ?? "");
      push(edits, r.status, s?.status ?? ""); // 이용자 상태 (분리 칸 양식만; 없으면 no-op)
      push(edits, r.result, s?.result ?? "");
    }
  }
  if (spec.detail) {
    for (let i = 0; i < MAX_SESSIONS; i++) {
      const s = sessions[i];
      const d = spec.detail[i];
      if (!d) continue;
      push(edits, d.date, s?.date ?? "");
      push(edits, d.apprDate, s ? s.payDay || s.date || "" : "");
      push(edits, d.apprNum, s?.apprNumber ?? "");
      push(edits, d.result, s?.result ?? "");
    }
  }
  push(edits, spec.note, p.opinion ?? "");
  return edits;
}

function substituteCoordXml(xml: string, p: RecordPayload, spec: CoordSpec): string {
  let out = fillCells(xml, buildCoordEdits(spec, p));
  // 제목의 "( N월 )" 표기 채우기 (빈 양식은 "(  월)" 처럼 비어 있기도 함)
  out = out.replace(/(기록지\s*\(\s*)\d*(\s*월)/, `$1${p.month}$2`);
  return out;
}

export async function readRecordTemplate(form: RecordFormKey = "standard"): Promise<Buffer> {
  return readFile(path.join(process.cwd(), "samples", TEMPLATE_FILES[form]));
}

// 표준형도 좌표 기반으로 채운다(정리본 빈 양식 사용). 날짜 칸 열은 3~7.
const STD_COL = [3, 4, 5, 6, 7];
const STANDARD_SPEC: CoordSpec = {
  org: [0, 0, 2],
  name: [0, 1, 2],
  birth: [0, 2, 2],
  date: STD_COL.map((c) => [1, 0, c] as Coord),
  start: STD_COL.map((c) => [1, 2, c] as Coord),
  end: STD_COL.map((c) => [1, 3, c] as Coord),
  voucher: STD_COL.map((c) => [1, 5, c] as Coord),
  extra: STD_COL.map((c) => [1, 6, c] as Coord),
  amount: STD_COL.map((c) => [1, 7, c] as Coord),
  result: ROW5.map((r) => ({
    date: [2, r, 0] as Coord, // 서비스 제공일자
    apprDate: [2, r, 1] as Coord, // 승인일자
    apprNum: [2, r, 2] as Coord, // 승인번호
    result: [2, r, 3] as Coord, // 이용자의 상태 및 서비스 결과
  })),
  note: [3, 1, 0], // 부모 상담 종합 의견란
};

// 표준형 결과칸은 한 칸이므로 보강/불일치 사유(resultExtra)를 결과 본문 뒤에 붙여 보존.
function foldStandardExtra(p: RecordPayload): RecordPayload {
  return {
    ...p,
    sessions: p.sessions.map((s) => {
      const raw = (s.resultExtra ?? "").trim();
      if (!raw) return s;
      const extra = raw.startsWith("- ") ? raw : `- ${raw}`;
      const base = (s.result ?? "").trim();
      return { ...s, result: base ? `${base} ${extra}` : extra };
    }),
  };
}

// 한 장(5회기 이하) HWPX 생성
export function generateOneRecordSheet(
  templateBuf: Buffer,
  p: RecordPayload,
  form: RecordFormKey = "standard"
): Buffer {
  const oldXml = readSection0(templateBuf);
  const oldHeader = readHeader(templateBuf);
  const filledXml =
    form === "standard"
      ? substituteCoordXml(oldXml, foldStandardExtra(p), STANDARD_SPEC)
      : substituteCoordXml(oldXml, p, COORD_SPECS[form]);
  // 긴 결과 텍스트가 고정 칸을 넘쳐 다음 표와 겹치지 않도록, 칸은 그대로 두고
  // 결과 글자 크기를 줄여 칸 안에 맞춘다(기록지 1장 고정). section0·header 둘 다 갱신.
  const fit = autoFitRecordFont(filledXml, oldHeader, AUTOFIT[form]);
  return patchFiles(templateBuf, {
    "Contents/section0.xml": fit.section,
    "Contents/header.xml": fit.header,
  });
}

// 회기 수에 따라 1장 또는 N장으로 분할. 항상 Buffer[] 반환.
export function buildRecordSheets(
  templateBuf: Buffer,
  p: RecordPayload,
  form: RecordFormKey = "standard"
): Buffer[] {
  const chunks: RecordSessionDetail[][] = [];
  for (let i = 0; i < p.sessions.length; i += MAX_SESSIONS) {
    chunks.push(p.sessions.slice(i, i + MAX_SESSIONS));
  }
  if (chunks.length === 0) chunks.push([]);
  return chunks.map((chunkSessions) =>
    generateOneRecordSheet(templateBuf, { ...p, sessions: chunkSessions }, form)
  );
}

// 여러 .hwpx 또는 .xlsx 등을 일반 zip 으로 묶기.
// utf8Names: true → 윈도우 기본 압축해제기가 한글 파일명을 깨뜨리지 않음.
export function bundleAsZip(files: { name: string; data: Buffer }[]): Buffer {
  const entries: ZipEntry[] = files.map((f) => {
    const compressed = deflateRawSync(f.data, { level: 6 });
    return {
      name: f.name,
      method: 8,
      crc: crc32(f.data),
      compressedSize: compressed.length,
      uncompressedSize: f.data.length,
      compressedData: compressed,
    };
  });
  return buildZip(entries, { utf8Names: true });
}

export function safeFileName(s: string): string {
  return s.replace(/[/\\?%*:|"<>]/g, "_") || "기록지";
}
