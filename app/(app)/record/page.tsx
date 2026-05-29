import { prisma } from "@/lib/db";
import { requireRole, getEffectiveTherapistId } from "@/lib/auth";
import RecordClient from "./RecordClient";

export const dynamic = "force-dynamic";

export default async function RecordPage() {
  // 기록지는 OWNER(원장 겸 치료사) 와 THERAPIST 만. 행정(ADMIN) 제외.
  const user = await requireRole(["OWNER", "THERAPIST"]);
  const centerId = user.centerId ?? -1;

  // 원장도 본인 담당 아동만. 본인 Therapist 레코드 자동 연결.
  const myTherapistId = await getEffectiveTherapistId(user);

  const children = await prisma.child.findMany({
    where: { centerId, active: true, therapistId: myTherapistId ?? -1 },
    select: { id: true, name: true, birthDate: true },
    orderBy: { name: "asc" },
  });

  return <RecordClient centerChildren={children} />;
}
