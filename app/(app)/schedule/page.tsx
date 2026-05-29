import { prisma } from "@/lib/db";
import ScheduleClient from "./ScheduleClient";
import { requireUser, isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const user = await requireUser();
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

  return <ScheduleClient children={childOptions} therapists={therapistOptions} />;
}
