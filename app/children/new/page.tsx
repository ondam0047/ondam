import { prisma } from "@/lib/db";
import { createChild } from "../actions";
import ChildForm from "../ChildForm";

export const dynamic = "force-dynamic";

export default async function NewChildPage() {
  const therapists = await prisma.therapist.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, active: true },
  });
  return (
    <div className="card">
      <h2><span className="n">+</span>아동 추가</h2>
      <ChildForm therapists={therapists} action={createChild} submitLabel="추가" />
    </div>
  );
}
