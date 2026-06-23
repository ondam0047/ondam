import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readSection0 } from "@/lib/hwpx";
import { resolveForm, type ResolvedSpec } from "@/lib/record-resolver";
import { replaceTitleMonth, type Coord } from "@/lib/record-fill";

type Params = { params: Promise<{ id: string }> };

type Session = { date: string; startTime: string; endTime: string; content: string; notes?: string };
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
  summary?:       string;
  sessions:      Session[];
};

// 채우는 좌표 → 값 맵 구축 (buildEdits와 동일 로직, 값만 추출). 키는 "t,r,c,p"(p=문단인덱스).
function buildFillMap(spec: ResolvedSpec, d: Payload): Map<string, string> {
  const map = new Map<string, string>();
  const put = (coord: Coord | undefined, value: string) => {
    if (!coord || !value) return;
    map.set(`${coord[0]},${coord[1]},${coord[2]},${coord[3] ?? 0}`, value);
  };
  const putArr = (arr: Coord[] | undefined, val: (i: number) => string) => {
    (arr ?? []).forEach((co, i) => put(co, val(i)));
  };

  const S = d.sessions;
  put(spec.name, d.studentName);
  put(spec.org,  d.org);
  (spec.therapist ?? []).forEach((co) => put(co, d.therapistName));
  putArr(spec.date,  (i) => S[i]?.date ?? "");
  putArr(spec.start, (i) => S[i]?.startTime ?? "");
  putArr(spec.end,   (i) => S[i]?.endTime ?? "");
  (spec.result ?? []).forEach((row, i) => {
    put(row.date,   S[i]?.date ?? "");
    put(row.time,   S[i]?.startTime ?? "");
    put(row.result, resultText(S[i]));
  });

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
  const ROW = new Set(["회차", "날짜", "시작", "종료", "결과"]);

  type ManualCell = { table: number; row: number; col: number; p?: number };
  const rowGroups: Record<string, ManualCell[]> = {};
  for (const m of spec.manual ?? []) {
    if (ROW.has(m.role)) {
      (rowGroups[m.role] ??= []).push(m);
    } else if (scalarVal[m.role] !== undefined && scalarVal[m.role]) {
      map.set(`${m.table},${m.row},${m.col},${m.p ?? 0}`, scalarVal[m.role]);
    }
  }
  const byTRC = (a: ManualCell, b: ManualCell) =>
    a.table - b.table || a.row - b.row || a.col - b.col || (a.p ?? 0) - (b.p ?? 0);
  for (const role of Object.keys(rowGroups)) {
    rowGroups[role].sort(byTRC).forEach((m, i) => {
      const v = role === "회차" ? String(i + 1)
              : role === "날짜" ? (S[i]?.date ?? "")
              : role === "시작" ? (S[i]?.startTime ?? "")
              : role === "종료" ? (S[i]?.endTime ?? "")
              : role === "결과" ? resultText(S[i])
              : "";
      if (v) map.set(`${m.table},${m.row},${m.col},${m.p ?? 0}`, v);
    });
  }

  return map;
}

function resultText(s: Session | undefined): string {
  if (!s) return "";
  return [s.content, s.notes].filter(Boolean).join(" - ");
}

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

  let spec: ResolvedSpec;
  try { spec = JSON.parse(program.formSpec); } catch { return Response.json({ error: "양식 스펙 오류" }, { status: 500 }); }

  // 원본 그리드 재추출 (셀 텍스트 포함)
  const xml = readSection0(Buffer.from(program.formTemplate));
  const { grid } = resolveForm(xml);

  // 채울 값 맵
  const fillMap = buildFillMap(spec, body);

  // 그리드에 채울 값 오버레이 — 문단(p)별로 원본 텍스트 + 채운 값을 함께 반환.
  // 채운 값이 없어도 제목에 "YYYY년 M월"이 박혀 있으면 사용자 연·월로 치환해 보여준다.
  const y = body.year, mo = body.month;
  const tables = grid.map((cells, ti) =>
    cells.map((cell) => {
      const paras = cell.paras.length ? cell.paras : [cell.text];
      return {
        r: cell.r, c: cell.c, rs: cell.rs, cs: cell.cs,
        paras,
        pvals: paras.map((ptext, pi) => {
          const filled = fillMap.get(`${ti},${cell.r},${cell.c},${pi}`);
          if (filled) return filled;
          const tm = replaceTitleMonth(ptext, y, mo);
          return tm !== ptext ? tm : "";
        }),
      };
    }),
  );

  return Response.json({ tables });
}
