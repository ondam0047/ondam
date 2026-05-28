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
  // 원본 .hwpx 의 general purpose flag:
  //   STORE(0) → 0x0000, DEFLATE(8) → 0x0004 (max compression 비트)
  // 한글이 이 비트 패턴까지 비교 검증해 다르면 거부.
  const flagFor = (method: number) => (method === 8 ? 0x0004 : 0x0000);
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
    lfh.writeUInt16LE(flagFor(e.method), 6);
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
    cdh.writeUInt16LE(flagFor(e.method), 8);
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
    // 원본 .hwpx 가 모든 항목에 동일하게 쓰는 외부 속성 값
    cdh.writeUInt32LE(0x81800020, 38);
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

  // 캘린더: 2번째 hp:tbl 영역을 cellAddr 기반으로 재작성
  const tblStarts: number[] = [];
  const tblRe = /<hp:tbl /g;
  let m: RegExpExecArray | null;
  while ((m = tblRe.exec(out)) !== null) tblStarts.push(m.index);
  if (tblStarts.length >= 2) {
    const calStart = tblStarts[1];
    const calEnd = out.indexOf("</hp:tbl>", calStart) + "</hp:tbl>".length;
    const cal = out.slice(calStart, calEnd);
    const newCal = rewriteCalendar(cal, p.year, p.month, p.sessions);
    out = out.slice(0, calStart) + newCal + out.slice(calEnd);
  }

  return out;
}

// ─── 캘린더 재구성 ─────────────────────────────────────────────────────────
// 양식 캘린더 좌표계 (Feb 2026 템플릿 분석 결과):
//   요일 헤더: rowAddr=0,           colAddr=0,2,4,6,8,10,12 (colspan=2)
//   날짜 셀:  rowAddr=1,3,5,7,9    colAddr=0,2,4,6,8,10,12 (짝수)
//   시간 셀:  rowAddr=2,4,6,8,10   colAddr=1,3,5,7,9,11,13 (홀수)
//
// 새 달의 day d 가 visualPos = offset + (d-1) 자리 차지 → 그 자리의
// 날짜셀(2W+1, 2DOW) 에 day, 시간셀(2W+2, 2DOW+1) 에 시간 배치.
// 양식이 5주(28일 + 빈 1주) 까지 커버 → 30·31일 있는 달은 마지막 며칠 잘림.
function rewriteCalendar(
  calXml: string,
  year: number,
  month: number,
  sessions: SessionInput[]
): string {
  const dim = new Date(year, month, 0).getDate();
  const offset = new Date(year, month - 1, 1).getDay(); // 0=일

  const sessionMap = new Map<number, string>();
  for (const s of sessions) sessionMap.set(s.day, s.time);

  return calXml.replace(/<hp:tc\s[^>]*>[\s\S]*?<\/hp:tc>/g, (cellXml) => {
    const addrTag = cellXml.match(/<hp:cellAddr[^/]*\/>/)?.[0];
    if (!addrTag) return cellXml;
    const col = Number(addrTag.match(/colAddr="(\d+)"/)?.[1] ?? -1);
    const row = Number(addrTag.match(/rowAddr="(\d+)"/)?.[1] ?? -1);
    if (col < 0 || row < 0) return cellXml;

    // 날짜 셀: row 1·3·5·7·9, col 0·2·4·6·8·10·12
    if (row >= 1 && row <= 9 && row % 2 === 1 && col >= 0 && col <= 12 && col % 2 === 0) {
      const week = (row - 1) / 2;
      const dow = col / 2;
      const pos = week * 7 + dow;
      const day = pos - offset + 1;
      const text = day >= 1 && day <= dim ? String(day) : "";
      return setCellText(cellXml, text);
    }

    // 시간 셀: row 2·4·6·8·10, col 1·3·5·7·9·11·13
    if (row >= 2 && row <= 10 && row % 2 === 0 && col >= 1 && col <= 13 && col % 2 === 1) {
      const week = (row - 2) / 2;
      const dow = (col - 1) / 2;
      const pos = week * 7 + dow;
      const day = pos - offset + 1;
      let text = "           "; // 11칸 공백 기본
      let hasSession = false;
      if (day >= 1 && day <= dim) {
        const t = sessionMap.get(day);
        if (t) { text = t.padEnd(11, " ").slice(0, 11); hasSession = true; }
      }
      // 시간 텍스트는 항상 작은 시간폰트(charPrIDRef=2)로.
      let result = setCellText(cellXml, text, 2);
      // 실제 회기 시간이 들어가는 칸은 줄바꿈 2줄 라인세그로 교체
      // (양식 원본의 16:00~16:50 칸과 동일한 시각 효과)
      if (hasSession) {
        result = ensureTwoLineSeg(result);
      }
      return result;
    }

    // 그 외(헤더 등) 셀은 그대로
    return cellXml;
  });
}

