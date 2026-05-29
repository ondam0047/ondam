import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";

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

  // 아동 일괄 등록
  const rows = body.children ?? [];
  // 치료사 이름 → ID 매핑 (이 센터 안에서 dedup + 신규 자동 등록)
  const therapistNames = [...new Set(rows.map((r) => r.therapistName).filter(Boolean) as string[])];
  for (const tn of therapistNames) {
    const existing = await prisma.therapist.findFirst({ where: { name: tn, centerId } });
    if (!existing) await prisma.therapist.create({ data: { name: tn, centerId } });
  }
  const therapists = await prisma.therapist.findMany({ where: { centerId } });
  const tMap = new Map(therapists.map((t) => [t.name, t.id]));

  let saved = 0;
  for (const r of rows) {
    if (!r.name) continue;
    // 같은 센터 안에서 이름+생년월일 중복 체크
    const existing = await prisma.child.findFirst({
      where: { name: r.name, birthDate: r.birthDate ?? null, centerId },
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
        centerId,
      },
    });
    saved++;
  }

  return Response.json({ ok: true, savedCount: saved });
}
