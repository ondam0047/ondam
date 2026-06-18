import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, getEffectiveTherapistId } from "@/lib/auth";

const MODULES = new Set(["loudness", "spectrogram", "mpt", "speech-rate", "fluency", "pacing"]);

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

async function assertOwnsToolChild(userId: number, toolChildId: number): Promise<boolean> {
  const tc = await prisma.toolChild.findFirst({ where: { id: toolChildId, ownerId: userId }, select: { id: true } });
  return !!tc;
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    childId?: number;
    toolChildId?: number;
    module?: string;
    metrics?: Record<string, unknown>;
    note?: string;
  };

  const moduleKey = String(body.module ?? "");
  if (!MODULES.has(moduleKey)) {
    return Response.json({ error: "invalid module" }, { status: 400 });
  }

  const toolChildId = Number(body.toolChildId) || 0;
  if (toolChildId) {
    if (!(await assertOwnsToolChild(user.id, toolChildId))) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    const row = await prisma.toolSession.create({
      data: {
        toolChildId,
        therapistId: await getEffectiveTherapistId(user),
        module: moduleKey,
        metrics: JSON.stringify(body.metrics ?? {}),
        note: body.note?.slice(0, 500) || null,
      },
      select: { id: true, createdAt: true },
    });
    return Response.json({ ok: true, id: row.id, createdAt: row.createdAt });
  }

  const childId = Number(body.childId);
  if (!childId) return Response.json({ error: "missing childId/toolChildId" }, { status: 400 });

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

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const moduleKey = String(searchParams.get("module") ?? "");
  if (!MODULES.has(moduleKey)) {
    return Response.json({ error: "invalid module" }, { status: 400 });
  }

  const toolChildId = Number(searchParams.get("toolChildId")) || 0;
  if (toolChildId) {
    if (!(await assertOwnsToolChild(user.id, toolChildId))) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    const rows = await prisma.toolSession.findMany({
      where: { toolChildId, module: moduleKey },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: { id: true, metrics: true, note: true, createdAt: true },
    });
    return Response.json({ sessions: rows.map(formatRow) });
  }

  const childId = Number(searchParams.get("childId"));
  if (!childId) return Response.json({ error: "missing childId/toolChildId" }, { status: 400 });

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
  return Response.json({ sessions: rows.map(formatRow) });
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!id) return Response.json({ error: "missing id" }, { status: 400 });

  const centerId = user.centerId ?? -1;
  // Allow deletion if owned via centerId OR via toolChild.ownerId
  const session = await prisma.toolSession.findUnique({ where: { id }, select: { centerId: true, toolChildId: true } });
  if (!session) return Response.json({ ok: true });

  if (session.toolChildId) {
    if (!(await assertOwnsToolChild(user.id, session.toolChildId))) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
  } else if (session.centerId !== centerId) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  await prisma.toolSession.delete({ where: { id } });
  return Response.json({ ok: true });
}

function formatRow(r: { id: number; metrics: string; note: string | null; createdAt: Date }) {
  return {
    id: r.id,
    createdAt: r.createdAt,
    note: r.note,
    metrics: safeParse(r.metrics),
  };
}

function safeParse(s: string): Record<string, unknown> {
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return {}; }
}
