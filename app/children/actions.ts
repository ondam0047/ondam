"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
  const data = parseChildForm(formData);
  if (!data) return;
  // create: active defaults to true (the form on /new has no active checkbox)
  await prisma.child.create({ data: { ...data, active: true } });
  revalidatePath("/children");
  redirect("/children");
}

export async function updateChild(id: number, formData: FormData) {
  const data = parseChildForm(formData);
  if (!data) return;
  await prisma.child.update({ where: { id }, data });
  revalidatePath("/children");
  redirect("/children");
}

export async function deleteChild(id: number) {
  await prisma.child.delete({ where: { id } });
  revalidatePath("/children");
}
