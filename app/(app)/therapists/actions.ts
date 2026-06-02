"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hashPassword, requireRole } from "@/lib/auth";

// 대상 행이 내 센터 소속인지 확인 (교차-센터 IDOR 방지)
async function assertTherapistInCenter(id: number, centerId: number | null): Promise<void> {
  const t = await prisma.therapist.findUnique({ where: { id }, select: { centerId: true } });
  if (centerId == null || !t || t.centerId !== centerId) {
    redirect("/therapists?err=" + encodeURIComponent("대상을 찾을 수 없어요"));
  }
}
async function assertUserInCenter(userId: number, centerId: number | null): Promise<void> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { centerId: true } });
  if (centerId == null || !u || u.centerId !== centerId) {
    redirect("/therapists?err=" + encodeURIComponent("대상을 찾을 수 없어요"));
  }
}

// ─── 치료사 레코드 ────────────────────────────────────────────────────────
export async function createTherapist(formData: FormData) {
  const me = await requireRole(["OWNER", "ADMIN"]);
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!name) return;
  await prisma.therapist.create({
    data: { name, phone: phone || null, centerId: me.centerId },
  });
  revalidatePath("/therapists");
}

export async function updateTherapist(id: number, formData: FormData) {
  const me = await requireRole(["OWNER", "ADMIN"]);
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const active = formData.get("active") === "on";
  if (!name) return;
  await assertTherapistInCenter(id, me.centerId);
  await prisma.therapist.update({
    where: { id },
    data: { name, phone: phone || null, active },
  });
  revalidatePath("/therapists");
  redirect("/therapists");
}

export async function deleteTherapist(id: number) {
  const me = await requireRole(["OWNER", "ADMIN"]);
  await assertTherapistInCenter(id, me.centerId);
  await prisma.therapist.delete({ where: { id } });
  revalidatePath("/therapists");
}

// ─── 치료사 로그인 계정 ────────────────────────────────────────────────
// 치료사에 로그인 계정 발급. 치료사 ID 필수 → user.therapistId 자동 세팅.
export async function createTherapistAccount(therapistId: number, formData: FormData) {
  const me = await requireRole(["OWNER", "ADMIN"]);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || password.length < 6) {
    redirect("/therapists?err=" + encodeURIComponent("이메일·비밀번호(6자 이상) 필요"));
  }
  const therapist = await prisma.therapist.findUnique({ where: { id: therapistId } });
  if (!therapist || me.centerId == null || therapist.centerId !== me.centerId) {
    redirect("/therapists?err=" + encodeURIComponent("치료사를 찾을 수 없어요"));
  }
  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) {
    redirect("/therapists?err=" + encodeURIComponent("이미 사용 중인 이메일이에요"));
  }
  const existingLink = await prisma.user.findUnique({ where: { therapistId } });
  if (existingLink) {
    redirect("/therapists?err=" + encodeURIComponent("이 치료사는 이미 계정이 있어요"));
  }

  await prisma.user.create({
    data: {
      email,
      name: therapist!.name,
      passwordHash: await hashPassword(password),
      role: "THERAPIST",
      centerId: me.centerId,
      therapistId,
    },
  });
  revalidatePath("/therapists");
  redirect("/therapists?ok=" + encodeURIComponent(`${therapist!.name} 계정을 만들었어요`));
}

export async function resetTherapistPassword(userId: number, formData: FormData) {
  const me = await requireRole(["OWNER", "ADMIN"]);
  const password = String(formData.get("password") ?? "");
  if (password.length < 6) {
    redirect("/therapists?err=" + encodeURIComponent("비밀번호 6자 이상 필요"));
  }
  await assertUserInCenter(userId, me.centerId);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password) },
  });
  revalidatePath("/therapists");
  redirect("/therapists?ok=" + encodeURIComponent("비밀번호를 변경했어요"));
}

export async function deleteTherapistAccount(userId: number) {
  const me = await requireRole(["OWNER", "ADMIN"]);
  await assertUserInCenter(userId, me.centerId);
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/therapists");
}

// ─── 행정·원장 계정 ────────────────────────────────────────────────────
export async function createAdminAccount(formData: FormData) {
  const current = await requireRole(["OWNER", "ADMIN"]);

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "ADMIN");

  if (!email || !name || password.length < 6) {
    redirect("/therapists?err=" + encodeURIComponent("이름·이메일·비밀번호 필요"));
  }
  if (!["OWNER", "ADMIN"].includes(role)) {
    redirect("/therapists?err=" + encodeURIComponent("역할이 잘못됐어요"));
  }
  // OWNER 역할은 OWNER만 발급 가능
  if (role === "OWNER" && current.role !== "OWNER") {
    redirect("/therapists?err=" + encodeURIComponent("OWNER 역할은 OWNER만 발급할 수 있어요"));
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    redirect("/therapists?err=" + encodeURIComponent("이미 사용 중인 이메일이에요"));
  }
  await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await hashPassword(password),
      role,
      centerId: current.centerId,
    },
  });
  revalidatePath("/therapists");
  redirect("/therapists?ok=" + encodeURIComponent(`${name} 계정을 만들었어요`));
}

export async function toggleAdminActive(userId: number, currentActive: boolean) {
  const me = await requireRole(["OWNER", "ADMIN"]);
  await assertUserInCenter(userId, me.centerId);
  await prisma.user.update({
    where: { id: userId },
    data: { active: !currentActive },
  });
  revalidatePath("/therapists");
}

// ─── 가입 승인 ────────────────────────────────────────────────────────
export async function approveTherapist(userId: number) {
  const me = await requireRole(["OWNER", "ADMIN"]);
  await assertUserInCenter(userId, me.centerId);
  await prisma.user.update({
    where: { id: userId },
    data: { active: true },
  });
  revalidatePath("/therapists");
}

export async function rejectTherapist(userId: number) {
  const me = await requireRole(["OWNER", "ADMIN"]);
  await assertUserInCenter(userId, me.centerId);
  // 거절은 User 만 삭제 (Therapist 레코드는 그대로 — 다시 가입 가능)
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/therapists");
}
