"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, isAdmin, getEffectiveTherapistId } from "@/lib/auth";

function parseChildForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return null;
  const birthDate = String(formData.get("birthDate") ?? "").trim();
  const serviceType = String(formData.get("serviceType") ?? "언어재활").trim();
  const mgmtNumber = String(formData.get("mgmtNumber") ?? "").trim();
  const defaultSlot = String(formData.get("defaultSlot") ?? "").trim();
  const defaultDays = String(formData.get("defaultDays") ?? "").trim();
  const defaultUnit = Number(formData.get("defaultUnit") ?? 65000) || 65000;
  const defaultTarget = Number(formData.get("defaultTarget") ?? 5) || 5;
  const memo = String(formData.get("memo") ?? "").trim();
  const therapistIdRaw = String(formData.get("therapistId") ?? "");
  const therapistId = therapistIdRaw ? Number(therapistIdRaw) : null;
  const active = formData.get("active") === "on";
  return {
    name,
    birthDate: birthDate || null,
    serviceType,
    mgmtNumber: mgmtNumber || null,
    defaultSlot: defaultSlot || null,
    defaultDays: defaultDays || null,
    defaultUnit,
    defaultTarget,
    memo: memo || null,
    therapistId,
    active,
  };
}

export async function createChild(formData: FormData) {
  const user = await requireUser();
  const data = parseChildForm(formData);
  if (!data) return;

  // 행정·원장은 폼에서 고른 치료사로, 일반 치료사는 본인에게 강제 배정.
  // 원장도 치료사 자격으로 등록하면 본인에게 강제 배정 (어드민 메뉴에서 다른 사람 거 만들 땐 폼 값 사용).
  let therapistId: number | null = data.therapistId;
  if (!isAdmin(user)) {
    therapistId = await getEffectiveTherapistId(user);
  }

  await prisma.child.create({
    data: {
      ...data,
      therapistId,
      centerId: user.centerId,
      active: true,
    },
  });
  revalidatePath("/children");
  redirect("/children");
}

export async function updateChild(id: number, formData: FormData) {
  const user = await requireUser();
  const data = parseChildForm(formData);
  if (!data) return;

  // 권한 체크: 자기 센터의 아동만 수정 가능. 일반 치료사는 자기 담당만.
  const child = await prisma.child.findUnique({ where: { id }, select: { centerId: true, therapistId: true } });
  if (!child || child.centerId !== user.centerId) return;
  if (!isAdmin(user)) {
    const myId = await getEffectiveTherapistId(user);
    if (child.therapistId !== myId) return;
  }

  // 치료사 본인이 수정하면 therapistId 는 본인 유지
  let therapistId = data.therapistId;
  if (!isAdmin(user)) {
    therapistId = await getEffectiveTherapistId(user);
  }

  await prisma.child.update({
    where: { id },
    data: { ...data, therapistId },
  });
  revalidatePath("/children");
  redirect("/children");
}

export async function deleteChild(id: number) {
  const user = await requireUser();
  const child = await prisma.child.findUnique({ where: { id }, select: { centerId: true, therapistId: true } });
  if (!child || child.centerId !== user.centerId) return;
  if (!isAdmin(user)) {
    const myId = await getEffectiveTherapistId(user);
    if (child.therapistId !== myId) return;
  }
  await prisma.child.delete({ where: { id } });
  revalidatePath("/children");
}
