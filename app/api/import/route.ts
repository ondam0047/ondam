import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

type ChildRow = {
  name: string;
  birthDate?: string;
  serviceType: string;
  mgmtNumber?: string;
  therapistName?: string;
  defaultSlot?: string;
  defaultDays?: string;
  defaultUnit?: number;
  defaultTarget?: number;
  memo?: string;
};

type TherapistRow = {
  name: string;
  phone?: string;
};

type Body =
  | { mode: "child"; children: ChildRow[]; therapists?: never }
  | { mode: "therapist"; therapists: TherapistRow[]; children?: never };

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Body;

  if (body.mode === "therapist") {
    const rows = body.therapists ?? [];
    let saved = 0;
    for (const r of rows) {
      if (!r.name) continue;
      // 같은 이름 있으면 전화만 보정
      const existing = await prisma.therapist.findFirst({ where: { name: r.name } });
      if (existing) {
        if (r.phone && !existing.phone) {
          await prisma.therapist.update({ where: { id: existing.id }, data: { phone: r.phone } });
        }
        continue;
      }
      await prisma.therapist.create({
        data: { name: r.name, phone: r.phone ?? null },
      });
      saved++;
    }
    return Response.json({ ok: true, savedCount: saved });
  }

  // 아동 일괄 등록
  const rows = body.children ?? [];
  // 치료사 이름 → ID 매핑 (자동 등록)
  const therapistNames = [...new Set(rows.map((r) => r.therapistName).filter(Boolean) as string[])];
  for (const tn of therapistNames) {
    const existing = await prisma.therapist.findFirst({ where: { name: tn } });
    if (!existing) await prisma.therapist.create({ data: { name: tn } });
  }
  const therapists = await prisma.therapist.findMany();
  const tMap = new Map(therapists.map((t) => [t.name, t.id]));

  let saved = 0;
  for (const r of rows) {
    if (!r.name) continue;
    // 같은 이름 + 같은 생년월일 이미 있으면 스킵 (중복 방지)
    const existing = await prisma.child.findFirst({
      where: { name: r.name, birthDate: r.birthDate ?? null },
    });
    if (existing) continue;

    await prisma.child.create({
      data: {
        name: r.name,
        birthDate: r.birthDate ?? null,
        serviceType: r.serviceType,
        mgmtNumber: r.mgmtNumber ?? null,
        therapistId: r.therapistName ? tMap.get(r.therapistName) ?? null : null,
        defaultSlot: r.defaultSlot ?? null,
        defaultDays: r.defaultDays ?? null,
        defaultUnit: r.defaultUnit ?? 65000,
        defaultTarget: r.defaultTarget ?? 5,
        memo: r.memo ?? null,
      },
    });
    saved++;
  }

  return Response.json({ ok: true, savedCount: saved });
}
