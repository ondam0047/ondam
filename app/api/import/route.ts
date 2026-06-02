import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, getEffectiveTherapistId } from "@/lib/auth";

type ChildServiceRow = {
  name: string;
  birthDate?: string;
  serviceType: string;
  mgmtNumber?: string;
  defaultSlot?: string;
  defaultDays?: string;
  defaultUnit?: number;
  defaultTarget?: number;
  monthlyCopay?: number;
  memo?: string;
};

type Body = { children: ChildServiceRow[] };

export async function POST(req: NextRequest) {
  const user = await requireRole(["OWNER"]);
  const centerId = user.centerId;
  if (!centerId) {
    return Response.json({ error: "센터 정보가 없어요. 다시 로그인해주세요." }, { status: 400 });
  }

  // 1인 사물함 — 가져온 아동은 모두 본인에게 배정
  const therapistId = await getEffectiveTherapistId(user);

  const body = (await req.json()) as Body;
  const rows = body.children ?? [];

  let skippedNoName = 0;
  let skippedDupe = 0;
  let createdChild = 0;
  let createdService = 0;
  let saved = 0;

  for (const r of rows) {
    const name = r.name?.trim();
    if (!name) { skippedNoName++; continue; }
    const birth = r.birthDate?.trim() || null;

    let child = await prisma.child.findFirst({
      where: { name, birthDate: birth, centerId },
    });
    if (!child) {
      child = await prisma.child.create({
        data: {
          name,
          birthDate: birth,
          mgmtNumber: r.mgmtNumber?.trim() || null,
          memo: r.memo?.trim() || null,
          centerId,
        },
      });
      createdChild++;
    } else if (r.mgmtNumber && !child.mgmtNumber) {
      await prisma.child.update({ where: { id: child.id }, data: { mgmtNumber: r.mgmtNumber.trim() } });
    }

    const serviceType = r.serviceType?.trim() || "언어재활";

    const dupe = await prisma.childService.findFirst({
      where: { childId: child.id, serviceType, therapistId },
    });
    if (dupe) { skippedDupe++; continue; }

    await prisma.childService.create({
      data: {
        childId: child.id,
        therapistId,
        serviceType,
        defaultSlot: r.defaultSlot?.trim() || null,
        defaultDays: r.defaultDays?.trim() || null,
        defaultUnit: r.defaultUnit ?? 65000,
        defaultTarget: r.defaultTarget ?? 5,
        monthlyCopay: r.monthlyCopay ?? null,
      },
    });
    createdService++;
    saved++;
  }

  return Response.json({
    ok: true,
    savedCount: saved,
    totalRows: rows.length,
    createdChild,
    createdService,
    skippedNoName,
    skippedDupe,
  });
}
