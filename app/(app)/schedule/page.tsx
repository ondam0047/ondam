import { prisma } from "@/lib/db";
import ScheduleClient from "./ScheduleClient";
import { requireRole, getEffectiveTherapistId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  // 일정표는 OWNER(원장 겸 치료사) 와 THERAPIST 만. 행정(ADMIN) 제외.
  const user = await requireRole(["OWNER", "THERAPIST"]);
  const centerId = user.centerId ?? -1;

  // 원장도 본인 담당 아동만. 본인 Therapist 레코드 자동 연결.
  const myTherapistId = await getEffectiveTherapistId(user);

  const [children, therapists] = await Promise.all([
    prisma.child.findMany({
      where: { active: true, centerId, therapistId: myTherapistId ?? -1 },
      orderBy: { name: "asc" },
      include: { therapist: true },
    }),
    prisma.therapist.findMany({
      where: { active: true, centerId },
      orderBy: { name: "asc" },
    }),
  ]);

  const childOptions = children.map((c) => ({
    id: c.id,
    name: c.name,
    birthDate: c.birthDate,
    serviceType: c.serviceType,
    mgmtNumber: c.mgmtNumber,
    defaultSlot: c.defaultSlot,
    defaultDays: c.defaultDays,
    defaultUnit: c.defaultUnit,
    defaultTarget: c.defaultTarget,
    therapistName: c.therapist?.name ?? null,
  }));
  const therapistOptions = therapists.map((t) => ({ id: t.id, name: t.name }));

  const myTherapistName = therapists.find((t) => t.id === myTherapistId)?.name ?? null;

  return (
    <ScheduleClient
      children={childOptions}
      therapists={therapistOptions}
      defaultFilterTherapist={myTherapistName}
      defaultOrg={user.centerName ?? ""}
    />
  );
}
