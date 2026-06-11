// HWPX 글자속성(charPr) 헬퍼 — 달력 빨간날 색상·시간 글자크기 조정용.
// 양식마다 charPr id 가 달라, 셀이 실제 쓰는 charPr 를 복제해 색/크기만 바꿔
// header.xml 에 추가하고 그 새 id 를 반환한다(폰트·서식은 원본 그대로 유지).

// 섹션 XML 에서 (표,행,열) 셀의 첫 run 의 charPrIDRef 를 읽는다.
export function getCellRunCharPr(sectionXml: string, table: number, row: number, col: number): number | null {
  // n번째 표
  let idx = 0, pos = 0, tStart = -1, tEnd = -1;
  while (true) {
    const a = sectionXml.indexOf("<hp:tbl", pos); if (a < 0) break;
    const b = sectionXml.indexOf("</hp:tbl>", a); if (b < 0) break;
    if (idx === table) { tStart = a; tEnd = b + 9; break; }
    pos = b + 9; idx++;
  }
  if (tStart < 0) return null;
  const t = sectionXml.slice(tStart, tEnd);
  // 셀 찾기
  let q = 0;
  while (true) {
    const ca = t.indexOf("<hp:tc", q); if (ca < 0) break;
    const cb = t.indexOf("</hp:tc>", ca); if (cb < 0) break;
    const cell = t.slice(ca, cb + 8); q = cb + 8;
    const m = cell.match(/<hp:cellAddr colAddr="(\d+)" rowAddr="(\d+)"/);
    if (m && Number(m[1]) === col && Number(m[2]) === row) {
      const cp = cell.match(/charPrIDRef="(\d+)"/);
      return cp ? Number(cp[1]) : null;
    }
  }
  return null;
}

// header.xml 의 charPr 한 개를 복제해 height/textColor 만 바꿔 추가. 반환: { xml, id }.
export function addClonedCharPr(
  headerXml: string,
  baseId: number,
  overrides: { height?: number; textColor?: string },
): { xml: string; id: number } | null {
  const startTag = `<hh:charPr id="${baseId}"`;
  const i = headerXml.indexOf(startTag);
  if (i < 0) return null;
  const gt = headerXml.indexOf(">", i);
  if (gt < 0) return null;
  const selfClose = headerXml[gt - 1] === "/";
  const end = selfClose ? gt + 1 : headerXml.indexOf("</hh:charPr>", i) + "</hh:charPr>".length;
  if (end <= 0) return null;
  let el = headerXml.slice(i, end);

  // 새 id = 현재 최대 id + 1
  const ids = [...headerXml.matchAll(/<hh:charPr id="(\d+)"/g)].map((m) => Number(m[1]));
  const newId = (ids.length ? Math.max(...ids) : 0) + 1;

  // 여는 태그만 치환 대상으로 분리
  const openEnd = el.indexOf(">") + 1;
  let open = el.slice(0, openEnd);
  open = open.replace(`id="${baseId}"`, `id="${newId}"`);
  if (overrides.height !== undefined) open = open.replace(/height="\d+"/, `height="${overrides.height}"`);
  if (overrides.textColor !== undefined) {
    open = /textColor="[^"]*"/.test(open)
      ? open.replace(/textColor="[^"]*"/, `textColor="${overrides.textColor}"`)
      : open.replace(/(<hh:charPr id="\d+")/, `$1 textColor="${overrides.textColor}"`);
  }
  el = open + el.slice(openEnd);

  // </hh:charProperties> 앞에 삽입 + itemCnt 증가
  const closeIdx = headerXml.indexOf("</hh:charProperties>");
  if (closeIdx < 0) return null;
  let out = headerXml.slice(0, closeIdx) + el + headerXml.slice(closeIdx);
  out = out.replace(/(<hh:charProperties itemCnt=")(\d+)(")/, (_m, a, n, c) => `${a}${Number(n) + 1}${c}`);
  return { xml: out, id: newId };
}
