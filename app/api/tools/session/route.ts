import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, getEffectiveTherapistId } from "@/lib/auth";

const MODULES = new Set(["loudness", "spectrogram", "mpt", "speech-rate", "fluency", "pacing"]);

// 담당 아동인지 확인(센터·치료사 스코프).
async function assertOwnsChild(
  centerId: number,
  therapistId: number | null,
  childId: number,
): Promise<boolean> {
  const svc = await prisma.childService.findFirst({
    where: { childId, therapistId: therapistId ?? -1, active: true, child: { centerId } },
    select: { id: true },
  });
  return !!svc;
}

// 세션 저장
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    childId?: number;
    module?: string;
    metrics?: Record<string, unknown>;
    note?: string;
  };
  const childId = Number(body.childId);
  const moduleKey = String(body.module ?? "");
  if (!childId || !MODULES.has(moduleKey)) {
    return Response.json({ error: "missing childId/module" }, { status: 400 });
  }

  const centerId = user.centerId ?? -1;
  const tid = await getEffectiveTherapistId(user);
  if (!(await assertOwnsChild(centerId, tid, childId))) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const row = await prisma.toolSession.create({
    data: {
      childId,
      centerId,
      therapistId: tid,
      module: moduleKey,
      metrics: JSON.stringify(body.metrics ?? {}),
      note: body.note?.slice(0, 500) || null,
    },
    select: { id: true, createdAt: true },
  });
  return Response.json({ ok: true, id: row.id, createdAt: row.createdAt });
}

// 특정 아동·모듈의 최근 세션 조회(추이용, 오래된→최신)
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const childId = Number(searchParams.get("childId"));
  const moduleKey = String(searchParams.get("module") ?? "");
  if (!childId || !MODULES.has(moduleKey)) {
    return Response.json({ error: "missing childId/module" }, { status: 400 });
  }

  const centerId = user.centerId ?? -1;
  const tid = await getEffectiveTherapistId(user);
  if (!(await assertOwnsChild(centerId, tid, childId))) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const rows = await prisma.toolSession.findMany({
    where: { childId, module: moduleKey, centerId },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: { id: true, metrics: true, note: true, createdAt: true },
  });
  const sessions = rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    note: r.note,
    metrics: safeParse(r.metrics),
  }));
  return Response.json({ sessions });
}

// 세션 삭제(본인 센터 범위)
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!id) return Response.json({ error: "missing id" }, { status: 400 });
  const centerId = user.centerId ?? -1;
  await prisma.toolSession.deleteMany({ where: { id, centerId } });
  return Response.json({ ok: true });
}

function safeParse(s: string): Record<string, unknown> {
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return {}; }
}
