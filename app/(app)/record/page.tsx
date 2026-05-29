import { prisma } from "@/lib/db";
import { requireRole, getEffectiveTherapistId } from "@/lib/auth";
import RecordClient from "./RecordClient";

export const dynamic = "force-dynamic";

export default async function RecordPage() {
  const user = await requireRole(["OWNER", "THERAPIST"]);
  const centerId = user.centerId ?? -1;
  const myTherapistId = await getEffectiveTherapistId(user);

  const services = await prisma.childService.findMany({
    where: {
      active: true,
      therapistId: myTherapistId ?? -1,
      child: { active: true, centerId },
    },
    include: { child: true },
    orderBy: [{ child: { name: "asc" } }, { id: "asc" }],
  });

  // 같은 아동에 여러 서비스가 있으면 라벨에 종류 표시
  const childCount = new Map<number, number>();
  for (const s of services) childCount.set(s.childId, (childCount.get(s.childId) ?? 0) + 1);

  const myServices = services.map((s) => ({
    id: s.id,
    childId: s.childId,
    name: s.child.name,
    birthDate: s.child.birthDate,
    serviceType: s.serviceType,
    hasMultipleServices: (childCount.get(s.childId) ?? 0) > 1,
  }));

  return (
    <RecordClient
      myServices={myServices}
      defaultTherapist={user.name}
      defaultOrg={user.centerName ?? ""}
    />
  );
}
