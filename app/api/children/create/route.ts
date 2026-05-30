import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, isAdmin, getEffectiveTherapistId } from "@/lib/auth";

type Body = {
  name: string;
  birthDate?: string;
  mgmtNumber?: string;
  serviceType: string;
  defaultUnit?: number;
  defaultTarget?: number;
  defaultSlot?: string;
  defaultDays?: string;
  monthlyCopay?: number | null;
};

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as Body;
  const name = body.name?.trim();
  const serviceType = body.serviceType?.trim();
  if (!name || !serviceType) {
    return Response.json({ error: "missing name or serviceType" }, { status: 400 });
  }

  let therapistId: number | null = null;
  if (!isAdmin(user)) {
    therapistId = await getEffectiveTherapistId(user);
  }

  const child = await prisma.child.create({
    data: {
      name,
      birthDate: body.birthDate?.trim() || null,
      mgmtNumber: body.mgmtNumber?.trim() || null,
      memo: null,
      waiting: false,
      active: true,
      centerId: user.centerId,
      services: {
        create: [{
          serviceType,
          therapistId,
          defaultSlot: body.defaultSlot || null,
          defaultDays: body.defaultDays || null,
          defaultUnit: body.defaultUnit ?? 60000,
          defaultTarget: body.defaultTarget ?? 5,
          monthlyCopay: body.monthlyCopay ?? null,
        }],
      },
    },
    include: { services: true },
  });

  const svc = child.services[0];
  return Response.json({
    id: svc.id,
    childId: child.id,
    name: child.name,
    birthDate: child.birthDate,
    mgmtNumber: child.mgmtNumber,
    serviceType: svc.serviceType,
    defaultSlot: svc.defaultSlot,
    defaultDays: svc.defaultDays,
    defaultUnit: svc.defaultUnit,
    defaultTarget: svc.defaultTarget,
    monthlyCopay: svc.monthlyCopay,
    therapistName: user.name,
    hasMultipleServices: false,
  });
}
