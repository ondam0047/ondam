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

export function buildZip(entries: ZipEntry[]): Buffer {
  const chunks: Buffer[] = [];
  const offsets: number[] = [];
  let offset = 0;
  const flagFor = (m: number) => (m === 8 ? 0x0004 : 0x0000);
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
  return buildZip(entries);
}

export function readSection0(templateBuf: Buffer): string {
  const entries = parseZipEntries(templateBuf);
  const sec = entries.find((e) => e.name === "Contents/section0.xml");
  if (!sec) throw new Error("section0.xml not found in template");
  return sec.method === 8
    ? inflateRawSync(sec.compressedData).toString("utf8")
    : sec.compressedData.toString("utf8");
}

export function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
