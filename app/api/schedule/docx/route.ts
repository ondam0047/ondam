import { NextRequest } from "next/server";
import {
  Document, Packer, Paragraph, TextRun,
  Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle,
  HeightRule, ShadingType, HeadingLevel,
} from "docx";
import { WEEK, holiday } from "@/lib/constants";

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

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "888888" };
const ALL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function makeText(text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) {
  return new TextRun({
    text,
    bold: opts.bold,
    size: opts.size ?? 20, // half-points; 20 = 10pt
    color: opts.color,
    font: "맑은 고딕",
  });
}

function para(text: string, opts: Parameters<typeof makeText>[1] = {}) {
  return new Paragraph({ children: [makeText(text, opts)] });
}

function metaCell(text: string, isLabel = false, span = 1) {
  return new TableCell({
    children: [para(text, isLabel ? { bold: true } : {})],
    width: { size: span === 1 ? 25 : 50, type: WidthType.PERCENTAGE },
    columnSpan: span,
    shading: isLabel ? { type: ShadingType.CLEAR, color: "auto", fill: "EBE5D3" } : undefined,
    borders: ALL_BORDERS,
  });
}

function calendarTable(year: number, month: number, sessions: SessionInput[]) {
  const sessByDay: Record<number, SessionInput> = {};
  for (const s of sessions) sessByDay[s.day] = s;

  const dim = new Date(year, month, 0).getDate();
  const first = new Date(year, month - 1, 1).getDay();
  const cells: ({ d: number | null; hol: string | null; sess: SessionInput | null })[] = [];
  for (let i = 0; i < first; i++) cells.push({ d: null, hol: null, sess: null });
  for (let d = 1; d <= dim; d++) {
    cells.push({ d, hol: holiday(year, month, d), sess: sessByDay[d] ?? null });
  }
  while (cells.length % 7 !== 0) cells.push({ d: null, hol: null, sess: null });

  const headerRow = new TableRow({
    children: WEEK.map((w, i) => new TableCell({
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [makeText(w, { bold: true, color: i === 0 ? "C0392B" : "1A1F1B" })],
      })],
      width: { size: 14.28, type: WidthType.PERCENTAGE },
      shading: { type: ShadingType.CLEAR, color: "auto", fill: "EBE5D3" },
      borders: ALL_BORDERS,
    })),
  });

  const rows: TableRow[] = [headerRow];
  for (let i = 0; i < cells.length; i += 7) {
    const week = cells.slice(i, i + 7);
    rows.push(new TableRow({
      height: { value: 1200, rule: HeightRule.ATLEAST },
      children: week.map((c) => {
        const children: Paragraph[] = [];
        if (c.d !== null) {
          children.push(new Paragraph({
            children: [makeText(String(c.d), { bold: true, size: 18 })],
          }));
          if (c.hol) {
            children.push(new Paragraph({
              children: [makeText(c.hol, { color: "C0392B", size: 14 })],
            }));
          } else if (c.sess) {
            children.push(new Paragraph({
              children: [makeText(c.sess.time, { color: c.sess.makeup ? "C97B5A" : "2D4A3E", size: 14, bold: true })],
            }));
            if (c.sess.makeup) {
              children.push(new Paragraph({
                children: [makeText("[보강]", { color: "C97B5A", size: 12 })],
              }));
            }
          }
        } else {
          children.push(new Paragraph({ children: [] }));
        }
        return new TableCell({
          children,
          shading: c.hol
            ? { type: ShadingType.CLEAR, color: "auto", fill: "FBEAE7" }
            : c.sess
              ? { type: ShadingType.CLEAR, color: "auto", fill: c.sess.makeup ? "F0D5C6" : "DCE6E0" }
              : undefined,
          borders: ALL_BORDERS,
        });
      }),
    }));
  }
  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

export async function POST(req: NextRequest) {
  const p = (await req.json()) as Payload;

  const metaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [
        metaCell("사회복지서비스 관리번호", true),
        metaCell(p.mgmtNumber ?? ""),
        metaCell("성 명", true),
        metaCell(p.childName),
      ]}),
      new TableRow({ children: [
        metaCell("사회복지서비스 제공자", true),
        metaCell(p.therapist),
        metaCell("작성일자", true),
        metaCell(p.writeDate),
      ]}),
    ],
  });

  const provisionTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [
        metaCell("서비스 제공자명", true),
        metaCell("전 화", true),
        metaCell("담 당", true),
        metaCell("서비스 종류", true),
        metaCell("주기", true),
        metaCell("제공일", true),
      ]}),
      new TableRow({ children: [
        metaCell(p.pvOrg),
        metaCell(p.pvTel),
        metaCell(p.pvCharge),
        metaCell(p.pvType),
        metaCell(p.cycle),
        metaCell(p.sessions.map((s) => s.day).join(" ")),
      ]}),
    ],
  });

  const costTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [
        metaCell("서비스 종류", true),
        metaCell("서비스 단가(/회)", true),
        metaCell("횟수", true),
        metaCell("총 서비스 가격", true),
        metaCell("본인부담금", true),
      ]}),
      new TableRow({ children: [
        metaCell(p.pvType),
        metaCell(`${p.costUnit}원`),
        metaCell(`${p.sessions.length}회`),
        metaCell(`${p.costTotal.toLocaleString("ko-KR")}원`),
        metaCell(`${p.costSelf}원`),
      ]}),
    ],
  });

  const doc = new Document({
    creator: "온담말언어발달센터",
    title: `${p.childName} ${p.month}월 일정표`,
    styles: {
      default: {
        document: {
          run: { font: "맑은 고딕", size: 20 },
        },
      },
    },
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          heading: HeadingLevel.HEADING_1,
          children: [makeText(`서비스 일정표 (${p.month}월)`, { bold: true, size: 32 })],
        }),
        new Paragraph({ children: [makeText("", { size: 8 })] }),
        metaTable,
        new Paragraph({ children: [makeText("", { size: 8 })] }),
        calendarTable(p.year, p.month, p.sessions),
        new Paragraph({ children: [makeText("", { size: 8 })] }),
        new Paragraph({ children: [makeText("■ 서비스 제공현황", { bold: true, size: 22 })] }),
        provisionTable,
        new Paragraph({ children: [makeText("", { size: 8 })] }),
        new Paragraph({ children: [makeText("■ 서비스 비용", { bold: true, size: 22 })] }),
        costTable,
        new Paragraph({ children: [makeText("", { size: 8 })] }),
        new Paragraph({
          children: [makeText(`목표 ${p.target}회 / 작성 ${p.sessions.length}회`, { color: "6B6F69" })],
        }),
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const filename = encodeURIComponent(`${p.childName || "일정표"}_${p.year}년${String(p.month).padStart(2, "0")}월.docx`);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
