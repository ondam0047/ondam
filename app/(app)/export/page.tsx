import { prisma } from "@/lib/db";
import { requireRole, getEffectiveTherapistId } from "@/lib/auth";
import ExportClient from "./ExportClient";

export const dynamic = "force-dynamic";

export default async function ExportPage() {
  const user = await requireRole(["OWNER", "THERAPIST"]);
  const centerId = user.centerId ?? -1;
  const myTherapistId = await getEffectiveTherapistId(user);

  // 저장된 일정표·기록지를 (연·월) 단위로 모아 옵션 구성.
  const [schedules, records] = await Promise.all([
    prisma.schedule.findMany({
      where: { childService: { therapistId: myTherapistId ?? -1, child: { centerId } } },
      select: {
        childServiceId: true, year: true, month: true,
        childService: { select: { serviceType: true, child: { select: { name: true } } } },
      },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    }),
    prisma.record.findMany({
      where: { childService: { therapistId: myTherapistId ?? -1, child: { centerId } } },
      select: {
        childServiceId: true, year: true, month: true,
        childService: { select: { serviceType: true, child: { select: { name: true } } } },
      },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    }),
  ]);

  type Item = { childServiceId: number; name: string; serviceType: string };
  type MonthGroup = { ym: string; year: number; month: number; items: Item[] };

  function groupByMonth(
    rows: { childServiceId: number; year: number; month: number; childService: { serviceType: string; child: { name: string } } }[]
  ): MonthGroup[] {
    const map = new Map<string, MonthGroup>();
    for (const r of rows) {
      const ym = `${r.year}-${r.month}`;
      if (!map.has(ym)) map.set(ym, { ym, year: r.year, month: r.month, items: [] });
      // 같은 (월, childServiceId) 중복 방지
      const g = map.get(ym)!;
      if (!g.items.some((it) => it.childServiceId === r.childServiceId)) {
        g.items.push({
          childServiceId: r.childServiceId,
          name: r.childService.child.name,
          serviceType: r.childService.serviceType,
        });
      }
    }
    // 월 내림차순, 아동 이름 오름차순
    const arr = [...map.values()].sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month));
    for (const g of arr) g.items.sort((a, b) => a.name.localeCompare(b.name));
    return arr;
  }

  return (
    <ExportClient
      scheduleMonths={groupByMonth(schedules)}
      recordMonths={groupByMonth(records)}
    />
  );
}
