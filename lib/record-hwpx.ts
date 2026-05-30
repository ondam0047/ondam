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

  const anchorIdx = out.indexOf("※");
  let recordCursor = anchorIdx >= 0 ? anchorIdx : 0;
  for (let i = 0; i < T.records.length; i++) {
    const tr = T.records[i];
    const ns = sessions[i];
    const olds = [tr.day, tr.apprDay, tr.apprNum, tr.resultMain, ...(tr.resultExtra ? [tr.resultExtra] : [])];
    const news = [ns.useDay || "", ns.payDay || "", ns.apprNumber || "", ns.result || "", ns.resultExtra ?? ""];
    for (let j = 0; j < olds.length; j++) {
      const r = replaceWithLinesegReset(out, olds[j], news[j], recordCursor);
      out = r.out;
      recordCursor = r.nextCursor;
    }
  }

  if (p.opinion !== undefined) {
    out = replaceOne(out, T.opinionText, p.opinion);
  }

  return out;
}

export async function readRecordTemplate(): Promise<Buffer> {
  return readFile(RECORD_TEMPLATE_PATH);
}

// 한 장(5회기 이하) HWPX 생성
export function generateOneRecordSheet(templateBuf: Buffer, p: RecordPayload): Buffer {
  const oldXml = readSection0(templateBuf);
  const newXml = substituteRecordXml(oldXml, p);
  return patchSection0(templateBuf, newXml);
}

// 회기 수에 따라 1장 또는 N장으로 분할. 항상 Buffer[] 반환.
export function buildRecordSheets(templateBuf: Buffer, p: RecordPayload): Buffer[] {
  const chunks: RecordSessionDetail[][] = [];
  for (let i = 0; i < p.sessions.length; i += MAX_SESSIONS) {
    chunks.push(p.sessions.slice(i, i + MAX_SESSIONS));
  }
  if (chunks.length === 0) chunks.push([]);
  return chunks.map((chunkSessions) =>
    generateOneRecordSheet(templateBuf, { ...p, sessions: chunkSessions })
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
