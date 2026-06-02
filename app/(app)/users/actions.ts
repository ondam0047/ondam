"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hashPassword, requireRole } from "@/lib/auth";

export async function createUser(formData: FormData) {
  const me = await requireRole(["OWNER", "ADMIN"]);

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "THERAPIST");
  const therapistIdRaw = String(formData.get("therapistId") ?? "");
  const therapistId = therapistIdRaw ? Number(therapistIdRaw) : null;

  if (!email || !name || password.length < 6) {
    redirect("/users?err=" + encodeURIComponent("이메일·이름·비밀번호(6자 이상)를 모두 입력해주세요"));
  }
  if (!["OWNER", "ADMIN", "THERAPIST"].includes(role)) {
    redirect("/users?err=" + encodeURIComponent("역할이 잘못됐어요"));
  }
  // OWNER 권한 부여는 OWNER 본인만 가능 (ADMIN 이 OWNER 계정을 만들 수 없게)
  if (role === "OWNER" && me.role !== "OWNER") {
    redirect("/users?err=" + encodeURIComponent("권한이 없어요"));
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    redirect("/users?err=" + encodeURIComponent("이미 사용 중인 이메일이에요"));
  }

  await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await hashPassword(password),
      role,
      centerId: me.centerId,
      therapistId: role === "THERAPIST" ? therapistId : null,
    },
  });
  revalidatePath("/users");
  redirect("/users?ok=" + encodeURIComponent(`${name} 계정을 만들었어요`));
}

// 대상 사용자가 내 센터 소속인지 확인 (교차-센터 IDOR 방지)
async function assertSameCenter(userId: number, centerId: number | null): Promise<void> {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { centerId: true },
  });
  if (!target || target.centerId !== centerId) {
    redirect("/users?err=" + encodeURIComponent("대상을 찾을 수 없어요"));
  }
}

export async function resetPassword(userId: number, formData: FormData) {
  const me = await requireRole(["OWNER", "ADMIN"]);
  const password = String(formData.get("password") ?? "");
  if (password.length < 6) {
    redirect("/users?err=" + encodeURIComponent("비밀번호 6자 이상 필요"));
  }
  await assertSameCenter(userId, me.centerId);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password) },
  });
  revalidatePath("/users");
  redirect("/users?ok=" + encodeURIComponent("비밀번호를 변경했어요"));
}

export async function toggleActive(userId: number, currentActive: boolean) {
  const me = await requireRole(["OWNER", "ADMIN"]);
  await assertSameCenter(userId, me.centerId);
  await prisma.user.update({
    where: { id: userId },
    data: { active: !currentActive },
  });
  revalidatePath("/users");
}

export async function deleteUser(userId: number) {
  const me = await requireRole(["OWNER", "ADMIN"]);
  await assertSameCenter(userId, me.centerId);
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/users");
}
