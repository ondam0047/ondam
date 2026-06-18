import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import MonitorClient from "./MonitorClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function MonitorPage({ params }: Props) {
  const user = await requireUser();
  const { id } = await params;
  const tcId = Number(id);
  if (!tcId) notFound();

  const toolChild = await prisma.toolChild.findFirst({
    where: { id: tcId, ownerId: user.id },
  });
  if (!toolChild) notFound();

  const sessions = await prisma.toolSession.findMany({
    where: { toolChildId: tcId },
    orderBy: { createdAt: "asc" },
    select: { id: true, module: true, metrics: true, note: true, createdAt: true },
  });

  const grouped: Record<string, { id: number; createdAt: string; note: string | null; metrics: Record<string, unknown> }[]> = {};
  for (const s of sessions) {
    if (!grouped[s.module]) grouped[s.module] = [];
    let metrics: Record<string, unknown> = {};
    try { metrics = JSON.parse(s.metrics); } catch { /* noop */ }
    grouped[s.module].push({ id: s.id, createdAt: s.createdAt.toISOString(), note: s.note, metrics });
  }

  return (
    <MonitorClient
      name={toolChild.name}
      memo={toolChild.memo}
      grouped={grouped}
      toolChildId={tcId}
    />
  );
}
