import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";

type ChildServiceRow = {
  name: string;
  birthDate?: string;
  serviceType: string;
  mgmtNumber?: string;
  therapistName?: string;
  defaultSlot?: string;
  defaultDays?: string;
  defaultUnit?: number;
  defaultTarget?: number;
  monthlyCopay?: number;
  memo?: string;
};

type TherapistRow = {
  name: string;
  phone?: string;
};

type Body =
  | { mode: "child"; children: ChildServiceRow[]; therapists?: never }
  | { mode: "therapist"; therapists: TherapistRow[]; children?: never };

export async function POST(req: NextRequest) {
  const user = await requireRole(["OWNER", "ADMIN"]);
  const centerId = user.centerId;
  if (!centerId) {
    return Response.json({ error: "센터 정보가 없어요. 다시 로그인해주세요." }, { status: 400 });
  }

  const body = (await req.json()) as Body;

  if (body.mode === "therapist") {
    const rows = body.therapists ?? [];
    let saved = 0;
    for (const r of rows) {
      if (!r.name) continue;
      const existing = await prisma.therapist.findFirst({ where: { name: r.name, centerId } });
      if (existing) {
        if (r.phone && !existing.phone) {
          await prisma.therapist.update({ where: { id: existing.id }, data: { phone: r.phone } });
        }
        continue;
      }
      await prisma.therapist.create({
        data: { name: r.name, phone: r.phone ?? null, centerId },
      });
      saved++;
    }
    return Response.json({ ok: true, savedCount: saved });
  }

  // 아동 + 서비스 일괄 등록
  const rows = body.children ?? [];

  // 진단용 카운터
  let skippedNoName = 0;
  let skippedDupe = 0;
  let createdChild = 0;
  let createdService = 0;

  // 치료사 이름들을 미리 정리: 이름이 있으면 찾거나 생성
  const therapistNames = [...new Set(rows.map((r) => r.therapistName?.trim()).filter(Boolean) as string[])];
  for (const tn of therapistNames) {
    const existing = await prisma.therapist.findFirst({ where: { name: tn, centerId } });
    if (!existing) await prisma.therapist.create({ data: { name: tn, centerId } });
  }
  const therapists = await prisma.therapist.findMany({ where: { centerId } });
  const tMap = new Map(therapists.map((t) => [t.name, t.id]));

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

    const therapistName = r.therapistName?.trim();
    const therapistId = therapistName ? tMap.get(therapistName) ?? null : null;
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
