import { prisma } from "@/lib/db";
import { requireRole, getEffectiveTherapistId } from "@/lib/auth";
import RecordClient from "./RecordClient";

export const dynamic = "force-dynamic";

export default async function RecordPage() {
  const user = await requireRole(["OWNER", "THERAPIST"]);
  const centerId = user.centerId ?? -1;
  const myTherapistId = await getEffectiveTherapistId(user);

  // 본인 담당 서비스만. 한 아동이 본인에게 여러 서비스(언어재활+놀이 등) 받을 수도 있음.
  const services = await prisma.childService.findMany({
    where: {
      active: true,
      therapistId: myTherapistId ?? -1,
      child: { active: true, centerId },
    },
    include: { child: true },
    orderBy: [{ child: { name: "asc" } }, { id: "asc" }],
  });

  const myServices = services.map((s) => ({
    id: s.id,
    childId: s.childId,
    name: s.child.name,
    birthDate: s.child.birthDate,
    serviceType: s.serviceType,
  }));

  return <RecordClient myServices={myServices} />;
}
