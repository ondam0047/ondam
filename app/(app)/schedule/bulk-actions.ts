"use server";

import { prisma } from "@/lib/db";
import { requireRole, getEffectiveTherapistId } from "@/lib/auth";
import { holiday, parseDaySlots, pad } from "@/lib/constants";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

// 작성일 기본값 = 전월 말일 (단건 생성과 동일: "YY.MM.DD")
function writeDateFor(y: number, m: number): string {
  const p = new Date(y, m - 1, 0);
  return `${String(p.getFullYear()).slice(2)}.${pad(p.getMonth() + 1)}.${pad(p.getDate())}`;
}

// 담당 아동 전체의 해당 월 일정표를, 각 아동의 기본 반복요일·시간대로 일괄 생성·저장.
export async function bulkGenerateSchedules(formData: FormData) {
  const user = await requireRole(["OWNER", "THERAPIST"]);
  const ym = String(formData.get("ym") ?? "");
  const overwrite = formData.get("overwrite") === "on";
  const [y, m] = ym.split("-").map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
    redirect("/schedule?berr=" + encodeURIComponent("월 선택이 잘못됐어요"));
  }

  const centerId = user.centerId ?? -1;
  const myTherapistId = await getEffectiveTherapistId(user);

  const services = await prisma.childService.findMany({
    where: { active: true, therapistId: myTherapistId ?? -1, child: { active: true, centerId } },
    include: { child: true },
  });

  const dim = new Date(y, m, 0).getDate();
  const wd = writeDateFor(y, m);
  let created = 0, updated = 0, skippedExisting = 0, noPattern = 0, noSlot = 0;

  for (const cs of services) {
    const days = (cs.defaultDays ?? "").split(",").filter(Boolean).map(Number);
    if (days.length === 0) { noPattern++; continue; }

    const dmap = parseDaySlots(cs.daySlots);
    const base = cs.defaultSlot ?? "";
    const sessions: { day: number; time: string; makeup: boolean }[] = [];
    for (let d = 1; d <= dim; d++) {
      const w = new Date(y, m - 1, d).getDay();
      if (days.includes(w) && !holiday(y, m, d)) {
        const time = dmap[w] || base;
        if (!time) continue; // 시간대 없는 요일은 제외
        sessions.push({ day: d, time, makeup: false });
      }
    }
    if (sessions.length === 0) { noSlot++; continue; } // 반복요일은 있으나 시간대 미설정

    const existing = await prisma.schedule.findUnique({
      where: { childServiceId_year_month: { childServiceId: cs.id, year: y, month: m } },
    });
    if (existing && !overwrite) { skippedExisting++; continue; }

    const meta = {
      therapist: user.name,
      serviceType: cs.serviceType,
      target: cs.defaultTarget,
      mgmtNumber: cs.child.mgmtNumber || null,
      pvOrg: user.centerName ?? "",
      pvTel: null,
      pvCharge: user.name,
      pvType: cs.serviceType,
      costUnit: (cs.defaultUnit ?? 0).toLocaleString("ko-KR"),
      costSelf: cs.monthlyCopay != null ? cs.monthlyCopay.toLocaleString("ko-KR") : "0",
      writeDate: wd,
    };

    if (existing) {
      await prisma.schedule.update({ where: { id: existing.id }, data: meta });
      await prisma.scheduleSession.deleteMany({ where: { scheduleId: existing.id } });
      await prisma.scheduleSession.createMany({ data: sessions.map((s) => ({ scheduleId: existing.id, ...s })) });
      updated++;
    } else {
      const sch = await prisma.schedule.create({
        data: { childServiceId: cs.id, year: y, month: m, ...meta, createdById: user.id },
      });
      await prisma.scheduleSession.createMany({ data: sessions.map((s) => ({ scheduleId: sch.id, ...s })) });
      created++;
    }
  }

  revalidatePath("/schedule");
  const parts = [`${y}년 ${m}월 일괄 생성 완료 — 새로 ${created}건`];
  if (updated) parts.push(`갱신 ${updated}건`);
  if (skippedExisting) parts.push(`기존 유지 ${skippedExisting}건`);
  if (noPattern) parts.push(`반복요일 미설정 ${noPattern}건`);
  if (noSlot) parts.push(`시간대 미설정 ${noSlot}건`);
  redirect("/schedule?bulk=" + encodeURIComponent(parts.join(" · ")));
}
