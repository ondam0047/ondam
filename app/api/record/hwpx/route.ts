import { NextRequest } from "next/server";
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

// 기록지 양식은 1회 5회기 기준. 그보다 많으면 5회만, 적으면 나머지 자리 비움.
const MAX_SESSIONS = 5;

type SessionDetail = {
  date: string;       // 헤더용 'M/D' 형식 (예: '2/10')
  startTime: string;  // 'HH:MM'
  endTime: string;    // 'HH:MM'
  voucher: string;    // 분 (예: '40')
  extra: string;      // 분 (예: '10')
  amount: string;     // 원 (예: '65,000')
  useDay: string;     // 제공일자 (일자만, 예: '10')
  payDay: string;     // 승인일자 (일자만, 예: '10')
  apprNumber: string; // 승인번호 (예: '500862090623')
  result: string;     // 상태/결과 텍스트
  resultExtra?: string;
};

type Payload = {
  childName: string;
  childBirth: string;  // 'YY.MM.DD' 또는 자유 형식
  org: string;
  month: number;       // 1-12
  sessions: SessionDetail[];
  opinion?: string;
};

const TEMPLATE_PATH = path.join(process.cwd(), "samples", "기록지_template.hwpx");

// 양식의 원본 값
const T = {
  title: "월)",                // '발달재활서비스 제공 기록지 (2월)' 의 끝부분
  titleMonth: " (2",            // '발달재활서비스 제공 기록지 ' 뒤
  org: "온담말언어발달센터",
  name: "노하은",
  birth: "19.08.31",
  dates: ["2/10", "2/11", "2/19", "2/24", "2/26"] as const,
  startTimes: ["15:10", "15:55", "15:45", "16:00", "15:45"] as const,
  endTimes: ["16:01", "16:45", "16:36", "16:53", "16:47"] as const,
  voucherMins: ["40", "40", "40", "40", "20"] as const,
  extraMins: ["10", "10", "10", "10", "30"] as const,
  amounts: ["65,000", "65,000", "65,000", "65,000", "65,000"] as const,
  // 결과 기록 5개 (각 행: 제공일/승인일/승인번호/내용/내용2)
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

// hp:t 텍스트 교체 + 그걸 감싸는 hp:p 의 linesegarray(캐시된 줄 위치) 삭제.
// 한글이 파일을 열면서 새 텍스트에 맞춰 다시 계산하므로, 텍스트 길이가
// 줄어들거나 늘어나도 '문서 변조' 검증을 통과함. (확인된 동작)
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

// 같은 패턴 olds 가 여러 번 나오면 순서대로 news 값으로 차례 교체.
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

function substituteRecordXml(xml: string, p: Payload): string {
  let out = xml;

  // 1) 제목 월 — '발달재활서비스 제공 기록지 (2월)' 의 ' (2' / '월)' 두 hp:t
  out = replaceOne(out, T.titleMonth, ` (${p.month}`);
  // 2) 기관명
  out = replaceOne(out, T.org, p.org);
  // 3) 이용자 이름
  out = replaceOne(out, T.name, p.childName);
  // 4) 생년월일
  out = replaceOne(out, T.birth, p.childBirth);

  // 5) 회기 5개 — 부족하면 빈 문자열로 채움
  const sessions = p.sessions.slice(0, MAX_SESSIONS);
  while (sessions.length < MAX_SESSIONS) {
    sessions.push({
      date: "", startTime: "", endTime: "",
      voucher: "", extra: "", amount: "",
      useDay: "", payDay: "", apprNumber: "", result: "",
    });
  }

  // 5-1) 헤더 날짜 5개
  out = replaceSequence(out, T.dates, sessions.map((s) => s.date));
  // 5-2) 시작시간 5개
  out = replaceSequence(out, T.startTimes, sessions.map((s) => s.startTime));
  // 5-3) 종료시간 5개
  out = replaceSequence(out, T.endTimes, sessions.map((s) => s.endTime));
  // 5-4) 바우처 분
  out = replaceSequence(out, T.voucherMins, sessions.map((s) => s.voucher));
  // 5-5) 추가구매 분
  out = replaceSequence(out, T.extraMins, sessions.map((s) => s.extra));
  // 5-6) 금액
  out = replaceSequence(out, T.amounts, sessions.map((s) => s.amount));

  // 6) 결과 기록 5행 — '※ 상태 및 결과 기록' 앵커 뒤부터 검색해 처리.
  //    (양식 위쪽에도 '10', '11' 등 같은 숫자가 있어서 cursor 안 잡아두면
  //    엉뚱한 셀이 치환됨)
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

  // 7) 부모 의견
  if (p.opinion !== undefined) {
    out = replaceOne(out, T.opinionText, p.opinion);
  }

  return out;
}

// 한 장(5회기) 분량의 .hwpx 생성
function generateOneSheet(templateBuf: Buffer, p: Payload): Buffer {
  const oldXml = readSection0(templateBuf);
  const newXml = substituteRecordXml(oldXml, p);
  return patchSection0(templateBuf, newXml);
}

// 여러 .hwpx 를 일반 zip 으로 묶기 (한글파일 검증 대상 아님, 평범한 zip)
function bundleAsZip(files: { name: string; data: Buffer }[]): Buffer {
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
  return buildZip(entries);
}

function safeFileName(s: string): string {
  return s.replace(/[/\\?%*:|"<>]/g, "_") || "기록지";
}

export async function POST(req: NextRequest) {
  const p = (await req.json()) as Payload;

  let templateBuf: Buffer;
  try {
    templateBuf = await readFile(TEMPLATE_PATH);
  } catch {
    return Response.json(
      { error: "템플릿(samples/기록지_template.hwpx)을 찾을 수 없어요." },
      { status: 500 }
    );
  }

  // 회기를 5개씩 묶음. 5개 이하면 1장, 6~10개면 2장 ...
  const chunks: SessionDetail[][] = [];
  for (let i = 0; i < p.sessions.length; i += MAX_SESSIONS) {
    chunks.push(p.sessions.slice(i, i + MAX_SESSIONS));
  }
  if (chunks.length === 0) chunks.push([]); // 회기 0개라도 빈 장 1개

  const baseName = `${safeFileName(p.childName)}_${String(p.month).padStart(2, "0")}월_기록지`;

  // 1장이면 .hwpx 단일 응답
  if (chunks.length === 1) {
    const out = generateOneSheet(templateBuf, { ...p, sessions: chunks[0] });
    const filename = encodeURIComponent(`${baseName}.hwpx`);
    return new Response(new Uint8Array(out), {
      headers: {
        "Content-Type": "application/hwp+zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      },
    });
  }

  // 2장 이상이면 .zip 으로 묶어서 응답
  const sheets = chunks.map((chunkSessions, idx) => ({
    name: `${baseName}_${idx + 1}.hwpx`,
    data: generateOneSheet(templateBuf, { ...p, sessions: chunkSessions }),
  }));
  const zipBuf = bundleAsZip(sheets);
  const filename = encodeURIComponent(`${baseName}.zip`);
  return new Response(new Uint8Array(zipBuf), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
