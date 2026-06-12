import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { readSection0, patchSection0 } from "@/lib/hwpx";
import { resolveForm, applyOverrides } from "@/lib/record-resolver";
import { removeTableColumns, removeTableRows } from "@/lib/record-trim";

const KINDS = new Set(["record", "schedule"]);

// 내 저장 양식 목록(기록지/일정표 각각 다수)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const forms = await prisma.recordForm.findMany({
    where: { ownerUserId: user.id },
    orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
    select: { id: true, kind: true, name: true, createdAt: true },
  });
  return Response.json({ forms });
}

// 업로드 양식 저장(자동매핑 spec 포함)
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const name = String(form.get("name") ?? "").trim();
  const kind = String(form.get("kind") ?? "");
  if (!(file instanceof Blob)) return Response.json({ error: "no file" }, { status: 400 });
  if (!name) return Response.json({ error: "이름을 입력하세요." }, { status: 400 });
  if (!KINDS.has(kind)) return Response.json({ error: "종류(기록지/일정표)를 선택하세요." }, { status: 400 });

  let buf = Buffer.from(await file.arrayBuffer());
  let specJson: string;
  try {
    let xml = readSection0(buf);
    let spec = resolveForm(xml).spec;
    // 회기 칸·결과표 행이 5개를 넘으면 저장 시 자동으로 5칸/5행으로 정리.
    // → 출력이 항상 5회기 기준이 되고, 6회기 이상이면 자동으로 두 장으로 나뉜다.
    let trimmed = false;
    if (spec.dateTable != null && spec.extraSessionCols?.length) {
      xml = removeTableColumns(xml, spec.dateTable, spec.extraSessionCols); trimmed = true;
    }
    if (spec.resultTable != null && spec.extraResultRows?.length) {
      xml = removeTableRows(xml, spec.resultTable, spec.extraResultRows); trimmed = true;
    }
    if (trimmed) {
      buf = patchSection0(buf, xml);   // 정리된 템플릿으로 교체 저장
      spec = resolveForm(xml).spec;    // 정리된 구조로 다시 인식
    }
    const ovRaw = form.get("overrides");
    if (typeof ovRaw === "string" && ovRaw.length > 1) {
      try { applyOverrides(spec, JSON.parse(ovRaw)); } catch { /* noop */ }
    }
    specJson = JSON.stringify(spec);
  } catch {
    return Response.json({ error: "편집 가능한 .hwpx 가 아니에요." }, { status: 422 });
  }

  const row = await prisma.recordForm.create({
    data: { ownerUserId: user.id, kind, name: name.slice(0, 80), template: buf, spec: specJson },
    select: { id: true },
  });
  return Response.json({ ok: true, id: row.id });
}

// 양식 삭제(본인 것만)
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return Response.json({ error: "missing id" }, { status: 400 });
  await prisma.recordForm.deleteMany({ where: { id, ownerUserId: user.id } });
  return Response.json({ ok: true });
}
