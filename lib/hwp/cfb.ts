// 최소 MS-CFB(OLE2) 리더/라이터 — hwp-poc/cfbwrite.py 포팅.
// 원본 .hwp 의 디렉터리 트리(이름/타입/좌우자식/색)를 그대로 물려받고 스트림 내용만
// 교체해 새 컨테이너를 만든다. hwplib writer 를 거치지 않으므로 FileHeader/미리보기/
// 요약정보 스트림이 원본 바이트 그대로 보존된다(PoC2·3 검증 조합).

const FREE = 0xffffffff;
const ENDOFCHAIN = 0xfffffffe;
const FATSECT = 0xfffffffd;
const SSZ = 512;
const MSSZ = 64;
const CUTOFF = 4096;

export type CfbContainer = {
  entries: Buffer[]; // 원본 128B 디렉터리 엔트리(트리 구조 그대로)
  data: Map<number, Buffer>; // sid → 스트림 내용
};

export function entryName(e: Buffer): string {
  const n = e.readUInt16LE(64);
  return e.subarray(0, Math.max(0, n - 2)).toString("utf16le");
}

export function readContainer(raw: Buffer): CfbContainer {
  if (raw.readUInt32LE(0) !== 0xe011cfd0 || raw.readUInt32LE(4) !== 0xe11ab1a1) {
    throw new Error("CFB 시그니처가 아님");
  }
  const nfat = raw.readUInt32LE(44);
  const dirFirst = raw.readUInt32LE(48);
  const mfatFirst = raw.readUInt32LE(60);
  const difat: number[] = [];
  for (let k = 0; k < 109; k++) {
    const d = raw.readUInt32LE(76 + k * 4);
    if (d !== FREE) difat.push(d);
  }
  const sec = (n: number) => raw.subarray(512 + n * SSZ, 512 + (n + 1) * SSZ);

  const fat: number[] = [];
  for (const fs of difat.slice(0, nfat)) {
    const s = sec(fs);
    for (let k = 0; k < SSZ / 4; k++) fat.push(s.readUInt32LE(k * 4));
  }
  const chain = (start: number): number[] => {
    const out: number[] = [];
    let s = start;
    while (s !== ENDOFCHAIN && s !== FREE && s < fat.length) {
      out.push(s);
      s = fat[s];
    }
    return out;
  };

  const dirbuf = Buffer.concat(chain(dirFirst).map(sec));
  const entries: Buffer[] = [];
  for (let i = 0; i < Math.floor(dirbuf.length / 128); i++) {
    entries.push(Buffer.from(dirbuf.subarray(i * 128, (i + 1) * 128)));
  }

  const minifat: number[] = [];
  for (const s of chain(mfatFirst)) {
    const b = sec(s);
    for (let k = 0; k < SSZ / 4; k++) minifat.push(b.readUInt32LE(k * 4));
  }
  const ministream = Buffer.concat(chain(entries[0].readUInt32LE(116)).map(sec));

  const data = new Map<number, Buffer>();
  entries.forEach((e, i) => {
    if (e[66] !== 2) return; // 스트림만
    const start = e.readUInt32LE(116);
    const size = Number(e.readBigUInt64LE(120));
    if (size >= CUTOFF) {
      data.set(i, Buffer.concat(chain(start).map(sec)).subarray(0, size));
    } else {
      const parts: Buffer[] = [];
      let s = start;
      while (s !== ENDOFCHAIN && s !== FREE && s < minifat.length) {
        parts.push(ministream.subarray(s * MSSZ, (s + 1) * MSSZ));
        s = minifat[s];
      }
      data.set(i, Buffer.concat(parts).subarray(0, size));
    }
  });
  return { entries, data };
}

export function findStream(c: CfbContainer, name: string): number {
  const i = c.entries.findIndex((e) => e[66] === 2 && entryName(e) === name);
  if (i < 0) throw new Error(`스트림 없음: ${name}`);
  return i;
}

const pad = (b: Buffer, unit: number) =>
  b.length % unit === 0 ? b : Buffer.concat([b, Buffer.alloc(unit - (b.length % unit))]);

