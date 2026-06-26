import { NextRequest } from "next/server";
import {
  Document, Packer, Paragraph, TextRun,
  Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle,
  ShadingType, HeadingLevel,
} from "docx";
import { getCurrentUser } from "@/lib/auth";

type SessionDetail = {
  use: string;
  pay: string;
  appr: string;
  start: string;
  end: string;
  voucher: string;
  extra: string;
  amount: string;
  result: string;
  retroReason?: string;
};

type Payload = {
  childName: string;
  childBirth: string;
  org: string;
  therapist: string;
  month: string;
  managerSign?: string;
  guardianSign?: string;
  opinion: string;
  sessions: SessionDetail[];
};

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "888888" };
const ALL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function makeText(text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) {
  return new TextRun({
    text,
    bold: opts.bold,
    size: opts.size ?? 20,
    color: opts.color,
    font: "맑은 고딕",
  });
}
function para(text: string, opts: Parameters<typeof makeText>[1] = {}) {
  return new Paragraph({ children: [makeText(text, opts)] });
}

function cell(content: string, opts: { label?: boolean; bold?: boolean; size?: number; span?: number; color?: string } = {}) {
  return new TableCell({
    children: [para(content, { bold: opts.bold ?? opts.label, size: opts.size, color: opts.color })],
    columnSpan: opts.span,
    shading: opts.label ? { type: ShadingType.CLEAR, color: "auto", fill: "EBE5D3" } : undefined,
    borders: ALL_BORDERS,
  });
}

function multiCell(paragraphs: Paragraph[], opts: { span?: number; fill?: string } = {}) {
  return new TableCell({
    children: paragraphs,
    columnSpan: opts.span,
    shading: opts.fill ? { type: ShadingType.CLEAR, color: "auto", fill: opts.fill } : undefined,
    borders: ALL_BORDERS,
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const p = (await req.json()) as Payload;

  // meta table
  const metaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [
        cell("제공기관명", { label: true }), cell(p.org, { span: 3 }),
      ]}),
      new TableRow({ children: [
        cell("이용자", { label: true }), cell(`성명 : ${p.childName}`),
        cell("생년월일", { label: true }), cell(p.childBirth),
      ]}),
      new TableRow({ children: [
        cell("치료사", { label: true }), cell(p.therapist || "-", { span: 3 }),
      ]}),
      new TableRow({ children: [
        cell("관리자 서명", { label: true }), cell(p.managerSign ?? ""),
        cell("보호자 서명", { label: true }), cell(p.guardianSign ?? ""),
      ]}),
    ],
  });

  // 회기 표 (요약): 회차, 제공일, 승인번호, 시간, 결제일, 금액
  const sessionHeader = new TableRow({ children: [
    cell("회차", { label: true }),
    cell("제공일", { label: true }),
    cell("승인번호", { label: true }),
    cell("시작", { label: true }),
    cell("종료", { label: true }),
    cell("바우처(분)", { label: true }),
    cell("추가(분)", { label: true }),
    cell("결제일", { label: true }),
    cell("총이용금액", { label: true }),
  ]});
  const sessionRows = p.sessions.map((s, i) => new TableRow({
    children: [
      cell(String(i + 1)),
      cell(s.use),
      cell(s.appr),
      cell(s.start),
      cell(s.end),
      cell(s.voucher),
      cell(s.extra),
      cell(s.pay),
      cell(s.amount),
    ],
  }));
  const sessionTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [sessionHeader, ...sessionRows],
  });

  // 상태/결과 블록 — 각 회기마다 1줄 헤더 + 상태기록 셀
  const resultRows: TableRow[] = [
    new TableRow({ children: [
      cell("회차", { label: true }),
      cell("제공일자 / 승인일자 / 승인번호", { label: true }),
      cell("이용자 상태 및 서비스 결과", { label: true }),
    ]}),
  ];
  p.sessions.forEach((s, i) => {
    // 소급 사유가 있으면 결과 본문 아래 별도 단락("* 소급 사유: …")으로 표기
    const resultCell = s.retroReason
      ? multiCell([para(s.result || "(미작성)"), para(`* 소급 사유: ${s.retroReason}`)])
      : cell(s.result || "(미작성)");
    resultRows.push(new TableRow({ children: [
      cell(String(i + 1)),
      cell(`제공 ${s.use} · 승인 ${s.pay} · 번호 ${s.appr}`),
      resultCell,
    ]}));
  });
  const resultTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: resultRows,
  });

  const opinionTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [cell("부모 상담 종합 의견", { label: true })] }),
      new TableRow({ children: [
        multiCell(
          (p.opinion || "(미작성)").split("\n").map((line) => para(line))
        ),
      ]}),
    ],
  });

  const doc = new Document({
    creator: "온담말언어발달센터",
    title: `${p.childName} ${p.month}월 기록지`,
    styles: { default: { document: { run: { font: "맑은 고딕", size: 20 } } } },
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          heading: HeadingLevel.HEADING_1,
          children: [makeText(`발달재활서비스 제공 기록지 (${p.month}월)`, { bold: true, size: 32 })],
        }),
        para("", { size: 8 }),
        metaTable,
        para("", { size: 8 }),
        new Paragraph({ children: [makeText("■ 회기 요약", { bold: true, size: 22 })] }),
        sessionTable,
        para("", { size: 8 }),
        new Paragraph({ children: [makeText("■ 상태 및 결과 기록", { bold: true, size: 22 })] }),
        resultTable,
        para("", { size: 8 }),
        opinionTable,
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const filename = encodeURIComponent(`${p.childName || "기록지"}_${p.month}월_기록지.docx`);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
