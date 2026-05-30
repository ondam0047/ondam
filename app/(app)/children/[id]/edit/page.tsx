import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { updateChild } from "../../actions";
import ChildForm from "../../ChildForm";
import { requireUser, isAdmin, getEffectiveTherapistId } from "@/lib/auth";
import { parseServiceTypes, parseSlots } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function EditChildPage(props: PageProps<"/children/[id]/edit">) {
  const user = await requireUser();
  const { id } = await props.params;
  const cid = Number(id);
  if (!Number.isInteger(cid)) notFound();

  const child = await prisma.child.findUnique({
    where: { id: cid },
    include: { services: { orderBy: { id: "asc" } } },
  });
  if (!child) notFound();
  if (child.centerId !== user.centerId) redirect("/children");

  if (!isAdmin(user)) {
    const myId = await getEffectiveTherapistId(user);
    const hasMine = child.services.some((s) => s.therapistId === myId);
    if (!hasMine) redirect("/children");
  }

  const [therapists, center] = await Promise.all([
    isAdmin(user)
      ? prisma.therapist.findMany({
          where: { active: true, centerId: user.centerId ?? -1 },
          orderBy: { name: "asc" },
          select: { id: true, name: true, active: true },
        })
      : Promise.resolve([] as { id: number; name: string; active: boolean }[]),
    prisma.center.findUnique({ where: { id: user.centerId ?? -1 }, select: { serviceTypes: true, slots: true, defaultUnit: true } }),
  ]);
  const serviceTypes = parseServiceTypes(center?.serviceTypes);
  const slots = parseSlots(center?.slots);
  const defaultUnit = center?.defaultUnit ?? 60000;

  const update = updateChild.bind(null, child.id);

  // 치료사: 본인 담당 서비스만 폼에 보여줌
  let visibleServices = child.services;
  if (!isAdmin(user)) {
    const myId = await getEffectiveTherapistId(user);
    visibleServices = child.services.filter((s) => s.therapistId === myId);
  }

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
            child={{
              id: child.id,
              name: child.name,
              birthDate: child.birthDate,
              mgmtNumber: child.mgmtNumber,
              memo: child.memo,
              active: child.active,
              waiting: child.waiting,
              services: visibleServices.map((s) => ({
                id: s.id,
                programType: (s.programType === "JITU" ? "JITU" : "DEVREHAB") as "DEVREHAB" | "JITU",
                programAlias: s.programAlias,
                serviceType: s.serviceType,
                therapistId: s.therapistId,
                defaultSlot: s.defaultSlot,
                defaultDays: s.defaultDays,
                defaultUnit: s.defaultUnit,
                defaultTarget: s.defaultTarget,
                monthlyCopay: s.monthlyCopay,
              })),
            }}
            therapists={therapists}
            serviceTypes={serviceTypes}
            slots={slots}
            defaultUnit={defaultUnit}
            action={update}
            submitLabel="저장"
            showActive
            hideTherapistSelect={!isAdmin(user)}
            canSetWaiting={isAdmin(user)}
          />
        </div>
      </div>
    </>
  );
}
