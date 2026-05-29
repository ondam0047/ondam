"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, isAdmin, getEffectiveTherapistId } from "@/lib/auth";

type ServiceInput = {
  id: number | null;
  serviceType: string;
  therapistId: number | null;
  defaultSlot: string | null;
  defaultDays: string | null;
  defaultUnit: number;
  defaultTarget: number;
};

function parseChildHeader(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return null;
  const birthDate = String(formData.get("birthDate") ?? "").trim();
  const mgmtNumber = String(formData.get("mgmtNumber") ?? "").trim();
  const memo = String(formData.get("memo") ?? "").trim();
  const active = formData.get("active") === "on";
  return {
    name,
    birthDate: birthDate || null,
    mgmtNumber: mgmtNumber || null,
    memo: memo || null,
    active,
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
    out.push({
      id: idRaw ? Number(idRaw) : null,
      serviceType,
      therapistId: therapistIdRaw ? Number(therapistIdRaw) : null,
      defaultSlot: String(formData.get(`svc[${i}][defaultSlot]`) ?? "") || null,
      defaultDays: String(formData.get(`svc[${i}][defaultDays]`) ?? "") || null,
      defaultUnit: Number(formData.get(`svc[${i}][defaultUnit]`) ?? 65000) || 65000,
      defaultTarget: Number(formData.get(`svc[${i}][defaultTarget]`) ?? 5) || 5,
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

  // 치료사·일반 사용자는 본인에게 강제 배정.
  let forcedTherapistId: number | null = null;
  if (!isAdmin(user)) {
    forcedTherapistId = await getEffectiveTherapistId(user);
  }

  await prisma.child.create({
    data: {
      name: header.name,
      birthDate: header.birthDate,
      mgmtNumber: header.mgmtNumber,
      memo: header.memo,
      active: true,
      centerId: user.centerId,
      services: {
        create: services.map((s) => ({
          serviceType: s.serviceType,
          therapistId: forcedTherapistId ?? s.therapistId,
          defaultSlot: s.defaultSlot,
          defaultDays: s.defaultDays,
          defaultUnit: s.defaultUnit,
          defaultTarget: s.defaultTarget,
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
  if (!isAdmin(user)) {
    const myId = await getEffectiveTherapistId(user);
    // 본인이 담당하는 서비스가 있는 아동만 수정 가능
    const hasAccess = child.services.some((s) => s.therapistId === myId);
    if (!hasAccess) return;
  }

  let forcedTherapistId: number | null = null;
  if (!isAdmin(user)) {
    forcedTherapistId = await getEffectiveTherapistId(user);
  }

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
      },
    });

    // 폼에서 사라진 기존 서비스는 (권한 검사 후) 삭제
    for (const existing of child.services) {
      if (!incomingIds.includes(existing.id)) {
        // 치료사는 본인 담당이 아닌 서비스를 삭제할 수 없음
        if (!isAdmin(user) && existing.therapistId !== forcedTherapistId) continue;
        await tx.childService.delete({ where: { id: existing.id } });
      }
    }

    // 기존 + 신규 업서트
    for (const s of services) {
      const data = {
        serviceType: s.serviceType,
        therapistId: forcedTherapistId ?? s.therapistId,
        defaultSlot: s.defaultSlot,
        defaultDays: s.defaultDays,
        defaultUnit: s.defaultUnit,
        defaultTarget: s.defaultTarget,
      };
      if (s.id) {
        // 기존 서비스 수정 권한 확인
        const old = child.services.find((cs) => cs.id === s.id);
        if (!old) continue;
        if (!isAdmin(user) && old.therapistId !== forcedTherapistId) continue;
        await tx.childService.update({ where: { id: s.id }, data });
      } else {
        await tx.childService.create({ data: { childId: id, ...data } });
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

  if (!isAdmin(user)) {
    const myId = await getEffectiveTherapistId(user);
    // 치료사: 본인 담당 서비스가 1건이라도 있어야 삭제 가능 (전체 삭제는 위험하니 ADMIN 권장)
    const allMine = child.services.every((s) => s.therapistId === myId);
    if (!allMine) return; // 다른 치료사 서비스도 있으면 거부
  }

  await prisma.child.delete({ where: { id } });
  revalidatePath("/children");
}
