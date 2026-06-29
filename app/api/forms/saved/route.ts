import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { readSection0, patchSection0 } from "@/lib/hwpx";
import { resolveForm, applyOverrides, scopeSpecToKind } from "@/lib/record-resolver";
import { removeTableColumns, removeTableRows } from "@/lib/record-trim";
import { classifyDevVoucherForm } from "@/lib/form-gate";
import { maxCenterForms, planLabel } from "@/lib/plan";

const KINDS = new Set(["record", "schedule"]);
const KIND_LABEL: Record<string, string> = { record: "기록지", schedule: "일정표" };

// 내 저장 양식 목록(기록지/일정표 각각 다수)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const forms = await prisma.recordForm.findMany({
    where: { ownerUserId: user.id },
    orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
    select: { id: true, kind: true, name: true, createdAt: true },
  });
  const planRow = await prisma.user.findUnique({ where: { id: user.id }, select: { plan: true, trialEndsAt: true } });
  const planUser = { plan: planRow?.plan ?? "trial", trialEndsAt: planRow?.trialEndsAt ?? null };
  return Response.json({ forms, maxPerKind: maxCenterForms(planUser), planName: planLabel(planUser) });
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

  // 요금제별 종류당 저장 개수 상한(Solo 2 / Pro 5 / 체험·베타 5) — 초과 시 거부.
  const planRow = await prisma.user.findUnique({ where: { id: user.id }, select: { plan: true, trialEndsAt: true } });
  const planUser = { plan: planRow?.plan ?? "trial", trialEndsAt: planRow?.trialEndsAt ?? null };
  const max = maxCenterForms(planUser);
  const used = await prisma.recordForm.count({ where: { ownerUserId: user.id, kind } });
  if (used >= max) {
    return Response.json(
      { error: `${planLabel(planUser)} 요금제에서는 ${KIND_LABEL[kind]} 양식을 ${max}개까지 저장할 수 있어요. 기존 양식을 삭제하고 다시 시도하거나 요금제를 올려주세요.` },
      { status: 403 },
    );
  }

  let buf = Buffer.from(await file.arrayBuffer());
  let specJson: string;
  try {
    let xml = readSection0(buf);
    const resolved = resolveForm(xml);
    let spec = resolved.spec;
    // 발달바우처 전용 게이트(방어) — 타사업 양식은 저장 거부.
    const gate = classifyDevVoucherForm(resolved.grid, spec);
    if (gate.verdict === "block") {
      return Response.json({ error: gate.reason }, { status: 422 });
    }
    // 회기 칸·결과표 행이 5개를 넘으면 저장 시 자동으로 5칸/5행으로 정리.
    // → 출력이 항상 5회기 기준이 되고, 6회기 이상이면 자동으로 두 장으로 나뉜다.
    let trimmed = false;
    if (spec.dateTable != null && spec.extraSessionCols?.length) {
      // 남은 회기열에 지운 폭을 재분배 → 표 너비 유지로 우측이 다른 표와 정렬됨.
      xml = removeTableColumns(xml, spec.dateTable, spec.extraSessionCols, { redistributeTo: spec.date.map((d) => d[2]) }); trimmed = true;
    }
    if (spec.resultTable != null && spec.extraResultRows?.length) {
      xml = removeTableRows(xml, spec.resultTable, spec.extraResultRows); trimmed = true;
    }
    if (trimmed) {
      buf = patchSection0(buf, xml) as Buffer<ArrayBuffer>;   // 정리된 템플릿으로 교체 저장
      spec = resolveForm(xml).spec;    // 정리된 구조로 다시 인식
    }
    const ovRaw = form.get("overrides");
    if (typeof ovRaw === "string" && ovRaw.length > 1) {
      try { applyOverrides(spec, JSON.parse(ovRaw)); } catch { /* noop */ }
    }
    // 통합 양식(같은 파일을 두 슬롯에 올림)이어도 이 슬롯(kind)의 영역만 채우도록 spec 을 좁혀 저장.
    spec = scopeSpecToKind(spec, kind as "record" | "schedule");
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
