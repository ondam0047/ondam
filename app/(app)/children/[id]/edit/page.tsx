import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { updateChild } from "../../actions";
import ChildForm from "../../ChildForm";
import { requireUser, isAdmin, getEffectiveTherapistId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function EditChildPage(props: PageProps<"/children/[id]/edit">) {
  const user = await requireUser();
  const { id } = await props.params;
  const cid = Number(id);
  if (!Number.isInteger(cid)) notFound();

  const child = await prisma.child.findUnique({ where: { id: cid } });
  if (!child) notFound();
  // 다른 센터·다른 치료사 담당 아동은 접근 거부
  if (child.centerId !== user.centerId) redirect("/children");
  if (!isAdmin(user)) {
    const myId = await getEffectiveTherapistId(user);
    if (child.therapistId !== myId) redirect("/children");
  }

  const therapists = isAdmin(user)
    ? await prisma.therapist.findMany({
        where: { active: true, centerId: user.centerId ?? -1 },
        orderBy: { name: "asc" },
        select: { id: true, name: true, active: true },
      })
    : [];

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
          <ChildForm
            child={child}
            therapists={therapists}
            action={update}
            submitLabel="저장"
            showActive
            hideTherapistSelect={!isAdmin(user)}
          />
        </div>
      </div>
    </>
  );
}
