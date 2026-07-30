"use server";

import { prisma } from "@/lib/db";
import { requireRole, getEffectiveTherapistId } from "@/lib/auth";
import { holiday, parseDaySlots, pad } from "@/lib/constants";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
// "use server" 파일은 async 함수 외에는 export 할 수 없다(상수를 export 하면 모듈 전체가
// 서버 액션으로 인식되지 않아 빌드가 깨진다) → 쿠키 이름은 lib/constants 에 둔다.
import { BULK_FAIL_COOKIE } from "@/lib/constants";

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
  // 저장하지 못한 아동 — 서버 액션이라 실패가 화면에 드러나지 않으면 '조용히 일부만 처리'가 된다.
  const failed: string[] = [];

  for (const cs of services) {
    const days = (cs.defaultDays ?? "").split(",").filter(Boolean).map(Number);
    if (days.length === 0) { noPattern++; continue; }

    const dmap = parseDaySlots(cs.daySlots);
    const base = cs.defaultSlot ?? "";
    const limit = cs.defaultTarget > 0 ? cs.defaultTarget : Infinity; // 목표 회기 수만큼만
    const sessions: { day: number; time: string; makeup: boolean }[] = [];
    for (let d = 1; d <= dim; d++) {
      const w = new Date(y, m - 1, d).getDay();
      if (days.includes(w) && !holiday(y, m, d)) {
        const time = dmap[w] || base;
        if (!time) continue; // 시간대 없는 요일은 제외
        sessions.push({ day: d, time, makeup: false });
        if (sessions.length >= limit) break;
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

    // ⚠ 아동 '한 명당' 하나의 트랜잭션. 덮어쓰기는 '지우고 다시 넣기'라 트랜잭션이 없으면
    //   중간 실패 시 그 아동의 한 달치 일정이 0건으로 남는다(단건 저장 /api/schedule/save 와 같은 이유).
    //   전체를 하나로 묶지 않는 이유: ①아동 한 명의 실패로 나머지 수십 명까지 되돌리면 피해가 커진다
    //   ②$transaction 기본 제한시간 5초 안에 아동 수만큼(수십 명 × 3문장) 끝낸다는 보장이 없다.
    //   실패한 아동은 옛 일정표를 그대로 둔 채 아래에서 이름으로 알린다.
    try {
      if (existing) {
        await prisma.$transaction(async (tx) => {
          await tx.schedule.update({ where: { id: existing.id }, data: meta });
          await tx.scheduleSession.deleteMany({ where: { scheduleId: existing.id } });
          await tx.scheduleSession.createMany({ data: sessions.map((s) => ({ scheduleId: existing.id, ...s })) });
        });
        updated++;
      } else {
        await prisma.$transaction(async (tx) => {
          const sch = await tx.schedule.create({
            data: { childServiceId: cs.id, year: y, month: m, ...meta, createdById: user.id },
          });
          await tx.scheduleSession.createMany({ data: sessions.map((s) => ({ scheduleId: sch.id, ...s })) });
        });
        created++;
      }
    } catch {
      // 한 명이 실패해도 나머지 아동은 계속 처리한다(성공한 것까지 버리지 않는다).
      failed.push(cs.child.name);
    }
  }

  revalidatePath("/schedule");
  const parts = [`${y}년 ${m}월 일괄 생성 완료 — 새로 ${created}건`];
  if (updated) parts.push(`갱신 ${updated}건`);
  if (skippedExisting) parts.push(`기존 유지 ${skippedExisting}건`);
  if (noPattern) parts.push(`반복요일 미설정 ${noPattern}건`);
  if (noSlot) parts.push(`시간대 미설정 ${noSlot}건`);

  // 부분 실패는 반드시 화면에 띄운다 — 성공 요약만 보이면 '전부 됐구나' 하고 넘어간다.
  // 단 URL 에는 '몇 명'만 넣는다(개인정보 없음). 아동 이름은 30초짜리 쿠키로만 전달하고
  // 화면에서 합쳐 보여준다 → 쿠키가 없거나 만료돼도 '일부 실패' 사실과 건수는 남고
  // 이름만 빠진다(실패 자체가 사라지지 않는다).
  const qs = new URLSearchParams({ bulk: parts.join(" · ") });
  if (failed.length > 0) {
    qs.set("bfail", String(failed.length));
    const jar = await cookies();
    jar.set(BULK_FAIL_COOKIE, JSON.stringify(failed.slice(0, 5)), {
      httpOnly: true, // 서버 컴포넌트에서만 읽는다(세션 쿠키와 같은 관례)
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/schedule", // 이 화면 밖으로는 전송되지 않게
      maxAge: 30, // 읽고 나면 곧 스스로 만료
    });
  }
  redirect("/schedule?" + qs.toString());
}
