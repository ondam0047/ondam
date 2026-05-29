import { prisma } from "@/lib/db";
import ScheduleClient from "./ScheduleClient";
import { requireRole, getEffectiveTherapistId } from "@/lib/auth";
import { parseServiceTypes, parseSlots } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  // OWNER(원장 겸 치료사) 와 THERAPIST 만 일정표 작성. 행정(ADMIN) 제외.
  const user = await requireRole(["OWNER", "THERAPIST"]);
  const centerId = user.centerId ?? -1;

  const myTherapistId = await getEffectiveTherapistId(user);

  const [services, therapists, center] = await Promise.all([
    prisma.childService.findMany({
      where: {
        active: true,
        therapistId: myTherapistId ?? -1,
        child: { active: true, centerId },
      },
      include: { child: true, therapist: true },
      orderBy: [{ child: { name: "asc" } }, { id: "asc" }],
    }),
    prisma.therapist.findMany({
      where: { active: true, centerId },
      orderBy: { name: "asc" },
    }),
    prisma.center.findUnique({ where: { id: centerId }, select: { serviceTypes: true, slots: true } }),
  ]);

  // 같은 childId 에 서비스가 둘 이상인지 카운트 → 라벨에 종류 표시 여부
  const childIdCount = new Map<number, number>();
  for (const s of services) {
    childIdCount.set(s.childId, (childIdCount.get(s.childId) ?? 0) + 1);
  }

  const childOptions = services.map((s) => ({
    id: s.id, // ChildService.id
    childId: s.childId,
    name: s.child.name,
    birthDate: s.child.birthDate,
    serviceType: s.serviceType,
    mgmtNumber: s.child.mgmtNumber,
    defaultSlot: s.defaultSlot,
    defaultDays: s.defaultDays,
    defaultUnit: s.defaultUnit,
    defaultTarget: s.defaultTarget,
    therapistName: s.therapist?.name ?? null,
    hasMultipleServices: (childIdCount.get(s.childId) ?? 0) > 1,
  }));

  const therapistOptions = therapists.map((t) => ({ id: t.id, name: t.name }));
  const myTherapistName = therapists.find((t) => t.id === myTherapistId)?.name ?? null;
  const serviceTypes = parseServiceTypes(center?.serviceTypes);
  const slots = parseSlots(center?.slots);

  return (
    <ScheduleClient
      children={childOptions}
      therapists={therapistOptions}
      serviceTypes={serviceTypes}
      slots={slots}
      defaultFilterTherapist={myTherapistName}
      defaultOrg={user.centerName ?? ""}
    />
  );
}
