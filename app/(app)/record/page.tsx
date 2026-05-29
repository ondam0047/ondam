import { prisma } from "@/lib/db";
import { requireRole, isAdmin } from "@/lib/auth";
import RecordClient from "./RecordClient";

export const dynamic = "force-dynamic";

export default async function RecordPage() {
  // 기록지는 OWNER(원장 겸 치료사) 와 THERAPIST 만. 행정(ADMIN) 제외.
  const user = await requireRole(["OWNER", "THERAPIST"]);
  const centerId = user.centerId ?? -1;

  // 이 센터의 아동 목록 (이름 ↔ id 매핑용). 치료사면 본인 담당만.
  const children = await prisma.child.findMany({
    where: isAdmin(user)
      ? { centerId, active: true }
      : { centerId, active: true, therapistId: user.therapistId ?? -1 },
    select: { id: true, name: true, birthDate: true },
    orderBy: { name: "asc" },
  });

  return <RecordClient centerChildren={children} />;
}
