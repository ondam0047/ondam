import { prisma } from "@/lib/db";
import ScheduleClient from "./ScheduleClient";
import { requireRole, isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  // 일정표는 OWNER(원장 겸 치료사) 와 THERAPIST 만. 행정(ADMIN) 제외.
  const user = await requireRole(["OWNER", "THERAPIST"]);
  const canManage = isAdmin(user);

  const centerId = user.centerId ?? -1;
  const [children, therapists] = await Promise.all([
    prisma.child.findMany({
      where: canManage
        ? { active: true, centerId }
        : { active: true, centerId, therapistId: user.therapistId ?? -1 },
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

  // 로그인 사용자가 치료사 목록에 있는 이름이면 자동으로 그 치료사로 필터
  // (OWNER 본인이 실제 치료사인 경우 흔함)
  const myTherapistName =
    therapists.find((t) => t.name === user.name)?.name ?? null;

  return (
    <ScheduleClient
      children={childOptions}
      therapists={therapistOptions}
      defaultFilterTherapist={myTherapistName}
    />
  );
}
