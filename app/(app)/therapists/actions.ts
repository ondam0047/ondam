"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createTherapist(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!name) return;
  await prisma.therapist.create({
    data: { name, phone: phone || null },
  });
  revalidatePath("/therapists");
}

export async function updateTherapist(id: number, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const active = formData.get("active") === "on";
  if (!name) return;
  await prisma.therapist.update({
    where: { id },
    data: { name, phone: phone || null, active },
  });
  revalidatePath("/therapists");
  redirect("/therapists");
}

export async function deleteTherapist(id: number) {
  await prisma.therapist.delete({ where: { id } });
  revalidatePath("/therapists");
}
