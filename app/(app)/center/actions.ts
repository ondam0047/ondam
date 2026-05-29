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
  if (!name) {
    redirect("/center?err=" + encodeURIComponent("센터명은 비울 수 없어요"));
  }
  // 콤마 또는 줄바꿈 모두 허용
  const services = serviceTypesRaw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (services.length === 0) {
    redirect("/center?err=" + encodeURIComponent("치료 영역은 최소 1개 이상 필요해요"));
  }
  await prisma.center.update({
    where: { id: me.centerId! },
    data: {
      name,
      address: address || null,
      phone: phone || null,
      serviceTypes: services.join(","),
    },
  });
  revalidatePath("/center");
  revalidatePath("/therapists");
  revalidatePath("/dashboard");
  redirect("/center?ok=" + encodeURIComponent("센터 정보를 저장했어요"));
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
