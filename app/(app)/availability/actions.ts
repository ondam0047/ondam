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
  const startTime = String(formData.get("startTime") ?? "").trim();
  const endTime = String(formData.get("endTime") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    redirect("/availability?err=" + encodeURIComponent("요일이 잘못됐어요"));
  }
  if (!/^\d\d:\d\d$/.test(startTime) || !/^\d\d:\d\d$/.test(endTime)) {
    redirect("/availability?err=" + encodeURIComponent("시작·종료 시간은 HH:MM 형식이어야 해요"));
  }
  if (startTime >= endTime) {
    redirect("/availability?err=" + encodeURIComponent("종료 시간은 시작 시간보다 늦어야 해요"));
  }
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