export function writeContainer(c: CfbContainer): Buffer {
  const ents = c.entries.map((e) => Buffer.from(e));
  const big: number[] = [];
  const small: number[] = [];
  ents.forEach((e, i) => {
    if (e[66] !== 2) return;
    (c.data.get(i)!.length >= CUTOFF ? big : small).push(i);
  });

  // 미니스트림 구성
  const miniParts: Buffer[] = [];
  const miniStart = new Map<number, number>();
  let miniLen = 0;
  for (const i of small) {
    miniStart.set(i, miniLen / MSSZ);
    const b = pad(c.data.get(i)!, MSSZ);
    miniParts.push(b);
    miniLen += b.length;
  }
  const ministream = Buffer.concat(miniParts);
  const nMini = miniLen / MSSZ;
  const nMinifatSect = nMini ? Math.ceil((nMini * 4) / SSZ) : 0;

  // 섹터 배치: [big streams][ministream][miniFAT][directory][FAT]
  const nDirSect = Math.ceil((ents.length * 128) / SSZ);
  const nMinistreamSect = Math.ceil(ministream.length / SSZ);
  const nBig = big.reduce((a, i) => a + Math.ceil(c.data.get(i)!.length / SSZ), 0);
  const base = nBig + nMinistreamSect + nMinifatSect + nDirSect;
  let nFat = 1;
  for (;;) {
    const need = Math.ceil(((base + nFat) * 4) / SSZ);
    if (need <= nFat) break;
    nFat = need;
  }
  if (nFat > 109) throw new Error("DIFAT 확장 필요(파일이 너무 큼)");
  const total = base + nFat;

  const fat = new Array<number>(nFat * (SSZ / 4)).fill(FREE);
  const sectors = new Array<Buffer>(total).fill(Buffer.alloc(SSZ));

  const putChain = (first: number, blob: Buffer): number => {
    const padded = pad(blob, SSZ);
    const n = padded.length / SSZ;
    for (let k = 0; k < n; k++) {
      sectors[first + k] = padded.subarray(k * SSZ, (k + 1) * SSZ);
      fat[first + k] = k < n - 1 ? first + k + 1 : ENDOFCHAIN;
    }
    return n;
  };

  let cur = 0;
  for (const i of big) {
    const b = c.data.get(i)!;
    ents[i].writeUInt32LE(cur, 116);
    ents[i].writeBigUInt64LE(BigInt(b.length), 120);
    cur += putChain(cur, b);
  }

  const ministreamFirst = cur;
  if (nMinistreamSect) cur += putChain(cur, ministream);
  for (const i of small) {
    ents[i].writeUInt32LE(miniStart.get(i)!, 116);
    ents[i].writeBigUInt64LE(BigInt(c.data.get(i)!.length), 120);
  }

  // miniFAT
  const minifat: number[] = [];
  for (const i of small) {
    const n = Math.ceil(c.data.get(i)!.length / MSSZ);
    const st = miniStart.get(i)!;
    for (let k = 0; k < n; k++) minifat.push(k < n - 1 ? st + k + 1 : ENDOFCHAIN);
  }
  while (minifat.length < nMinifatSect * (SSZ / 4)) minifat.push(FREE);
  const minifatFirst = nMinifatSect ? cur : ENDOFCHAIN;
  if (nMinifatSect) {
    const blob = Buffer.alloc(minifat.length * 4);
    minifat.forEach((v, k) => blob.writeUInt32LE(v, k * 4));
    cur += putChain(cur, blob);
  }

  // Root Entry: 미니스트림 위치/크기. 스토리지 엔트리는 start=0,size=0.
  ents[0].writeUInt32LE(nMinistreamSect ? ministreamFirst : ENDOFCHAIN, 116);
  ents[0].writeBigUInt64LE(BigInt(ministream.length), 120);
  for (const e of ents) {
    if (e[66] === 1) {
      e.writeUInt32LE(0, 116);
      e.writeBigUInt64LE(BigInt(0), 120);
    }
  }

  const dirFirst = cur;
  cur += putChain(cur, Buffer.concat(ents.map((e) => Buffer.from(e))));

  const fatFirst = cur;
  for (let k = 0; k < nFat; k++) fat[fatFirst + k] = FATSECT; // hwplib 이 빠뜨리는 자기표시
  const fatblob = Buffer.alloc(fat.length * 4);
  fat.forEach((v, k) => fatblob.writeUInt32LE(v, k * 4));
  for (let k = 0; k < nFat; k++) sectors[fatFirst + k] = fatblob.subarray(k * SSZ, (k + 1) * SSZ);

  const hdr = Buffer.alloc(512);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(hdr, 0);
  hdr.writeUInt16LE(0x003e, 24); // minor
  hdr.writeUInt16LE(3, 26); // major
  hdr.writeUInt16LE(0xfffe, 28); // byte order
  hdr.writeUInt16LE(9, 30); // sector shift 512
  hdr.writeUInt16LE(6, 32); // mini sector shift 64
  hdr.writeUInt32LE(0, 40); // #dir sectors (v3=0)
  hdr.writeUInt32LE(nFat, 44);
  hdr.writeUInt32LE(dirFirst, 48);
  hdr.writeUInt32LE(CUTOFF, 56);
  hdr.writeUInt32LE(minifatFirst, 60);
  hdr.writeUInt32LE(nMinifatSect, 64);
  hdr.writeUInt32LE(ENDOFCHAIN, 68); // DIFAT 확장 없음
  hdr.writeUInt32LE(0, 72);
  for (let k = 0; k < 109; k++) hdr.writeUInt32LE(k < nFat ? fatFirst + k : FREE, 76 + k * 4);

  return Buffer.concat([hdr, ...sectors]);
}
