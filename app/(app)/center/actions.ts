"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole, generateApprovalCode } from "@/lib/auth";
import { THERAPIST_TYPES } from "@/lib/constants";

export async function updateCenter(formData: FormData) {
  const me = await requireRole(["OWNER", "ADMIN"]);
  if (!me.centerId) {
    redirect("/center?err=" + encodeURIComponent("센터 정보가 없어요"));
  }
  const userName = String(formData.get("userName") ?? "").trim();
  const therapistType = String(formData.get("therapistType") ?? "").trim();
  const centerName = String(formData.get("centerName") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const serviceType = String(formData.get("serviceTypes") ?? "").trim();
  const slotsRaw = String(formData.get("slots") ?? "").trim();
  const defaultUnit = Number(formData.get("defaultUnit") ?? 60000) || 60000;
  if (!userName) {
    redirect("/center?err=" + encodeURIComponent("내 이름은 비울 수 없어요"));
  }
  if (!therapistType || !THERAPIST_TYPES.includes(therapistType as typeof THERAPIST_TYPES[number])) {
    redirect("/center?err=" + encodeURIComponent("치료사 종류를 다시 선택해주세요"));
  }
  if (!serviceType) {
    redirect("/center?err=" + encodeURIComponent("주력 치료 영역을 선택해주세요"));
  }
  const slots = slotsRaw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (slots.length === 0) {
    redirect("/center?err=" + encodeURIComponent("회기 시간대를 1개 이상 입력해주세요"));
  }
  for (const s of slots) {
    if (!/^\d{1,2}:\d{2}~\d{1,2}:\d{2}$/.test(s)) {
      redirect("/center?err=" + encodeURIComponent(`시간대 형식이 잘못됐어요: '${s}' (예 09:00~09:50)`));
    }
  }
  await prisma.$transaction(async (tx) => {
    await tx.center.update({
      where: { id: me.centerId! },
      data: {
        name: centerName,
        address: address || null,
        phone: phone || null,
        serviceTypes: serviceType,
        slots: slots.join(","),
        defaultUnit,
      },
    });
    await tx.user.update({
      where: { id: me.id },
      data: { name: userName, therapistType },
    });
    // 본인 Therapist 레코드 이름도 동기화 (일정표·기록지 자동 채움에 반영)
    if (me.therapistId) {
      await tx.therapist.update({
        where: { id: me.therapistId },
        data: { name: userName },
      });
    }
  });
  revalidatePath("/center");
  revalidatePath("/dashboard");
  revalidatePath("/schedule");
  revalidatePath("/record");
  redirect("/center?ok=" + encodeURIComponent("내 정보를 저장했어요"));
}

export async function regenerateCode() {
  const me = await requireRole(["OWNER", "ADMIN"]);
  if (!me.centerId) return;
  const newCode = await generateApprovalCode();
  await prisma.center.update({
    where: { id: me.centerId },
    data: { approvalCode: newCode },
  });
  revalidatePath("/center");
  revalidatePath("/therapists");
  redirect("/center?ok=" + encodeURIComponent(`새 승인코드: ${newCode} — 치료사들에게 다시 알려주세요`));
}
