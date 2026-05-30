"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole, generateApprovalCode } from "@/lib/auth";

export async function updateCenter(formData: FormData) {
  const me = await requireRole(["OWNER", "ADMIN"]);
  if (!me.centerId) {
    redirect("/center?err=" + encodeURIComponent("센터 정보가 없어요"));
  }
  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const serviceTypesRaw = String(formData.get("serviceTypes") ?? "").trim();
  const slotsRaw = String(formData.get("slots") ?? "").trim();
  if (!name) {
    redirect("/center?err=" + encodeURIComponent("이름은 비울 수 없어요"));
  }
  const services = serviceTypesRaw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (services.length === 0) {
    redirect("/center?err=" + encodeURIComponent("치료 영역은 최소 1개 이상 필요해요"));
  }
  const slots = slotsRaw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (slots.length === 0) {
    redirect("/center?err=" + encodeURIComponent("치료 시간대는 최소 1개 이상 필요해요"));
  }
  // 시간대 형식 검증 — HH:MM~HH:MM
  for (const s of slots) {
    if (!/^\d{1,2}:\d{2}~\d{1,2}:\d{2}$/.test(s)) {
      redirect("/center?err=" + encodeURIComponent(`시간대 형식이 잘못됐어요: '${s}' (예: 09:00~09:50)`));
    }
  }
  await prisma.center.update({
    where: { id: me.centerId! },
    data: {
      name,
      address: address || null,
      phone: phone || null,
      serviceTypes: services.join(","),
      slots: slots.join(","),
    },
  });
  revalidatePath("/center");
  revalidatePath("/dashboard");
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
