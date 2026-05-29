"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export async function addBlock(formData: FormData) {
  const user = await requireUser();
  if (!user.therapistId) {
    redirect("/availability?err=" + encodeURIComponent("치료사 계정만 시간을 차단할 수 있어요"));
  }
  const dayOfWeek = Number(formData.get("dayOfWeek"));
  const slot = String(formData.get("slot") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    redirect("/availability?err=" + encodeURIComponent("요일이 잘못됐어요"));
  }
  const slotMatch = slot.match(/^(\d\d:\d\d)~(\d\d:\d\d)$/);
  if (!slotMatch) {
    redirect("/availability?err=" + encodeURIComponent("치료 시간대를 선택해주세요"));
  }
  const startTime = slotMatch![1];
  const endTime = slotMatch![2];
  await prisma.therapistBlock.create({
    data: {
      therapistId: user.therapistId,
      dayOfWeek,
      startTime,
      endTime,
      reason: reason || null,
    },
  });
  revalidatePath("/availability");
  revalidatePath("/timetable");
}

export async function deleteBlock(id: number) {
  const user = await requireUser();
  const block = await prisma.therapistBlock.findUnique({ where: { id } });
  if (!block) return;
  // 본인의 차단만 삭제 가능
  if (user.therapistId !== block.therapistId) return;
  await prisma.therapistBlock.delete({ where: { id } });
  revalidatePath("/availability");
  revalidatePath("/timetable");
}
