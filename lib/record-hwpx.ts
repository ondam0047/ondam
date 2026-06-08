// 기록지 HWPX 생성기 — 단일·일괄 라우트에서 공용 사용.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { crc32, deflateRawSync } from "node:zlib";
import {
  buildZip,
  patchSection0,
  readSection0,
  xmlEscape,
  type ZipEntry,
} from "@/lib/hwpx";
import { fillCells, type CellEdit, type Coord } from "@/lib/record-fill";
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
};

export type RecordPayload = {
  childName: string;
  childBirth: string;
  org: string;
  month: number;
  sessions: RecordSessionDetail[];
  opinion?: string;
};

export const RECORD_TEMPLATE_PATH = path.join(process.cwd(), "samples", "기록지_template.hwpx");

const T = {
  titleMonth: " (2",
  org: "온담말언어발달센터",
  name: "노하은",
  birth: "19.08.31",
  dates: ["2/10", "2/11", "2/19", "2/24", "2/26"] as const,
  startTimes: ["15:10", "15:55", "15:45", "16:00", "15:45"] as const,
  endTimes: ["16:01", "16:45", "16:36", "16:53", "16:47"] as const,
  voucherMins: ["40", "40", "40", "40", "20"] as const,
  extraMins: ["10", "10", "10", "10", "30"] as const,
  amounts: ["65,000", "65,000", "65,000", "65,000", "65,000"] as const,
  records: [
    {
      day: "10", apprDay: "10", apprNum: "500862090623",
      resultMain: "고빈도 어휘 CVCV 수준에 해당하는 단어 ‘머리, 다리, 다리미’ 쓰기 및 읽기 활동에서 ‘다리미’에 대하여 ‘다미리’ 라고 쓰며 어려움을 나타내어 피드백 제공 하였으며 정반응 하였다",
      resultExtra: "- 4일 수업이나, 아동 독감으로 10일에 보강수업함.",
    },
    {
      day: "11", apprDay: "11", apprNum: "500862542375",
      resultMain: "고빈도 어휘 CVCV 수준에 해당하는 단어 ‘도토리, 요리사, 의사, 의자’ 쓰기 및 읽기 활동에서 ‘도토리’에 대하여 쓰기 시 어려움을 나타내어 시각단서 제공 하였으며 정반응 하였다. ",
      resultExtra: undefined,
    },
    {
      day: "19", apprDay: "19", apprNum: "500864846064",
      resultMain: "종성 /ㄹ/에 해당하는 1음절 수준 연습하기에서 혀를 과도하게 거상하여 말아 올라가는 점이 관찰되었으며, 시각 및 청각 피드백 제공하여 정조음 도왔다. ",
      resultExtra: "- 5일 수업이나, 아동 독감으로 19일에 보강수업함",
    },
    {
      day: "24", apprDay: "24", apprNum: "500866723624",
      resultMain: "종성 /ㄹ/에 해당하는 단어 수준에서 /필통, 벨트/에서 생략이 관찰되었으며 시각 및 청각피드백 제공하자 정조음하였다.",
      resultExtra: "- 12일 수업이나 치료사 사정으로 24일에 보강수업함.",
    },
    {
      day: "26", apprDay: "26", apprNum: "500867628781",
      resultMain: "종성 /ㅁ/에 해당하는 문장수준에서 모두 정조음 하여 사회적 강화 제공하였다. ",
      resultExtra: undefined,
    },
  ],
  opinionText: "종성/ㅁ/에 대하여 대화수준에서는 간혹 대치 및 생략이 관찰되어 주의가 필요함.",
} as const;

function replaceWithLinesegReset(
  xml: string, oldText: string, newText: string, fromCursor = 0
): { out: string; nextCursor: number } {
  const search = `<hp:t>${oldText}</hp:t>`;
  const idx = xml.indexOf(search, fromCursor);
  if (idx < 0) return { out: xml, nextCursor: fromCursor };
  const pStart = xml.lastIndexOf("<hp:p ", idx);
  const pEndIdx = xml.indexOf("</hp:p>", idx);
  if (pStart < 0 || pEndIdx < 0) return { out: xml, nextCursor: fromCursor };
  const pEnd = pEndIdx + "</hp:p>".length;
  let pBlock = xml.slice(pStart, pEnd);
  pBlock = pBlock.replace(search, `<hp:t>${xmlEscape(newText)}</hp:t>`);
  pBlock = pBlock.replace(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/, "");
  const out = xml.slice(0, pStart) + pBlock + xml.slice(pEnd);
  return { out, nextCursor: pStart + pBlock.length };
}

function replaceOne(xml: string, oldText: string, newText: string): string {
  return replaceWithLinesegReset(xml, oldText, newText).out;
}

