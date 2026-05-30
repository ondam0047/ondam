import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, getEffectiveTherapistId } from "@/lib/auth";
import { holiday, pad } from "@/lib/constants";
import {
  buildScheduleHwpx,
  readScheduleTemplate,
  safeFileName,
  type SchedulePayload,
} from "@/lib/schedule-hwpx";
import { bundleAsZip } from "@/lib/record-hwpx";

// 한 사용자의 (연·월) 저장된 모든 일정표를 한 번에 .hwpx 생성 → ZIP 으로.
//   GET /api/schedule/hwpx-bulk?year=2026&month=2
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const year = Number(req.nextUrl.searchParams.get("year"));
  const month = Number(req.nextUrl.searchParams.get("month"));
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return Response.json({ error: "year/month required" }, { status: 400 });
  }

  const myTherapistId = await getEffectiveTherapistId(user);
  if (!myTherapistId) {
    return Response.json({ error: "치료사 정보가 없어요" }, { status: 400 });
  }

  const schedules = await prisma.schedule.findMany({
    where: {
      year,
      month,
      childService: {
        therapistId: myTherapistId,
        // 지투는 양식 준비 중 — 일괄 출력에서 자동 제외 (단일 다운로드도 막혀 있음)
        programType: "DEVREHAB",
        child: { centerId: user.centerId ?? -1 },
      },
    },
    include: {
      sessions: { orderBy: { day: "asc" } },
      childService: { include: { child: true } },
    },
    orderBy: [{ childService: { child: { name: "asc" } } }],
  });

  if (schedules.length === 0) {
    return Response.json({ error: `${year}년 ${month}월 발달바우처로 저장된 일정표가 없어요.` }, { status: 404 });
  }

  let templateBuf: Buffer;
  try {
    templateBuf = await readScheduleTemplate();
  } catch {
    return Response.json({ error: "템플릿 파일을 찾을 수 없어요." }, { status: 500 });
  }

  // 이 달 공휴일 자동 수집
  const dim = new Date(year, month, 0).getDate();
  const monthHolidays: { day: number; name: string }[] = [];
  for (let d = 1; d <= dim; d++) {
    const hn = holiday(year, month, d);
    if (hn) monthHolidays.push({ day: d, name: hn });
  }

  // 각 일정 → HWPX 생성
  const files: { name: string; data: Buffer }[] = [];
  const usedNames = new Set<string>();
  for (const s of schedules) {
    const child = s.childService.child;
    const sessions = s.sessions.map((sess) => ({
      day: sess.day,
      weekday: ["일", "월", "화", "수", "목", "금", "토"][new Date(year, month - 1, sess.day).getDay()],
      time: sess.time,
      makeup: sess.makeup,
    }));
    const cycle = [...new Set(sessions.map((x) => new Date(year, month - 1, x.day).getDay()))]
      .sort()
      .map((w) => ["일", "월", "화", "수", "목", "금", "토"][w])
      .join(" ");
    const unitNumber = parseInt((s.costUnit || "").replace(/[^\d]/g, "")) || 0;
    const costTotal = unitNumber * sessions.length;

    const payload: SchedulePayload = {
      childName: child.name,
      childBirth: child.birthDate ?? undefined,
      therapist: s.therapist,
      serviceType: s.serviceType,
      year,
      month,
      mgmtNumber: s.mgmtNumber ?? undefined,
      writeDate: s.writeDate ?? "",
      pvOrg: s.pvOrg,
      pvTel: s.pvTel ?? "",
      pvCharge: s.pvCharge ?? "",
      pvType: s.pvType,
      costUnit: s.costUnit,
      costSelf: s.costSelf,
      costTotal,
      cycle,
      target: s.target,
      sessions,
      holidays: monthHolidays,
    };

    const out = buildScheduleHwpx(templateBuf, payload);
    let baseName = `${safeFileName(child.name)}_${year}년${pad(month)}월_일정표`;
    // 동명이인 — 뒤에 _2, _3 같이
    let name = `${baseName}.hwpx`;
    let n = 2;
    while (usedNames.has(name)) {
      name = `${baseName}_${n}.hwpx`;
      n++;
    }
    usedNames.add(name);
    files.push({ name, data: out });
  }

  const zipBuf = bundleAsZip(files);
  const zipName = encodeURIComponent(`${year}년${pad(month)}월_일정표_모음_${files.length}건.zip`);
  return new Response(new Uint8Array(zipBuf), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${zipName}`,
    },
  });
}
