import { notFound } from "next/navigation";
import Link from "next/link";
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
    <>
      <div className="section-head">
        <div>
          <h2>아동 수정 — {child.name}</h2>
          <p>저장된 일정표는 그대로 유지되고, 새 일정표만 변경된 기본값을 사용합니다.</p>
        </div>
        <Link className="btn btn-ghost" href="/children">← 목록</Link>
      </div>

      <div className="card">
        <div className="card-body">
          <ChildForm child={child} therapists={therapists} action={update} submitLabel="저장" showActive />
        </div>
      </div>
    </>
  );
}
