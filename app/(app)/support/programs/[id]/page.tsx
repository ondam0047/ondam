import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isBetaUx } from "@/lib/feature-flags";
import ProgramRecordClient from "./ProgramRecordClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function ProgramPage({ params }: Props) {
  const user = await requireUser();
  const { id } = await params;
  const pid = Number(id);
  if (!pid) notFound();

  const program = await prisma.program.findFirst({
    where: { id: pid, ownerId: user.id, active: true },
  });
  if (!program) notFound();

  const rows = await prisma.supportRecord.findMany({
    where: { ownerUserId: user.id, programId: pid },
    orderBy: { updatedAt: "desc" },
    select: { id: true, student: true, payload: true, updatedAt: true, toolChildId: true },
  });
  const saved = rows.map((r) => ({
    id: r.id,
    student: r.student,
    updatedAt: r.updatedAt.toISOString().slice(0, 10),
    payload: r.payload,
    toolChildId: r.toolChildId,
  }));

  return (
    <ProgramRecordClient
      programId={pid}
      programName={program.name}
      hasForm={!!program.formSpec}
      therapist={user.name}
      org={user.centerName ?? ""}
      saved={saved}
      betaUx={isBetaUx(user.email)}
    />
  );
}
