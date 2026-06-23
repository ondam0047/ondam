import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readSection0, patchSection0 } from "@/lib/hwpx";
import { fillCells, fillTitleMonth, type CellEdit, type Coord } from "@/lib/record-fill";
import type { ResolvedSpec } from "@/lib/record-resolver";
import { bundleAsZip, safeFileName } from "@/lib/record-hwpx";

// 양식이 담을 수 있는 회기 칸 수(슬롯). 회기가 이보다 많으면 여러 장으로 나눈다.
const ROW_ROLES = new Set(["회차", "날짜", "시작", "종료", "결과", "비고"]);
function formCapacity(spec: ResolvedSpec): number {
  let cap = Math.max(spec.date?.length ?? 0, spec.result?.length ?? 0);
  const groups: Record<string, number> = {};
  for (const m of spec.manual ?? []) if (ROW_ROLES.has(m.role)) groups[m.role] = (groups[m.role] ?? 0) + 1;
  for (const k in groups) cap = Math.max(cap, groups[k]);
  return cap || 1;
}

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
  summary?:       string;   // 종합의견·총평
  sessions:      Session[];
  toolChildId?:   number;
};

// 직접 spec 필드 + spec.manual 역할 기반으로 CellEdit 목록 생성.
// ordinalBase: 회차 번호 시작 오프셋(여러 장으로 나눌 때 2장째는 +capacity).
function buildEdits(spec: ResolvedSpec, d: Payload, ordinalBase = 0): CellEdit[] {
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
    연도:     d.year  ? String(d.year)  : "",
    월:       d.month ? String(d.month) : "",
    학교:     d.school        ?? "",
    학년:     d.grade         ?? "",
    요일:     d.dayOfWeek     ?? "",
    정기시간: d.sessionTime   ?? "",
    치료목표: d.goal          ?? "",
    현행수준: d.currentLevel  ?? "",
    종합의견: d.summary        ?? "",
  };
  const ROW = new Set(["회차", "날짜", "시작", "종료", "결과", "비고"]);
  // 비고 칸이 따로 매핑돼 있으면 결과는 내용만, 아니면 내용+비고 합산.
  const hasBigo = (spec.manual ?? []).some((m) => m.role === "비고");

  // ROW 역할은 문서 순서(표·행·열)대로 세션 i번째 값을 채운다.
  // (날짜축이 없는 양식 — 회차/날짜/시간이 칸마다 흩어진 형태 — 도 지원)
  type ManualCell = { table: number; row: number; col: number; p?: number };
  const rowGroups: Record<string, ManualCell[]> = {};
  for (const m of spec.manual ?? []) {
    if (ROW.has(m.role)) {
      (rowGroups[m.role] ??= []).push(m);
    } else if (scalarVal[m.role] !== undefined && scalarVal[m.role]) {
      put([m.table, m.row, m.col, m.p ?? 0] as Coord, scalarVal[m.role]);
    }
  }
  const byTRC = (a: ManualCell, b: ManualCell) =>
    a.table - b.table || a.row - b.row || a.col - b.col || (a.p ?? 0) - (b.p ?? 0);
  for (const role of Object.keys(rowGroups)) {
    rowGroups[role].sort(byTRC).forEach((m, i) => {
      const v = role === "회차" ? String(ordinalBase + i + 1)
              : role === "날짜" ? (S[i]?.date ?? "")
              : role === "시작" ? (S[i]?.startTime ?? "")
              : role === "종료" ? (S[i]?.endTime ?? "")
              : role === "결과" ? (hasBigo ? (S[i]?.content ?? "") : resultText(S[i]))
              : role === "비고" ? (S[i]?.notes ?? "")
              : "";
      put([m.table, m.row, m.col, m.p ?? 0] as Coord, v);
    });
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

  const buf = Buffer.from(program.formTemplate);
  const xml = readSection0(buf);

  // 회기가 양식 칸 수보다 많으면 칸 수만큼씩 나눠 여러 장 생성.
  const cap = formCapacity(spec);
  const allSessions = sessions ?? [];
  const chunks: Session[][] = [];
  for (let i = 0; i < Math.max(1, allSessions.length); i += cap) chunks.push(allSessions.slice(i, i + cap));

  const sheets = chunks.map((chunk, ci) => {
    const edits = buildEdits(spec, { ...body, sessions: chunk }, ci * cap);
    let filled = fillCells(xml, edits);
    filled = fillTitleMonth(filled, year, month); // 제목의 "YYYY년 M월" 자동 치환
    return patchSection0(buf, filled);
  });

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

  const base = `${program.name}_${studentName}_${year}${String(month).padStart(2, "0")}`;

  // 한 장이면 .hwpx 그대로, 여러 장이면 ZIP 으로 묶어 반환.
  if (sheets.length === 1) {
    return new Response(new Uint8Array(sheets[0]), {
      headers: {
        "Content-Type": "application/hwp+zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${base}.hwpx`)}`,
      },
    });
  }

  const safeBase = safeFileName(base);
  const zip = bundleAsZip(sheets.map((data, i) => ({ name: `${safeBase}_${i + 1}장.hwpx`, data })));
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${base}_${sheets.length}장.zip`)}`,
    },
  });
}
