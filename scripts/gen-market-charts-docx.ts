// 시장분석 핵심 수치를 Word 네이티브 가로 막대그래프(셀 음영)로 시각화.
// 외부 이미지/폰트 의존 없음 → 한글 안 깨짐. 실행:
//   node --experimental-strip-types scripts/gen-market-charts-docx.ts
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, ShadingType, TableLayoutType,
} from "docx";
import { writeFileSync } from "node:fs";

const FONT = "맑은 고딕";
const CONTENT_W = 11906 - 1000 * 2; // 본문 폭(twip)
const LABEL_W = 2600;
const VAL_W = 1700;
const TRACK_W = CONTENT_W - LABEL_W - VAL_W; // 막대 영역

const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder };

function txtCell(text: string, w: number, opts: { bold?: boolean; align?: typeof AlignmentType[keyof typeof AlignmentType]; color?: string; size?: number } = {}) {
  return new TableCell({
    width: { size: w, type: WidthType.DXA }, borders: noBorders, margins: { top: 20, bottom: 20, left: 40, right: 60 },
    children: [new Paragraph({ alignment: opts.align, children: [new TextRun({ text, font: FONT, size: opts.size ?? 18, bold: opts.bold, color: opts.color })] })],
  });
}
function fillCell(w: number, color: string) {
  return new TableCell({
    width: { size: Math.max(w, 0), type: WidthType.DXA }, borders: noBorders,
    shading: { type: ShadingType.CLEAR, fill: color, color: "auto" },
    margins: { top: 30, bottom: 30, left: 0, right: 0 },
    children: [new Paragraph({ children: [] })],
  });
}
// 가로 막대 1개 = 1행 테이블 [라벨 | 채움 | 빈칸 | 값]
function hbar(label: string, frac: number, valueText: string, color: string) {
  const filled = Math.max(Math.round(frac * TRACK_W), 60);
  const rest = Math.max(TRACK_W - filled, 0);
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [LABEL_W, filled, rest, VAL_W],
    layout: TableLayoutType.FIXED, alignment: AlignmentType.CENTER, borders: noBorders,
    rows: [new TableRow({ children: [
      txtCell(label, LABEL_W), fillCell(filled, color), txtCell("", rest), txtCell(valueText, VAL_W, { bold: true, color: "1F4E91" }),
    ] })],
  });
}
function chart(title: string, sub: string, items: { label: string; value: number; text: string }[], color = "1F4E91") {
  const max = Math.max(...items.map((i) => i.value));
  const out: (Paragraph | Table)[] = [];
  out.push(new Paragraph({ spacing: { before: 240, after: 30 }, children: [new TextRun({ text: title, bold: true, size: 24, font: FONT })] }));
  if (sub) out.push(new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: sub, italics: true, size: 17, font: FONT, color: "667085" })] }));
  for (const it of items) out.push(hbar(it.label, max ? it.value / max : 0, it.text, color));
  out.push(new Paragraph({ spacing: { after: 60 }, children: [] }));
  return out;
}

const children: (Paragraph | Table)[] = [];

children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 160, after: 40 },
  children: [new TextRun({ text: "바로일지 시장분석 — 핵심 도표", bold: true, size: 40, font: FONT, color: "1F4E91" })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 140 },
  children: [new TextRun({ text: "발달바우처 치료사용 일지 자동화 SaaS · 2026-06-03", size: 20, font: FONT, color: "475467" })] }));

// 1. 활동 제공인력 자격증 분포(2021)
chart("① 활동 제공인력 자격증 분포 (2021)", "총 12,280명 · 중복 보유 가능 · 출처: 효과성·개선방안 연구",
  [
    { label: "언어재활", value: 5573, text: "5,573명 (45%)" },
    { label: "미술심리", value: 2061, text: "2,061명" },
    { label: "놀이심리", value: 1560, text: "1,560명" },
    { label: "기타 영역 합계", value: 3086, text: "약 3,086명" },
  ], "1F4E91").forEach((c) => children.push(c));

// 2. 2025 신규 자격 인정(영역별)
chart("② 2025년 신규 자격 인정 — 영역별", "교과목 이수 경로(비언어) 총 3,085명 · 언어재활사는 별도 · 출처: 2025 자격인정 현황",
  [
    { label: "감각", value: 1109, text: "1,109명" },
    { label: "미술", value: 700, text: "700명" },
    { label: "놀이심리", value: 473, text: "473명" },
    { label: "행동", value: 221, text: "221명" },
    { label: "음악", value: 197, text: "197명" },
    { label: "심리운동", value: 150, text: "150명" },
    { label: "운동", value: 144, text: "144명" },
    { label: "재활심리", value: 59, text: "59명" },
    { label: "청능", value: 32, text: "32명" },
  ], "2E7D6F").forEach((c) => children.push(c));

// 3. TAM 레이어
chart("③ 시장 규모 — TAM 레이어", "L1 확정(A) · L2/L3 추정 · 제품 포지셔닝에 따라 달라짐",
  [
    { label: "L1 바우처 활동 인력", value: 13000, text: "약 1.2만~1.3만" },
    { label: "L2 자격 풀(누적)", value: 50000, text: "수만(추정)" },
    { label: "L3 광의 아동치료", value: 100000, text: "수만~10만대(추정)" },
  ], "7A4D81").forEach((c) => children.push(c));

// 4. 2026 단가 인상
chart("④ 회당 기준 단가 인상 (2025→2026)", "월 8회 기준 · 출처: 복지부 2026 예산·정책브리핑",
  [
    { label: "2025년", value: 30000, text: "30,000원" },
    { label: "2026년", value: 35000, text: "약 35,000원" },
  ], "C8554E").forEach((c) => children.push(c));

// 5. SOM 시나리오 ARR
chart("⑤ 수익 시나리오 — 연 매출(ARR)", "월 15,000원 구독 · SAM 기반 · 단위: 억원",
  [
    { label: "보수", value: 0.54, text: "약 0.54억" },
    { label: "기본", value: 1.62, text: "약 1.62억" },
    { label: "낙관", value: 3.89, text: "약 3.89억" },
  ], "1F4E91").forEach((c) => children.push(c));

// 6. 서비스별 이용자(2021)
chart("⑥ 서비스 영역별 이용 아동 (2021.8)", "총 73,195명 · 출처: 효과성·개선방안 연구",
  [
    { label: "언어재활", value: 38992, text: "38,992명" },
    { label: "감각발달", value: 7153, text: "7,153명" },
    { label: "미술심리", value: 7078, text: "7,078명" },
    { label: "기타 합계", value: 19972, text: "약 19,972명" },
  ], "2E7D6F").forEach((c) => children.push(c));

children.push(new Paragraph({ spacing: { before: 160 }, children: [new TextRun({
  text: "※ 자세한 수치·출처·신뢰도(A~D)·전략은 본문 보고서(바로일지_시장분석.docx) 참조.",
  italics: true, size: 17, font: FONT, color: "98A2B3" })] }));

const doc = new Document({
  styles: { default: { document: { run: { font: FONT, size: 20 } } } },
  sections: [{ properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } }, children }],
});
const out = "docs/바로일지_시장분석_도표.docx";
Packer.toBuffer(doc).then((buf) => { writeFileSync(out, buf); console.log("작성 완료:", out, `(${buf.length} bytes)`); });
