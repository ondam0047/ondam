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
  const serviceType = String(formData.get("serviceTypes") ?? "").trim();
  if (!name) {
    redirect("/center?err=" + encodeURIComponent("이름은 비울 수 없어요"));
  }
  if (!serviceType) {
    redirect("/center?err=" + encodeURIComponent("주력 치료 영역을 선택해주세요"));
  }
  await prisma.center.update({
    where: { id: me.centerId! },
    data: {
      name,
      address: address || null,
      phone: phone || null,
      serviceTypes: serviceType,
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
