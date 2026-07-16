// 한글 표준문서(.hwpx) 의 zip 컨테이너를 한글이 요구하는 대로 정확히
// 재조립하는 헬퍼. JSZip 등 범용 라이브러리는 mimetype 압축 방식,
// 빈 디렉토리 항목, general purpose flag 등에서 한글의 까다로운 검증을
// 통과하지 못해서 직접 작성.
//
// 원본 .hwpx 와 byte-identical 한 재빌드를 확인한 코드 (커밋 ca917ac).

import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";

export type ZipEntry = {
  name: string;
  method: number;          // 0 = STORE, 8 = DEFLATE
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  compressedData: Buffer;
};

export function parseZipEntries(buf: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = [];
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = 0;
  while (pos + 30 <= buf.byteLength) {
    const sig = view.getUint32(pos, true);
    if (sig !== 0x04034b50) break;
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

export function buildZip(entries: ZipEntry[], opts?: { utf8Names?: boolean }): Buffer {
  const chunks: Buffer[] = [];
  const offsets: number[] = [];
  let offset = 0;
  // 일반 zip 의 한글 파일명을 위해 UTF-8 플래그(bit 11, 0x0800) 필요.
  // HWPX 내부 패키지는 원본 호환성을 위해 호출 측에서 false 로 둠.
  const flagFor = (m: number) => {
    let f = m === 8 ? 0x0004 : 0x0000;
    if (opts?.utf8Names) f |= 0x0800;
    return f;
  };
  const DOS_DATE_1980 = 33; // (1980-1980)<<9 | 1<<5 | 1
  const DOS_TIME_ZERO = 0;
  const VERSION_NEEDED = 20;
  const VERSION_MADE_BY = 0x0B17; // Windows NTFS, ZIP spec 2.3

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

// 생성 문서의 미리보기(썸네일)는 원본 템플릿에서 그대로 복사돼 온다. 템플릿의 썸네일은
// 처음 양식을 만들 때(다른 아동/샘플)의 내용이라, 파일 관리자·한글 미리보기에는 '남의 내용'이
// 보이고 실제로 열면 본문은 옳은 현상이 생긴다(본문 section0.xml 만 교체하기 때문).
// → 출력 시 미리보기 이미지는 제거하고 텍스트 미리보기는 비워서 잘못된 미리보기를 없앤다.
// (미리보기는 선택 스트림이라 없어도 한글이 정상적으로 열고, 저장 시 다시 생성한다.)
function neutralizePreview(entries: ZipEntry[]): ZipEntry[] {
  const out: ZipEntry[] = [];
  for (const e of entries) {
    if (/^Preview\/PrvImage\./i.test(e.name)) continue; // 썸네일 이미지 제거
    if (e.name === "Preview/PrvText.txt") {
      const empty = Buffer.alloc(0); // 텍스트 미리보기 비움(컨테이너 참조는 유지)
      out.push({ ...e, method: 0, compressedData: empty, compressedSize: 0, uncompressedSize: 0, crc: 0 });
      continue;
    }
    out.push(e);
  }
  return out;
}

// section0.xml 만 새 내용으로 교체하고 나머지는 원본 그대로 보존해서 .hwpx 출력.
export function patchSection0(templateBuf: Buffer, newSectionXml: string): Buffer {
  const entries = parseZipEntries(templateBuf);
  const sec = entries.find((e) => e.name === "Contents/section0.xml");
  if (!sec) throw new Error("section0.xml not found in template");
  const buf = Buffer.from(newSectionXml, "utf8");
  sec.compressedData = deflateRawSync(buf, { level: 9 });
  sec.compressedSize = sec.compressedData.length;
  sec.uncompressedSize = buf.length;
  sec.crc = crc32(buf);
  sec.method = 8;
  return buildZip(neutralizePreview(entries));
}

export function readSection0(templateBuf: Buffer): string {
  return readEntryText(templateBuf, "Contents/section0.xml");
}

export function readHeader(templateBuf: Buffer): string {
  return readEntryText(templateBuf, "Contents/header.xml");
}

export function readEntryText(templateBuf: Buffer, name: string): string {
  const entries = parseZipEntries(templateBuf);
  const e = entries.find((x) => x.name === name);
  if (!e) throw new Error(`${name} not found in template`);
  return e.method === 8 ? inflateRawSync(e.compressedData).toString("utf8") : e.compressedData.toString("utf8");
}

// ── 중앙디렉토리(EOCD→CD) 기반 zip 리더 ───────────────────────────────
// parseZipEntries 는 로컬헤더를 순차로 걸으며 LFH 의 압축크기로 다음 위치를 계산하는데,
// 자바 ZipOutputStream(hwpxlib 등)이 만드는 zip 은 데이터 디스크립터(GP bit3)를 써서
// LFH 의 크기가 0 이라 순차 파싱이 첫 엔트리에서 멈춘다. 중앙디렉토리는 항상 정확한
// 크기·오프셋을 담으므로, 어떤 도구가 만든 .hwpx 든 안전하게 읽으려면 이 리더를 쓴다.
export function parseZipEntriesFromCD(buf: Buffer): ZipEntry[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("EOCD(중앙디렉토리 끝) 레코드를 찾을 수 없어요 — 올바른 zip 이 아닙니다");
  const count = view.getUint16(eocd + 10, true);
  let pos = view.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (pos + 46 > buf.byteLength || view.getUint32(pos, true) !== 0x02014b50) break;
    const method = view.getUint16(pos + 10, true);
    const crc = view.getUint32(pos + 16, true);
    const compSize = view.getUint32(pos + 20, true);
    const uncSize = view.getUint32(pos + 24, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localOff = view.getUint32(pos + 42, true);
    const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString("utf8");
    // 실제 데이터 시작 = 로컬헤더 오프셋 + 30 + (로컬헤더의) name·extra 길이
    const lfhNameLen = view.getUint16(localOff + 26, true);
    const lfhExtraLen = view.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lfhNameLen + lfhExtraLen;
    entries.push({
      name, method, crc,
      compressedSize: compSize,
      uncompressedSize: uncSize,
      compressedData: Buffer.from(buf.subarray(dataStart, dataStart + compSize)),
    });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

// hwp2hwpx(hwpxlib) 버그: 문단 '고정(FIXED)' 줄간격을 HWPUNIT 값 그대로 type="PERCENT" 로 내보낸다.
// 예) FIXED value="1600"(=16pt 고정) → PERCENT value="1600"(=1600% = 글자높이의 16배) → 셀이 폭발해
// 한글로 열면 1페이지 양식이 3~9페이지로 늘어난다. 실무상 퍼센트 줄간격은 200% 이하이므로
// value>=400 인 PERCENT 는 오변환된 FIXED 로 보고 FIXED 로 되돌린다. (header.xml 의 paraPr 에만 존재.)
// (2026-07-16 로컬 한글 렌더로 원인 규명·검증: 되돌리면 실제 다운로드·샘플 모두 1페이지로 복원됨.)
export function fixHwpxLineSpacing(headerXml: string): string {
  return headerXml.replace(/<(?:\w+:)?lineSpacing\b[^>]*\/>/g, (tag) => {
    if (!/type="PERCENT"/.test(tag)) return tag;
    const m = tag.match(/value="(\d+)"/);
    return m && Number(m[1]) >= 400 ? tag.replace('type="PERCENT"', 'type="FIXED"') : tag;
  });
}

// hwp2hwpx(hwpxlib) 출력은 데이터 디스크립터 zip 이라 바로일지의 순차 리더가 못 읽는다.
// 중앙디렉토리로 읽어 mimetype 은 STORE 로 풀어 첫 엔트리에 두고(HWPX/ODF 관례), 나머지는 그대로
// 두어 바로일지·한글이 읽는 표준 zip 으로 재포장한다. 겸사겸사 위 줄간격 오변환도 교정한다.
export function normalizeHwpxZip(buf: Buffer): Buffer {
  const entries = parseZipEntriesFromCD(buf);
  if (entries.length === 0) throw new Error("zip 엔트리를 읽지 못했어요 — 변환 결과가 올바르지 않습니다");
  const norm = entries.map((e) => {
    if (e.name === "mimetype" && e.method === 8) {
      const raw = inflateRawSync(e.compressedData);
      return { ...e, method: 0, compressedData: raw, compressedSize: raw.length, uncompressedSize: raw.length, crc: crc32(raw) };
    }
    if (e.name === "Contents/header.xml") {
      const raw = e.method === 8 ? inflateRawSync(e.compressedData) : e.compressedData;
      const fixed = fixHwpxLineSpacing(raw.toString("utf8"));
      const out = Buffer.from(fixed, "utf8");
      const comp = deflateRawSync(out, { level: 9 });
      return { ...e, method: 8, compressedData: comp, compressedSize: comp.length, uncompressedSize: out.length, crc: crc32(out) };
    }
    return e;
  });
  norm.sort((a, b) => (a.name === "mimetype" ? -1 : b.name === "mimetype" ? 1 : 0));
  return buildZip(norm);
}

// 여러 내부 파일(예: section0 + header)을 한 번에 교체해 .hwpx 출력.
export function patchFiles(templateBuf: Buffer, files: Record<string, string>): Buffer {
  const entries = parseZipEntries(templateBuf);
  for (const [name, xml] of Object.entries(files)) {
    const e = entries.find((x) => x.name === name);
    if (!e) throw new Error(`${name} not found in template`);
    const buf = Buffer.from(xml, "utf8");
    e.compressedData = deflateRawSync(buf, { level: 9 });
    e.compressedSize = e.compressedData.length;
    e.uncompressedSize = buf.length;
    e.crc = crc32(buf);
    e.method = 8;
  }
  return buildZip(neutralizePreview(entries));
}

export function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