function replaceSequence(
  xml: string,
  olds: readonly string[],
  news: readonly (string | undefined)[]
): string {
  let out = xml;
  let cursor = 0;
  for (let i = 0; i < olds.length; i++) {
    const r = replaceWithLinesegReset(out, olds[i], news[i] ?? "", cursor);
    out = r.out;
    cursor = r.nextCursor;
  }
  return out;
}

function substituteRecordXml(xml: string, p: RecordPayload): string {
  let out = xml;

  out = replaceOne(out, T.titleMonth, ` (${p.month}`);
  out = replaceOne(out, T.org, p.org);
  out = replaceOne(out, T.name, p.childName);
  out = replaceOne(out, T.birth, p.childBirth);

  const sessions = p.sessions.slice(0, MAX_SESSIONS);
  while (sessions.length < MAX_SESSIONS) {
    sessions.push({
      date: "", startTime: "", endTime: "",
      voucher: "", extra: "", amount: "",
      useDay: "", payDay: "", apprNumber: "", result: "",
    });
  }

  out = replaceSequence(out, T.dates, sessions.map((s) => s.date));
  out = replaceSequence(out, T.startTimes, sessions.map((s) => s.startTime));
  out = replaceSequence(out, T.endTimes, sessions.map((s) => s.endTime));
  out = replaceSequence(out, T.voucherMins, sessions.map((s) => s.voucher));
  out = replaceSequence(out, T.extraMins, sessions.map((s) => s.extra));
  out = replaceSequence(out, T.amounts, sessions.map((s) => s.amount));

  // 슬롯 없는 회기(2·5번째)에 사용자가 사유를 입력하면 별도 줄로 들어가도록,
  // 슬롯 있는 회기의 사유 문단(<hp:p>...</hp:p>) 을 템플릿으로 캡처해둠.
  const firstWithExtra = T.records.find((r) => !!r.resultExtra);
  let extraParaTemplate = "";
  let extraOldText = "";
  if (firstWithExtra) {
    extraOldText = firstWithExtra.resultExtra!;
    const search = `<hp:t>${extraOldText}</hp:t>`;
    const idx = out.indexOf(search);
    if (idx >= 0) {
      const pStart = out.lastIndexOf("<hp:p ", idx);
      const pEndIdx = out.indexOf("</hp:p>", idx);
      if (pStart >= 0 && pEndIdx >= 0) {
        // linesegarray 는 제거 — 새 위치에 삽입되면 한글에서 재계산
        extraParaTemplate = out
          .slice(pStart, pEndIdx + "</hp:p>".length)
          .replace(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/, "");
      }
    }
  }

  const anchorIdx = out.indexOf("※");
  let recordCursor = anchorIdx >= 0 ? anchorIdx : 0;
  for (let i = 0; i < T.records.length; i++) {
    const tr = T.records[i];
    const ns = sessions[i];
    // 사유는 일지 본문과 구분되도록 항상 "- " 접두어 (이미 붙어 있으면 중복 방지)
    const rawExtra = (ns.resultExtra ?? "").trim();
    const extra = rawExtra
      ? (rawExtra.startsWith("- ") ? rawExtra : `- ${rawExtra}`)
      : "";
    const hasExtraSlot = !!tr.resultExtra;
    const olds = [tr.day, tr.apprDay, tr.apprNum, tr.resultMain, ...(hasExtraSlot ? [tr.resultExtra!] : [])];
    const news = [ns.useDay || "", ns.payDay || "", ns.apprNumber || "", ns.result || "", extra];
    for (let j = 0; j < olds.length; j++) {
      const r = replaceWithLinesegReset(out, olds[j], news[j], recordCursor);
      out = r.out;
      recordCursor = r.nextCursor;
    }

    // 슬롯 없는 회기에 사유가 있으면 별도 문단 복제·삽입 (결과 본문 다음 줄에)
    if (!hasExtraSlot && extra && extraParaTemplate && extraOldText) {
      const cloned = extraParaTemplate.replace(
        `<hp:t>${extraOldText}</hp:t>`,
        `<hp:t>${xmlEscape(extra)}</hp:t>`
      );
      out = out.slice(0, recordCursor) + cloned + out.slice(recordCursor);
      recordCursor += cloned.length;
    }
  }

  if (p.opinion !== undefined) {
    out = replaceOne(out, T.opinionText, p.opinion);
  }

  return out;
}

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