// 시간 셀의 linesegarray 를 양식 원본 시간 셀(2줄로 wrap) 형태로 강제.
// 단일 lineseg(textpos=0) 만 있는 경우 textpos=6(11자 중 후반) 두 번째 segment 추가.
function ensureTwoLineSeg(cellXml: string): string {
  // 이미 textpos="6" 라인세그가 있으면 그대로 둠
  if (/textpos="6"/.test(cellXml)) return cellXml;
  // 단일 라인세그를 2줄짜리로 교체
  return cellXml.replace(
    /<hp:linesegarray><hp:lineseg\s+textpos="0"[^/]*\/><\/hp:linesegarray>/,
    `<hp:linesegarray>` +
    `<hp:lineseg textpos="0" vertpos="0" vertsize="900" textheight="900" baseline="765" spacing="540" horzpos="0" horzsize="3156" flags="393216"/>` +
    `<hp:lineseg textpos="6" vertpos="1440" vertsize="900" textheight="900" baseline="765" spacing="540" horzpos="0" horzsize="3156" flags="393216"/>` +
    `</hp:linesegarray>`
  );
}

// 셀 안의 hp:t 내용 교체. 두 패턴 처리:
//   A) <hp:run X><hp:t>이전</hp:t></hp:run>  → 텍스트(필요시 X 도) 교체
//   B) <hp:run X/>                            → <hp:run X|forcedPid><hp:t>새</hp:t></hp:run>
// forceCharPrIDRef 가 주어지면 원래 charPrIDRef 와 무관하게 그 값으로 덮어씀.
function setCellText(cellXml: string, text: string, forceCharPrIDRef?: number): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (forceCharPrIDRef !== undefined) {
    const pid = String(forceCharPrIDRef);
    if (/<hp:run\s+charPrIDRef="\d+"\s*>\s*<hp:t>[^<]*<\/hp:t>\s*<\/hp:run>/.test(cellXml)) {
      return cellXml.replace(
        /<hp:run\s+charPrIDRef="\d+"\s*>\s*<hp:t>[^<]*<\/hp:t>\s*<\/hp:run>/,
        `<hp:run charPrIDRef="${pid}"><hp:t>${escaped}</hp:t></hp:run>`
      );
    }
    if (/<hp:run\s+charPrIDRef="\d+"\s*\/>/.test(cellXml)) {
      return cellXml.replace(
        /<hp:run\s+charPrIDRef="\d+"\s*\/>/,
        `<hp:run charPrIDRef="${pid}"><hp:t>${escaped}</hp:t></hp:run>`
      );
    }
  }
  // 원래 charPrIDRef 유지 모드 (날짜셀에서 주말 빨/파 보존용)
  if (/<hp:t>[^<]*<\/hp:t>/.test(cellXml)) {
    return cellXml.replace(/<hp:t>[^<]*<\/hp:t>/, `<hp:t>${escaped}</hp:t>`);
  }
  if (/<hp:run\s+charPrIDRef="\d+"\s*\/>/.test(cellXml)) {
    return cellXml.replace(
      /<hp:run\s+charPrIDRef="(\d+)"\s*\/>/,
      `<hp:run charPrIDRef="$1"><hp:t>${escaped}</hp:t></hp:run>`
    );
  }
  return cellXml;
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
