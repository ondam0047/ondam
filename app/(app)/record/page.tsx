import { prisma } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/auth";
import RecordClient from "./RecordClient";

export const dynamic = "force-dynamic";

export default async function RecordPage() {
  const user = await requireUser();
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
