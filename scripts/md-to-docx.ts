// 간이 Markdown → Word(.docx) 변환기 (여러 .md 를 page break 로 이어붙임).
// 지원: # ## ### #### 제목, 빈줄 문단, "- " 글머리표, "> " 인용, **굵게**, "---" 구분선/페이지.
// 실행: node --experimental-strip-types scripts/md-to-docx.ts <out.docx> <a.md> [b.md ...]
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak, BorderStyle } from "docx";
import { readFileSync, writeFileSync } from "node:fs";

const FONT = "맑은 고딕";

function runs(text: string): TextRun[] {
  // **굵게** 토글 + `코드` 제거
  const parts = text.split("**");
  return parts.map((p, i) => new TextRun({ text: p.replace(/`/g, ""), bold: i % 2 === 1, font: FONT, size: 21 }));
}

function lineToPara(line: string): Paragraph | null {
  const t = line.replace(/\s+$/g, "");
  if (!t.trim()) return null;
  if (t.trim() === "---") {
    return new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "D0D5DD", space: 1 } }, spacing: { after: 120 }, children: [] });
  }
  const h = t.match(/^(#{1,4})\s+(.*)$/);
  if (h) {
    const lvl = h[1].length;
    const size = lvl === 1 ? 30 : lvl === 2 ? 25 : lvl === 3 ? 22 : 20;
    return new Paragraph({
      heading: lvl <= 2 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
      spacing: { before: lvl === 1 ? 280 : 200, after: 110 },
      children: [new TextRun({ text: h[2].replace(/\*\*/g, ""), bold: true, font: FONT, size })],
    });
  }
  if (/^>\s?/.test(t)) {
    return new Paragraph({ spacing: { after: 90, line: 290 }, children: [new TextRun({ text: t.replace(/^>\s?/, ""), italics: true, font: FONT, size: 19, color: "667085" })] });
  }
  if (/^[-*]\s+/.test(t)) {
    return new Paragraph({ bullet: { level: 0 }, spacing: { after: 60, line: 290 }, children: runs(t.replace(/^[-*]\s+/, "")) });
  }
  // 표 구분행(|---|) 은 건너뜀, 그 외 표 행은 셀을 " | " 로 평문화
  if (/^\|/.test(t)) {
    if (/^\|[\s:|-]+\|?$/.test(t)) return null;
    const cells = t.split("|").map((c) => c.trim()).filter((c) => c !== "");
    return new Paragraph({ spacing: { after: 40, line: 280 }, children: runs(cells.join("  ·  ")) });
  }
  return new Paragraph({ spacing: { after: 90, line: 300 }, children: runs(t) });
}

const [, , out, ...files] = process.argv;
const children: Paragraph[] = [];
files.forEach((f, fi) => {
  if (fi > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
  const lines = readFileSync(f, "utf8").split("\n");
  for (const ln of lines) {
    const p = lineToPara(ln);
    if (p) children.push(p);
  }
});

const doc = new Document({
  styles: { default: { document: { run: { font: FONT, size: 21 } } } },
  sections: [{ properties: { page: { margin: { top: 1100, bottom: 1100, left: 1100, right: 1100 } } }, children }],
});
Packer.toBuffer(doc).then((buf) => { writeFileSync(out, buf); console.log("작성 완료:", out, `(${buf.length} bytes)`); });
