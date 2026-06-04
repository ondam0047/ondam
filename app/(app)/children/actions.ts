"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, getEffectiveTherapistId } from "@/lib/auth";

type ServiceInput = {
  id: number | null;
  serviceType: string;
  therapistId: number | null;
  defaultSlot: string | null;
  defaultDays: string | null;
  daySlots: string | null;
  defaultUnit: number;
  defaultTarget: number;
  monthlyCopay: number | null;
};

function parseChildHeader(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return null;
  const birthDate = String(formData.get("birthDate") ?? "").trim();
  const mgmtNumber = String(formData.get("mgmtNumber") ?? "").trim();
  const memo = String(formData.get("memo") ?? "").trim();
  const active = formData.get("active") === "on";
  const waiting = formData.get("waiting") === "on";
  return {
    name,
    birthDate: birthDate || null,
    mgmtNumber: mgmtNumber || null,
    memo: memo || null,
    active,
    waiting,
  };
}

function parseServices(formData: FormData): ServiceInput[] {
  const count = Number(formData.get("serviceCount") ?? 0) || 0;
  const out: ServiceInput[] = [];
  for (let i = 0; i < count; i++) {
    const serviceType = String(formData.get(`svc[${i}][serviceType]`) ?? "").trim();
    if (!serviceType) continue;
    const idRaw = String(formData.get(`svc[${i}][id]`) ?? "");
    const therapistIdRaw = String(formData.get(`svc[${i}][therapistId]`) ?? "");
    const copayRaw = String(formData.get(`svc[${i}][monthlyCopay]`) ?? "").trim();
    out.push({
      id: idRaw ? Number(idRaw) : null,
      serviceType,
      therapistId: therapistIdRaw ? Number(therapistIdRaw) : null,
      defaultSlot: String(formData.get(`svc[${i}][defaultSlot]`) ?? "") || null,
      defaultDays: String(formData.get(`svc[${i}][defaultDays]`) ?? "") || null,
      daySlots: String(formData.get(`svc[${i}][daySlots]`) ?? "") || null,
      defaultUnit: Number(formData.get(`svc[${i}][defaultUnit]`) ?? 0) || 0,
      defaultTarget: Number(formData.get(`svc[${i}][defaultTarget]`) ?? 5) || 5,
      monthlyCopay: copayRaw ? (Number(copayRaw) || 0) : null,
    });
  }
  return out;
}

export async function createChild(formData: FormData) {
  const user = await requireUser();
  const header = parseChildHeader(formData);
  if (!header) return;
  const services = parseServices(formData);
  if (services.length === 0) return;

  // 담당 치료사는 항상 등록자 본인으로 고정.
  const forcedTherapistId = await getEffectiveTherapistId(user);

  await prisma.child.create({
    data: {
      name: header.name,
      birthDate: header.birthDate,
      mgmtNumber: header.mgmtNumber,
      memo: header.memo,
      waiting: header.waiting,
      active: true,
      centerId: user.centerId,
      services: {
        create: services.map((s) => ({
          serviceType: s.serviceType,
          therapistId: forcedTherapistId ?? s.therapistId,
          defaultSlot: s.defaultSlot,
          defaultDays: s.defaultDays,
          daySlots: s.daySlots,
          defaultUnit: s.defaultUnit,
          defaultTarget: s.defaultTarget,
          monthlyCopay: s.monthlyCopay,
        })),
      },
    },
  });
  revalidatePath("/children");
  redirect("/children");
}

export async function updateChild(id: number, formData: FormData) {
  const user = await requireUser();
  const header = parseChildHeader(formData);
  if (!header) return;
  const services = parseServices(formData);
  if (services.length === 0) return;

  const child = await prisma.child.findUnique({
    where: { id },
    include: { services: true },
  });
  if (!child || child.centerId !== user.centerId) return;

  // 신규 서비스는 본인에게 배정. 기존 서비스의 담당 치료사는 그대로 유지.
  const forcedTherapistId = await getEffectiveTherapistId(user);

  // 본인이 담당하는 서비스가 있는 아동만 수정 가능
  const hasAccess = child.services.some((s) => s.therapistId === forcedTherapistId);
  if (!hasAccess) return;

  // 트랜잭션: 헤더 업데이트 + 서비스 업서트 + 삭제된 서비스 제거
  const incomingIds = services.filter((s) => s.id !== null).map((s) => s.id!);
  await prisma.$transaction(async (tx) => {
    await tx.child.update({
      where: { id },
      data: {
        name: header.name,
        birthDate: header.birthDate,
        mgmtNumber: header.mgmtNumber,
        memo: header.memo,
        active: header.active,
        waiting: header.waiting,
      },
    });

    // 폼에서 사라진 기존 서비스는 (권한 검사 후) 삭제
    for (const existing of child.services) {
      if (!incomingIds.includes(existing.id)) {
        // 본인 담당이 아닌 서비스는 삭제할 수 없음
        if (existing.therapistId !== forcedTherapistId) continue;
        await tx.childService.delete({ where: { id: existing.id } });
      }
    }

    // 기존 + 신규 업서트
    for (const s of services) {
      const base = {
        serviceType: s.serviceType,
        defaultSlot: s.defaultSlot,
        defaultDays: s.defaultDays,
        daySlots: s.daySlots,
        defaultUnit: s.defaultUnit,
        defaultTarget: s.defaultTarget,
        monthlyCopay: s.monthlyCopay,
      };
      if (s.id) {
        // 기존 서비스 수정 권한 확인
        const old = child.services.find((cs) => cs.id === s.id);
        if (!old) continue;
        if (old.therapistId !== forcedTherapistId) continue;
        // 기존 담당 치료사는 재배정하지 않고 그대로 유지
        await tx.childService.update({ where: { id: s.id }, data: { ...base, therapistId: old.therapistId } });
      } else {
        await tx.childService.create({ data: { childId: id, ...base, therapistId: forcedTherapistId ?? s.therapistId } });
      }
    }
  });

  revalidatePath("/children");
  redirect("/children");
}

export async function deleteChild(id: number) {
  const user = await requireUser();
  const child = await prisma.child.findUnique({
    where: { id },
    include: { services: true },
  });
  if (!child || child.centerId !== user.centerId) return;

  const myId = await getEffectiveTherapistId(user);
  // 모든 서비스가 본인 담당일 때만 삭제 가능
  const allMine = child.services.every((s) => s.therapistId === myId);
  if (!allMine) return;

  await prisma.child.delete({ where: { id } });
  revalidatePath("/children");
}