// 발달재활(놀이재활)형: 결과표 승인일자 칸이 날짜·시각 2단락으로 쌓여 있음.
const PLAY_SPEC: CoordSpec = {
  org: [0, 0, 2],
  name: [0, 1, 2],
  birth: [0, 2, 2],
  date: COL5.map((c) => [1, 0, c] as Coord),
  start: COL5.map((c) => [1, 2, c] as Coord),
  end: COL5.map((c) => [1, 3, c] as Coord),
  voucher: COL5.map((c) => [1, 5, c] as Coord),
  extra: COL5.map((c) => [1, 6, c] as Coord),
  amount: COL5.map((c) => [1, 7, c] as Coord),
  result: ROW5.map((r) => ({
    date: [2, r, 0, 0] as Coord, // 승인일자 칸 1단락: 날짜
    time: [2, r, 0, 1] as Coord, // 승인일자 칸 2단락: 시각
    apprNum: [2, r, 1] as Coord,
    result: [2, r, 2] as Coord,
  })),
  note: [2, 6, 1],
};

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

// 순천형: 회기 5칸. 결과표(표2)는 동탄형과 동일 5열. 별지 상세표(표3)는 현재 비워둠.
const SUNCHEON_SPEC: CoordSpec = {
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
  // 앞 페이지(표2): 날짜·승인일자·승인번호만. 결과 narrative 는 별지(표3)에 넣는다.
  result: ROW5.map((r) => ({
    date: [2, r, 0] as Coord, // 서비스 제공 일자
    apprDate: [2, r, 1] as Coord, // 승인일자
    apprNum: [2, r, 2] as Coord,
  })),
  // 별지(표3): 회기 블록 3행(서비스일자/승인일자/승인번호) + 큰 결과칸(c2).
  detail: ROW5.map((_, i) => ({
    date: [3, 1 + i * 3, 1] as Coord,
    apprDate: [3, 2 + i * 3, 1] as Coord,
    apprNum: [3, 3 + i * 3, 1] as Coord,
    result: [3, 1 + i * 3, 2] as Coord,
  })),
};

// 원주형: 회기 5칸(+누계 열은 안 채움). 헤더 값이 c3 열. 금액은 바우처·자부담·총금액
// 3행으로 나뉘는데 우리 데이터는 총액만 있어 '총 금액'(r9) 에 넣는다.
const WONJU_SPEC: CoordSpec = {
  org: [0, 0, 3],
  serviceArea: [0, 1, 3],
  name: [0, 2, 3],
  birth: [0, 3, 3],
  date: COL5.map((c) => [1, 0, c] as Coord),
  start: COL5.map((c) => [1, 2, c] as Coord),
  end: COL5.map((c) => [1, 3, c] as Coord),
  voucher: COL5.map((c) => [1, 5, c] as Coord),
  extra: COL5.map((c) => [1, 6, c] as Coord),
  amount: COL5.map((c) => [1, 9, c] as Coord), // 총 금액 행
  voucherAmount: COL5.map((c) => [1, 7, c] as Coord), // 3.총이용금액 > 바우처 행
  copayAmount: COL5.map((c) => [1, 8, c] as Coord), // 3.총이용금액 > 자부담 행
  result: ROW5.map((r) => ({
    date: [3, r, 0] as Coord, // 제공일자
    apprDate: [3, r, 1] as Coord, // 승인일자
    apprNum: [3, r, 2] as Coord,
    status: [3, r, 3] as Coord, // 이용자의 상태
    result: [3, r, 4] as Coord, // 서비스 결과
  })),
};

const COORD_SPECS: Record<Exclude<RecordFormKey, "standard">, CoordSpec> = {
  play: PLAY_SPEC,
  dongtan: DONGTAN_SPEC,
  namyangju: NAMYANGJU_SPEC,
  suncheon: SUNCHEON_SPEC,
  wonju: WONJU_SPEC,
};

const TEMPLATE_FILES: Record<RecordFormKey, string> = {
  standard: "기록지_template.hwpx",
  play: "기록지_template_play.hwpx",
  dongtan: "기록지_template_dongtan.hwpx",
  namyangju: "기록지_template_namyangju.hwpx",
  suncheon: "기록지_template_suncheon.hwpx",
  wonju: "기록지_template_wonju.hwpx",
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
  for (let i = 0; i < MAX_SESSIONS; i++) {
    const s = sessions[i];
    push(edits, spec.date[i], s?.date ?? "");
    push(edits, spec.start[i], s?.startTime ?? "");
    push(edits, spec.end[i], s?.endTime ?? "");
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
      push(edits, r.status, "");
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

// 한 장(5회기 이하) HWPX 생성
export function generateOneRecordSheet(
  templateBuf: Buffer,
  p: RecordPayload,
  form: RecordFormKey = "standard"
): Buffer {
  const oldXml = readSection0(templateBuf);
  const newXml =
    form === "standard"
      ? substituteRecordXml(oldXml, p)
      : substituteCoordXml(oldXml, p, COORD_SPECS[form]);
  return patchSection0(templateBuf, newXml);
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
