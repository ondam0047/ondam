import { prisma } from "@/lib/db";
import { getCurrentUser, getEffectiveTherapistId } from "@/lib/auth";

// 바로툴 대상자 선택용 — 로그인 치료사가 담당하는(활성) 아동 목록.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const centerId = user.centerId ?? -1;
  const tid = await getEffectiveTherapistId(user);

  const services = await prisma.childService.findMany({
    where: {
      therapistId: tid ?? -1,
      active: true,
      child: { active: true, centerId },
    },
    include: { child: { select: { id: true, name: true, birthDate: true } } },
    orderBy: [{ child: { name: "asc" } }],
  });

  const map = new Map<number, { id: number; name: string; birthDate: string | null }>();
  for (const s of services) {
    if (!map.has(s.childId)) {
      map.set(s.childId, { id: s.child.id, name: s.child.name, birthDate: s.child.birthDate });
    }
  }
  return Response.json({ therapist: user.name, children: [...map.values()] });
}
