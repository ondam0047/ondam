import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readSection0, patchSection0 } from "@/lib/hwpx";
import { fillCells, type CellEdit, type Coord } from "@/lib/record-fill";
import type { ResolvedSpec } from "@/lib/record-resolver";

type Params = { params: Promise<{ id: string }> };

type Session = {
  date:      string;
  startTime: string;
  endTime:   string;
  content:   string;
  notes?:    string;     // 비고·특이사항 — 있으면 "내용 - 비고" 로 합산
};

type Payload = {
  studentName:   string;
  therapistName: string;
  org:           string;
  year:          number;
  month:         number;
  school?:        string;
  grade?:         string;
  dayOfWeek?:     string;
  sessionTime?:   string;
  goal?:          string;
  currentLevel?:  string;
  sessions:      Session[];
  toolChildId?:   number;
};

// 직접 spec 필드 + spec.manual 역할 기반으로 CellEdit 목록 생성
function buildEdits(spec: ResolvedSpec, d: Payload): CellEdit[] {
  const edits: CellEdit[] = [];
  const put = (coord: Coord | undefined, value: string) => {
    if (!coord || !value) return;
    edits.push({ table: coord[0], row: coord[1], col: coord[2], p: coord[3], value });
  };
  const putArr = (arr: Coord[] | undefined, val: (i: number) => string) => {
    (arr ?? []).forEach((co, i) => put(co, val(i)));
  };

  // ── 직접 인식된 필드 ──────────────────────────────────────
  put(spec.name, d.studentName);
  put(spec.org, d.org);
  (spec.therapist ?? []).forEach((co) => put(co, d.therapistName));

  const S = d.sessions;
  // 날짜 열 (스케줄 행 형태 양식)
  putArr(spec.date,  (i) => S[i]?.date ?? "");
  putArr(spec.start, (i) => S[i]?.startTime ?? "");
  putArr(spec.end,   (i) => S[i]?.endTime ?? "");
  // 결과표 행 (표 안 행 형태 양식)
  (spec.result ?? []).forEach((row, i) => {
    put(row.date,   S[i]?.date ?? "");
    put(row.time,   S[i]?.startTime ?? "");
    put(row.result, resultText(S[i]));
  });

  // ── spec.manual: 치료사가 직접 지정한 역할 칸 ────────────
  const scalarVal: Record<string, string> = {
    기관명:   d.org,
    대상자이름: d.studentName,
    치료사이름: d.therapistName,
    학교:     d.school        ?? "",
    학년:     d.grade         ?? "",
    요일:     d.dayOfWeek     ?? "",
    정기시간: d.sessionTime   ?? "",
    치료목표: d.goal          ?? "",
    현행수준: d.currentLevel  ?? "",
  };
  // 날짜 열 기반 ROW 역할 — 날짜 열 인덱스마다 세션 값 채움
  const dCols = spec.date.map((c) => c[2]);
  const ROW = new Set(["날짜", "시작", "종료", "결과"]);

  for (const m of spec.manual ?? []) {
    if (ROW.has(m.role) && dCols.length) {
      dCols.forEach((col, i) => {
        const v = m.role === "날짜"   ? (S[i]?.date ?? "")
                : m.role === "시작"   ? (S[i]?.startTime ?? "")
                : m.role === "종료"   ? (S[i]?.endTime ?? "")
                : m.role === "결과"   ? resultText(S[i])
                : "";
        put([m.table, m.row, col] as Coord, v);
      });
    } else if (scalarVal[m.role] !== undefined && scalarVal[m.role]) {
      put([m.table, m.row, m.col] as Coord, scalarVal[m.role]);
    }
  }

  return edits;
}

// 내용 + 비고를 " - " 로 합산
function resultText(s: Session | undefined): string {
  if (!s) return "";
  return [s.content, s.notes].filter(Boolean).join(" - ");
}

// POST: 기록지 저장 + .hwpx 반환
export async function POST(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const pid = Number(id);
  if (!pid) return Response.json({ error: "invalid id" }, { status: 400 });

  const program = await prisma.program.findFirst({
    where: { id: pid, ownerId: user.id, active: true },
  });
  if (!program) return Response.json({ error: "not found" }, { status: 404 });
  if (!program.formTemplate || !program.formSpec) {
    return Response.json({ error: "양식이 등록되지 않았습니다." }, { status: 400 });
  }

  let body: Payload;
  try { body = await req.json(); } catch { return Response.json({ error: "invalid json" }, { status: 400 }); }

  const { studentName, sessions, toolChildId, year, month } = body;
  if (!studentName) return Response.json({ error: "아동 이름을 입력하세요." }, { status: 400 });

  let spec: ResolvedSpec;
  try { spec = JSON.parse(program.formSpec); } catch { return Response.json({ error: "양식 스펙 오류" }, { status: 500 }); }

  const buf      = Buffer.from(program.formTemplate);
  const xml      = readSection0(buf);
  const edits    = buildEdits(spec, body);
  const filledXml = fillCells(xml, edits);
  const out      = patchSection0(buf, filledXml);

  // SupportRecord 저장/갱신
  const existing = await prisma.supportRecord.findFirst({
    where: { ownerUserId: user.id, programId: pid, student: studentName },
  });
  const tcId = toolChildId ? Number(toolChildId) : undefined;
  if (existing) {
    await prisma.supportRecord.update({
      where: { id: existing.id },
      data: { payload: JSON.stringify(body), toolChildId: tcId ?? null },
    });
  } else {
    await prisma.supportRecord.create({
      data: {
        ownerUserId: user.id,
        program:     "custom",
        programId:   pid,
        student:     studentName,
        payload:     JSON.stringify(body),
        toolChildId: tcId ?? null,
      },
    });
  }

  const filename = `${program.name}_${studentName}_${year}${String(month).padStart(2, "0")}.hwpx`;
  return new Response(new Uint8Array(out), {
    headers: {
      "Content-Type": "application/hwp+zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
