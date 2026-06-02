import { prisma } from "@/lib/db";
import ScheduleClient from "./ScheduleClient";
import { requireRole, getEffectiveTherapistId } from "@/lib/auth";
import { parseSlots, THERAPIST_TO_SERVICE } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const user = await requireRole(["OWNER", "THERAPIST"]);
  const centerId = user.centerId ?? -1;
  const myTherapistId = await getEffectiveTherapistId(user);

  // 본인 사용자 + 본인 Therapist 만 가져옴 (1인 모드)
  const [userRow, services, center] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { therapistType: true } }),
    prisma.childService.findMany({
      where: {
        active: true,
        therapistId: myTherapistId ?? -1,
        child: { active: true, centerId },
      },
      include: { child: true, therapist: true },
      orderBy: [{ child: { name: "asc" } }, { id: "asc" }],
    }),
    prisma.center.findUnique({ where: { id: centerId }, select: { serviceTypes: true, slots: true, defaultUnit: true } }),
  ]);

  const childIdCount = new Map<number, number>();
  for (const s of services) {
    childIdCount.set(s.childId, (childIdCount.get(s.childId) ?? 0) + 1);
  }

  const childOptions = services.map((s) => ({
    id: s.id,
    childId: s.childId,
    name: s.child.name,
    birthDate: s.child.birthDate,
    serviceType: s.serviceType,
    mgmtNumber: s.child.mgmtNumber,
    defaultSlot: s.defaultSlot,
    defaultDays: s.defaultDays,
    daySlots: s.daySlots,
    defaultUnit: s.defaultUnit,
    defaultTarget: s.defaultTarget,
    monthlyCopay: s.monthlyCopay,
    therapistName: s.therapist?.name ?? null,
    hasMultipleServices: (childIdCount.get(s.childId) ?? 0) > 1,
  }));

  // 1인 사물함: 치료사 목록은 본인 한 명만
  const therapistOptions = [{ id: myTherapistId ?? 0, name: user.name }];

  // 서비스 종류는 가입 시 선택한 치료사 종류로 고정 (잠금)
  const lockedService = userRow?.therapistType
    ? (THERAPIST_TO_SERVICE[userRow.therapistType] ?? userRow.therapistType)
    : null;
  const serviceTypes = lockedService ? [lockedService] : ["언어재활"];
  const slots = parseSlots(center?.slots);

  return (
    <ScheduleClient
      children={childOptions}
      therapists={therapistOptions}
      serviceTypes={serviceTypes}
      slots={slots}
      defaultFilterTherapist={user.name}
      defaultOrg={user.centerName ?? ""}
      centerDefaultUnit={center?.defaultUnit ?? 60000}
    />
  );
}
