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
import { generateScheduleFromForm } from "@/lib/schedule-fill-spec";
import {
  buildRecordSheets,
  bundleAsZip,
  readRecordTemplate,
  type RecordPayload,
} from "@/lib/record-hwpx";
import { generateRecordFromForm } from "@/lib/record-fill-spec";
import { buildSchedExtra } from "@/lib/record-sched-enrich";
import { isRecordFormKey } from "@/lib/record-forms";

type Params = { params: Promise<{ id: string }> };

const WD = ["일", "월", "화", "수", "목", "금", "토"];

// 한 아동(종결 포함)의 저장된 모든 일정표 + 기록지를 하나의 ZIP 으로.
//   GET /api/children/[id]/docs-bulk
// 생성 로직은 일괄 다운로드 라우트(/api/{schedule,record}/hwpx-bulk)와 동일한 lib 생성기를
// 재사용하되, 한 아동의 전 월(month)을 한 번에 묶는다. active 무관·치료사 소유 기준이라 종결 아동 동작.
export async function GET(_req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const childId = Number(id);
  if (!Number.isInteger(childId)) {
    return Response.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const myTherapistId = await getEffectiveTherapistId(user);
  if (!myTherapistId) {
    return Response.json({ error: "치료사 정보가 없어요" }, { status: 400 });
  }

  // 소유·센터 검증
  const child = await prisma.child.findFirst({
    where: {
      id: childId,
      centerId: user.centerId ?? -1,
      services: { some: { therapistId: myTherapistId } },
    },
    select: { id: true, name: true },
  });
  if (!child) return Response.json({ error: "아동을 찾을 수 없어요" }, { status: 404 });

  const svcIds = (
    await prisma.childService.findMany({
      where: { childId, therapistId: myTherapistId },
      select: { id: true },
    })
  ).map((s) => s.id);

  const [schedules, records] = await Promise.all([
    prisma.schedule.findMany({
      where: { childServiceId: { in: svcIds } },
      include: { sessions: { orderBy: { day: "asc" } }, childService: { include: { child: true } } },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    }),
    prisma.record.findMany({
      where: { childServiceId: { in: svcIds } },
      include: { sessions: { orderBy: { ordinal: "asc" } }, childService: { include: { child: true } } },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    }),
  ]);

  if (schedules.length === 0 && records.length === 0) {
    return Response.json({ error: "저장된 서류가 없어요." }, { status: 404 });
  }

  const files: { name: string; data: Buffer }[] = [];
  const usedNames = new Set<string>();
  const addFile = (base: string, data: Buffer) => {
    let name = `${base}.hwpx`;
    let n = 2;
    while (usedNames.has(name)) {
      name = `${base}_${n}.hwpx`;
      n++;
    }
    usedNames.add(name);
    files.push({ name, data });
  };

  // --- 일정표 ---
  if (schedules.length > 0) {
    const templateBuf = await readScheduleTemplate();
    const formIds = [...new Set(schedules.map((s) => s.formId).filter((v): v is number => !!v))];
    const formMap = new Map<number, { template: Buffer; spec: string }>();
    if (formIds.length > 0) {
      const forms = await prisma.recordForm.findMany({
        where: { id: { in: formIds }, ownerUserId: user.id, kind: "schedule" },
        select: { id: true, template: true, spec: true },
      });
      for (const f of forms) formMap.set(f.id, { template: Buffer.from(f.template), spec: f.spec });
    }
    for (const s of schedules) {
      const y = s.year, m = s.month;
      const sessions = s.sessions.map((sess) => ({
        day: sess.day,
        weekday: WD[new Date(y, m - 1, sess.day).getDay()],
        time: sess.time,
        makeup: sess.makeup,
      }));
      const cycle = [...new Set(sessions.map((x) => new Date(y, m - 1, x.day).getDay()))]
        .sort()
        .map((w) => WD[w])
        .join(" ");
      const dim = new Date(y, m, 0).getDate();
      const monthHolidays: { day: number; name: string }[] = [];
      for (let d = 1; d <= dim; d++) {
        const hn = holiday(y, m, d);
        if (hn) monthHolidays.push({ day: d, name: hn });
      }
      const unitNumber = parseInt((s.costUnit || "").replace(/[^\d]/g, "")) || 0;
      const payload: SchedulePayload = {
        childName: s.childService.child.name,
        childBirth: s.childService.child.birthDate ?? undefined,
        therapist: s.therapist,
        serviceType: s.serviceType,
        year: y,
        month: m,
        mgmtNumber: s.mgmtNumber ?? undefined,
        writeDate: s.writeDate ?? "",
        pvOrg: s.pvOrg,
        pvTel: s.pvTel ?? "",
        pvCharge: s.pvCharge ?? "",
        pvType: s.pvType,
        costUnit: s.costUnit,
        costSelf: s.costSelf,
        costTotal: unitNumber * sessions.length,
        cycle,
        target: s.target,
        sessions,
        holidays: monthHolidays,
      };
      const savedForm = s.formId ? formMap.get(s.formId) : undefined;
      const out = savedForm
        ? generateScheduleFromForm(savedForm.template, savedForm.spec, payload)
        : buildScheduleHwpx(templateBuf, payload);
      addFile(`${y}년${pad(m)}월_일정표`, out);
    }
  }

  // --- 기록지 ---
  if (records.length > 0) {
    const center = user.centerId
      ? await prisma.center.findUnique({ where: { id: user.centerId }, select: { recordForm: true } })
      : null;
    const form = isRecordFormKey(center?.recordForm) ? center!.recordForm : "standard";
    const templateBuf = await readRecordTemplate(form);
    const formIds = [...new Set(records.map((r) => r.formId).filter((v): v is number => !!v))];
    const formMap = new Map<number, { template: Buffer; spec: string }>();
    if (formIds.length > 0) {
      const forms = await prisma.recordForm.findMany({
        where: { id: { in: formIds }, ownerUserId: user.id, kind: "record" },
        select: { id: true, template: true, spec: true },
      });
      for (const f of forms) formMap.set(f.id, { template: Buffer.from(f.template), spec: f.spec });
    }
    const therapist = await prisma.therapist.findUnique({ where: { id: myTherapistId }, select: { name: true } });
    const therapistName = therapist?.name ?? user.name ?? "";

    for (const r of records) {
      const payload: RecordPayload = {
        childName: r.childName,
        childBirth: r.childBirth ?? "",
        org: r.org,
        month: r.month,
        sessions: r.sessions.map((s) => ({
          date: s.date ?? "",
          startTime: s.startTime ?? "",
          endTime: s.endTime ?? "",
          voucher: s.voucher ?? "",
          extra: s.extra ?? "",
          amount: s.amount ?? "",
          useDay: s.useDay ?? "",
          payDay: s.payDay ?? "",
          apprNumber: s.apprNumber ?? "",
          result: s.result ?? "",
          resultExtra: s.resultExtra ?? undefined,
        })),
        opinion: r.opinion ?? undefined,
        serviceType: r.childService.serviceType,
      };
      const savedForm = r.formId ? formMap.get(r.formId) : undefined;
      let sheets: Buffer[];
      if (savedForm) {
        let schedExtra: Record<string, string> | undefined;
        let hasSchedule = false;
        try {
          const sp = JSON.parse(savedForm.spec);
          hasSchedule = Array.isArray(sp?.schedule) && sp.schedule.length > 0;
        } catch {}
        if (hasSchedule) {
          schedExtra = await buildSchedExtra({
            user,
            childServiceId: r.childServiceId,
            year: r.year,
            month: r.month,
            sessionDates: payload.sessions.map((s) => s.date ?? ""),
          });
        }
        sheets = generateRecordFromForm(savedForm.template, savedForm.spec, payload, therapistName, schedExtra, r.year);
      } else {
        sheets = buildRecordSheets(templateBuf, payload, form);
      }
      const base = `${r.year}년${pad(r.month)}월_기록지`;
      if (sheets.length === 1) {
        addFile(base, sheets[0]);
      } else {
        sheets.forEach((data, idx) => addFile(`${base}_${idx + 1}`, data));
      }
    }
  }

  const zipBuf = bundleAsZip(files);
  const zipName = encodeURIComponent(`${safeFileName(child.name) || "아동"}_전체서류_${files.length}건.zip`);
  return new Response(new Uint8Array(zipBuf), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${zipName}`,
    },
  });
}
