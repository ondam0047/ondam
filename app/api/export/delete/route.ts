import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, getEffectiveTherapistId } from "@/lib/auth";

// 선택한 (childServiceId 목록 + 연·월)의 저장된 일정표/기록지를 일괄 삭제.
// 본인 담당·본인 센터 것만 삭제(관계 필터로 소유권 보장). 세션 행은 cascade 삭제.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { kind, ids, year, month } = (await req.json()) as {
    kind: "schedule" | "record"; ids: number[]; year: number; month: number;
  };
  const cleanIds = Array.isArray(ids) ? ids.filter((n) => Number.isInteger(n)) : [];
  if ((kind !== "schedule" && kind !== "record") || cleanIds.length === 0
    || !Number.isInteger(year) || !Number.isInteger(month)) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  const myTherapistId = await getEffectiveTherapistId(user);
  const owner = { therapistId: myTherapistId ?? -1, child: { centerId: user.centerId ?? -1 } };
  const where = { childServiceId: { in: cleanIds }, year, month, childService: owner };

  const r = kind === "schedule"
    ? await prisma.schedule.deleteMany({ where })
    : await prisma.record.deleteMany({ where });

  return Response.json({ ok: true, deleted: r.count });
}
