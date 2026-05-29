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

  // 치료사 이름들을 미리 정리: 이름이 있으면 찾거나 생성
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
    const birth = r.birthDate ?? null;

    // 사람(Child) 찾거나 생성 — 이름 + 생년월일 키
    let child = await prisma.child.findFirst({
      where: { name: r.name, birthDate: birth, centerId },
    });
    if (!child) {
      child = await prisma.child.create({
        data: {
          name: r.name,
          birthDate: birth,
          mgmtNumber: r.mgmtNumber ?? null,
          memo: r.memo ?? null,
          centerId,
        },
      });
    } else if (r.mgmtNumber && !child.mgmtNumber) {
      // 관리번호 비어있으면 채워줌
      await prisma.child.update({ where: { id: child.id }, data: { mgmtNumber: r.mgmtNumber } });
    }

    const therapistId = r.therapistName ? tMap.get(r.therapistName) ?? null : null;

    // 같은 (Child, 서비스 종류, 치료사) 조합이 있으면 건너뜀
    const dupe = await prisma.childService.findFirst({
      where: {
        childId: child.id,
        serviceType: r.serviceType,
        therapistId,
      },
    });
    if (dupe) continue;

    await prisma.childService.create({
      data: {
        childId: child.id,
        therapistId,
        serviceType: r.serviceType,
        defaultSlot: r.defaultSlot ?? null,
        defaultDays: r.defaultDays ?? null,
        defaultUnit: r.defaultUnit ?? 65000,
        defaultTarget: r.defaultTarget ?? 5,
      },
    });
    saved++;
  }

  return Response.json({ ok: true, savedCount: saved });
}
