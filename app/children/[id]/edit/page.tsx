import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { updateChild } from "../../actions";
import ChildForm from "../../ChildForm";

export const dynamic = "force-dynamic";

export default async function EditChildPage(props: PageProps<"/children/[id]/edit">) {
  const { id } = await props.params;
  const cid = Number(id);
  if (!Number.isInteger(cid)) notFound();

  const [child, therapists] = await Promise.all([
    prisma.child.findUnique({ where: { id: cid } }),
    prisma.therapist.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, active: true },
    }),
  ]);
  if (!child) notFound();

  const update = updateChild.bind(null, child.id);

  return (
    <div className="card">
      <h2><span className="n">✎</span>아동 수정 — {child.name}</h2>
      <ChildForm child={child} therapists={therapists} action={update} submitLabel="저장" showActive />
    </div>
  );
}
