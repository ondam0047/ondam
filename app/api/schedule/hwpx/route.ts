import { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";

type SessionInput = { day: number; weekday: string; time: string; makeup: boolean };

type Payload = {
  childName: string;
  childBirth?: string;
  therapist: string;
  serviceType: string;
  year: number;
  month: number;
  mgmtNumber?: string;
  writeDate: string;
  pvOrg: string;
  pvTel: string;
  pvCharge: string;
  pvType: string;
  costUnit: string;
  costSelf: string;
  costTotal: number;
  cycle: string;
  target: number;
  sessions: SessionInput[];
};

const TEMPLATE_PATH = path.join(process.cwd(), "samples", "일정표_template.hwpx");

const TEMPLATE_VALUES = {
  title: "서비스 일정표 (2월)",
  name: "노하은",
  therapist: "주채린",
  writeDate: "26.01.28",
  org: "온담말언어발달센터",
  phone: "775-0047",
  cycle: "수 목",
  daysList: "4 5 11 12 26",
  costUnit: "65,000원",
  costTotal: "325,000원",
  typeFirstRun: "언어",
  typeSecondRun: "재활",
};

// ─── ZIP 파싱/생성 ──────────────────────────────────────────────────────────
// .hwpx 는 OPC 패키지 — mimetype 은 STORE, 디렉토리 항목 없음, 1980-01-01 날짜.
// 안전을 위해 원본 zip 의 각 파일 그대로(이미 압축된 바이트 그대로)를 들고
// section0.xml 만 다시 압축해서 새로 조립한다.

type ZipEntry = {
  name: string;
  method: number; // 0 = STORE, 8 = DEFLATE
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  compressedData: Buffer;
};

function parseZipEntries(buf: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = [];
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = 0;
  while (pos + 30 <= buf.byteLength) {
    const sig = view.getUint32(pos, true);
    if (sig !== 0x04034b50) break; // 로컬 파일 헤더 시그니처 아닌 경우 종료
    const method = view.getUint16(pos + 8, true);
    const crc = view.getUint32(pos + 14, true);
    const compSize = view.getUint32(pos + 18, true);
    const uncSize = view.getUint32(pos + 22, true);
    const nameLen = view.getUint16(pos + 26, true);
    const extraLen = view.getUint16(pos + 28, true);
    const name = buf.subarray(pos + 30, pos + 30 + nameLen).toString("utf8");
    const dataStart = pos + 30 + nameLen + extraLen;
    entries.push({
      name,
      method,
      crc,
      compressedSize: compSize,
      uncompressedSize: uncSize,
      compressedData: Buffer.from(buf.subarray(dataStart, dataStart + compSize)),
    });
    pos = dataStart + compSize;
  }
  return entries;
}

function buildZip(entries: ZipEntry[]): Buffer {
  const chunks: Buffer[] = [];
  const offsets: number[] = [];
  let offset = 0;
  // 원본 .hwpx 는 UTF-8 플래그 없이(0) 만들어짐 — 파일명들이 전부 ASCII 이므로 OK.
  // 한글이 이 플래그를 까다롭게 검증하니 일부러 끄고 간다.
  const NO_FLAGS = 0x0000;
  // 원본의 version_made_by 와 동일하게: 0x0B17 (Windows NTFS, ZIP spec 2.3)
  const VERSION_MADE_BY = 0x0B17;
  const DOS_DATE_1980 = 33; // (1980-1980)<<9 | 1<<5 | 1
  const DOS_TIME_ZERO = 0;
  const VERSION_NEEDED = 20;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    offsets.push(offset);
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(VERSION_NEEDED, 4);
    lfh.writeUInt16LE(NO_FLAGS, 6);
    lfh.writeUInt16LE(e.method, 8);
    lfh.writeUInt16LE(DOS_TIME_ZERO, 10);
    lfh.writeUInt16LE(DOS_DATE_1980, 12);
    lfh.writeUInt32LE(e.crc >>> 0, 14);
    lfh.writeUInt32LE(e.compressedData.length, 18);
    lfh.writeUInt32LE(e.uncompressedSize, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);
    chunks.push(lfh, nameBuf, e.compressedData);
    offset += 30 + nameBuf.length + e.compressedData.length;
  }

  const cdStart = offset;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const nameBuf = Buffer.from(e.name, "utf8");
    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(VERSION_MADE_BY, 4);
    cdh.writeUInt16LE(VERSION_NEEDED, 6);
    cdh.writeUInt16LE(NO_FLAGS, 8);
    cdh.writeUInt16LE(e.method, 10);
    cdh.writeUInt16LE(DOS_TIME_ZERO, 12);
    cdh.writeUInt16LE(DOS_DATE_1980, 14);
    cdh.writeUInt32LE(e.crc >>> 0, 16);
    cdh.writeUInt32LE(e.compressedData.length, 20);
    cdh.writeUInt32LE(e.uncompressedSize, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30);
    cdh.writeUInt16LE(0, 32);
    cdh.writeUInt16LE(0, 34);
    cdh.writeUInt16LE(0, 36);
    cdh.writeUInt32LE(0, 38);
    cdh.writeUInt32LE(offsets[i], 42);
    chunks.push(cdh, nameBuf);
    offset += 46 + nameBuf.length;
  }
  const cdSize = offset - cdStart;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdStart, 16);
  eocd.writeUInt16LE(0, 20);
  chunks.push(eocd);

  return Buffer.concat(chunks);
}

