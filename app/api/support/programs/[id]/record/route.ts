import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readSection0, patchSection0 } from "@/lib/hwpx";
import { fillCells, type CellEdit } from "@/lib/record-fill";
import type { ResolvedSpec } from "@/lib/record-resolver";

type Params = { params: Promise<{ id: string }> };

type Session = { date: string; startTime: string; endTime: string; content: string };
type Payload = {
  studentName: string;
  therapistName: string;
  org: string;
  year: number;
  month: number;
  sessions: Session[];
};

function buildEdits(spec: ResolvedSpec, d: Payload): CellEdit[] {
  const edits: CellEdit[] = [];
  const put = (coord: [number, number, number, number?] | undefined, value: string) => {
    if (!coord || !value) return;
    edits.push({ table: coord[0], row: coord[1], col: coord[2], p: coord[3], value });
  };
  const putArr = (arr: [number, number, number, number?][] | undefined, val: (i: number) => string) => {
    (arr ?? []).forEach((co, i) => put(co, val(i)));
  };

  put(spec.name, d.studentName);
  put(spec.org, d.org);
  (spec.therapist ?? []).forEach((co) => put(co, d.therapistName));

  const S = d.sessions;
  putArr(spec.date,  (i) => S[i]?.date ?? "");
  putArr(spec.start, (i) => S[i]?.startTime ?? "");
  putArr(spec.end,   (i) => S[i]?.endTime ?? "");
  putArr(spec.result,(i) => S[i]?.content ?? "");

  return edits;
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

  const { studentName, therapistName, org, year, month, sessions } = body;
  if (!studentName) return Response.json({ error: "아동 이름을 입력하세요." }, { status: 400 });

  let spec: ResolvedSpec;
  try { spec = JSON.parse(program.formSpec); } catch { return Response.json({ error: "양식 스펙 오류" }, { status: 500 }); }

  const buf = Buffer.from(program.formTemplate);
  const xml = readSection0(buf);
  const edits = buildEdits(spec, { studentName, therapistName, org, year, month, sessions });
  const filledXml = fillCells(xml, edits);
  const out = patchSection0(buf, filledXml);

  // SupportRecord 저장/갱신
  const existing = await prisma.supportRecord.findFirst({
    where: { ownerUserId: user.id, programId: pid, student: studentName },
  });
  if (existing) {
    await prisma.supportRecord.update({
      where: { id: existing.id },
      data: { payload: JSON.stringify(body) },
    });
  } else {
    await prisma.supportRecord.create({
      data: {
        ownerUserId: user.id,
        program: "custom",
        programId: pid,
        student: studentName,
        payload: JSON.stringify(body),
      },
    });
  }

  const filename = `${program.name}_${studentName}_${year}${String(month).padStart(2, "0")}.hwpx`;
  return new Response(out, {
    headers: {
      "Content-Type": "application/hwp+zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