// ─── XML 치환 로직 ─────────────────────────────────────────────────────────

function buildNewCalendarDays(year: number, month: number): string[] {
  const dim = new Date(year, month, 0).getDate();
  const offset = new Date(year, month - 1, 1).getDay(); // 0=일
  const arr = new Array(28).fill("");
  for (let d = 1; d <= dim; d++) {
    const pos = offset + d - 1;
    if (pos < 28) arr[pos] = String(d);
  }
  return arr;
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function substituteSectionXml(xml: string, p: Payload): string {
  let out = xml;

  out = out.replace(
    `<hp:t>${TEMPLATE_VALUES.title}</hp:t>`,
    `<hp:t>${xmlEscape(`서비스 일정표 (${p.month}월)`)}</hp:t>`
  );
  out = out.replace(
    `<hp:t>${TEMPLATE_VALUES.name}</hp:t>`,
    `<hp:t>${xmlEscape(p.childName)}</hp:t>`
  );
  out = out.split(`<hp:t>${TEMPLATE_VALUES.therapist}</hp:t>`).join(
    `<hp:t>${xmlEscape(p.therapist)}</hp:t>`
  );
  out = out.replace(
    `<hp:t>${TEMPLATE_VALUES.writeDate}</hp:t>`,
    `<hp:t>${xmlEscape(p.writeDate)}</hp:t>`
  );
  out = out.replace(
    `<hp:t>${TEMPLATE_VALUES.org}</hp:t>`,
    `<hp:t>${xmlEscape(p.pvOrg)}</hp:t>`
  );
  out = out.replace(
    `<hp:t>${TEMPLATE_VALUES.phone}</hp:t>`,
    `<hp:t>${xmlEscape(p.pvTel)}</hp:t>`
  );
  out = out.replace(
    `<hp:t>${TEMPLATE_VALUES.cycle}</hp:t>`,
    `<hp:t>${xmlEscape(p.cycle)}</hp:t>`
  );
  const daysList = p.sessions.map((s) => s.day).join(" ");
  out = out.replace(
    `<hp:t>${TEMPLATE_VALUES.daysList}</hp:t>`,
    `<hp:t>${xmlEscape(daysList)}</hp:t>`
  );
  // 서비스 종류: 양식이 '언어'+'재활' 두 런으로 쪼개진 자리 두 군데
  out = out.split(`<hp:t>${TEMPLATE_VALUES.typeFirstRun}</hp:t>`).join(
    `<hp:t>${xmlEscape(p.serviceType)}</hp:t>`
  );
  out = out.split(`<hp:t>${TEMPLATE_VALUES.typeSecondRun}</hp:t>`).join(`<hp:t></hp:t>`);

  // 단가/총가
  out = out.replace(
    `<hp:t>${TEMPLATE_VALUES.costUnit}</hp:t>`,
    `<hp:t>${xmlEscape(p.costUnit)}원</hp:t>`
  );
  out = out.replace(
    `<hp:t>${TEMPLATE_VALUES.costTotal}</hp:t>`,
    `<hp:t>${xmlEscape(p.costTotal.toLocaleString("ko-KR"))}원</hp:t>`
  );

  // 횟수: 새 단가 셀 뒤 첫 `<hp:t>5</hp:t>`
  const newUnit = `<hp:t>${xmlEscape(p.costUnit)}원</hp:t>`;
  const targetRe = new RegExp(
    escapeRegex(newUnit) + `([\\s\\S]*?)<hp:t>5</hp:t>`
  );
  out = out.replace(targetRe, (whole) =>
    whole.replace(/<hp:t>5<\/hp:t>([^<]*)$/, `<hp:t>${p.target}</hp:t>$1`)
  );

  // 본인부담금: 새 총가 셀 뒤 첫 `<hp:t>0</hp:t>`
  const newTotal = `<hp:t>${xmlEscape(p.costTotal.toLocaleString("ko-KR"))}원</hp:t>`;
  const selfRe = new RegExp(
    escapeRegex(newTotal) + `([\\s\\S]*?)<hp:t>0</hp:t>`
  );
  out = out.replace(selfRe, (whole) =>
    whole.replace(/<hp:t>0<\/hp:t>([^<]*)$/, `<hp:t>${xmlEscape(p.costSelf)}</hp:t>$1`)
  );

  // 캘린더: 2번째 hp:tbl 영역
  const tblStarts: number[] = [];
  const tblRe = /<hp:tbl /g;
  let m: RegExpExecArray | null;
  while ((m = tblRe.exec(out)) !== null) tblStarts.push(m.index);
  if (tblStarts.length >= 2) {
    const calStart = tblStarts[1];
    const calEnd = out.indexOf("</hp:tbl>", calStart) + "</hp:tbl>".length;
    let cal = out.slice(calStart, calEnd);

    // 회기 시간 모두 비우기
    cal = cal.replace(/<hp:t>\d{2}:\d{2}~\d{2}:\d{2}<\/hp:t>/g, `<hp:t></hp:t>`);

    // 날짜 1..28을 새 달의 자리에 맞게 재배치
    const newDays = buildNewCalendarDays(p.year, p.month);
    let expected = 1;
    cal = cal.replace(/<hp:t>(\d{1,2})<\/hp:t>/g, (match, ds: string) => {
      const n = Number(ds);
      if (n === expected && expected <= 28) {
        const v = newDays[expected - 1];
        expected++;
        return `<hp:t>${v}</hp:t>`;
      }
      return match;
    });

    out = out.slice(0, calStart) + cal + out.slice(calEnd);
  }

  return out;
}

// ─── 라우트 핸들러 ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const p = (await req.json()) as Payload;

  let templateBuf: Buffer;
  try {
    templateBuf = await readFile(TEMPLATE_PATH);
  } catch {
    return Response.json(
      { error: "템플릿(samples/일정표_template.hwpx)을 찾을 수 없어요." },
      { status: 500 }
    );
  }

  // 원본 zip 의 각 파일 항목을 그대로 보존 (압축 방식·CRC 포함)
  const entries = parseZipEntries(templateBuf);
  const sec = entries.find((e) => e.name === "Contents/section0.xml");
  if (!sec) {
    return Response.json({ error: "section0.xml 없음" }, { status: 500 });
  }

  // section0.xml 복원 → 치환 → 재압축
  const oldXml =
    sec.method === 8
      ? inflateRawSync(sec.compressedData).toString("utf8")
      : sec.compressedData.toString("utf8");
  const newXml = substituteSectionXml(oldXml, p);
  const newXmlBuf = Buffer.from(newXml, "utf8");
  const newCompressed = deflateRawSync(newXmlBuf, { level: 9 });

  sec.compressedData = newCompressed;
  sec.compressedSize = newCompressed.length;
  sec.uncompressedSize = newXmlBuf.length;
  sec.crc = crc32(newXmlBuf);
  sec.method = 8;

  const out = buildZip(entries);

  const filename = encodeURIComponent(
    `${p.childName || "일정표"}_${p.year}년${String(p.month).padStart(2, "0")}월.hwpx`
  );
  return new Response(new Uint8Array(out), {
    headers: {
      "Content-Type": "application/hwp+zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
