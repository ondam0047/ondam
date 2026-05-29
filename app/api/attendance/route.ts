import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { WEEK, minusMin } from "@/lib/constants";

// 한 달치 회기를 출석부 형식 .xlsx 로 출력
// 치료사 본인은 본인 것만, 원장·행정은 ?therapistId= 지정해서 누구든 조회

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const year = Number(req.nextUrl.searchParams.get("year"));
  const month = Number(req.nextUrl.searchParams.get("month"));
  const requestedTherapistId = Number(req.nextUrl.searchParams.get("therapistId")) || null;
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return Response.json({ error: "year/month required" }, { status: 400 });
  }

  // 권한: 치료사는 본인만, 관리자는 아무나
  let therapistId: number;
  if (isAdmin(user)) {
    therapistId = requestedTherapistId ?? (user.therapistId ?? -1);
  } else {
    therapistId = user.therapistId ?? -1;
  }
  const therapist = await prisma.therapist.findUnique({ where: { id: therapistId } });
  if (!therapist || therapist.centerId !== user.centerId) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  // 이 치료사의 이번 달 일정 + 회기들
  const schedules = await prisma.schedule.findMany({
    where: {
      year,
      month,
      childService: { therapistId, child: { centerId: user.centerId ?? -1 } },
    },
    include: {
      sessions: { orderBy: { day: "asc" } },
      childService: { include: { child: true } },
    },
  });

  type Row = {
    seq: number;
    date: string;
    weekday: string;
    childName: string;
    startTime: string;
    endTime: string;
    duration: number;
    makeup: string;
  };
  const rows: Row[] = [];
  const all: { day: number; time: string; makeup: boolean; childName: string }[] = [];
  for (const sch of schedules) {
    for (const s of sch.sessions) {
      all.push({ day: s.day, time: s.time, makeup: s.makeup, childName: sch.childService.child.name });
    }
  }
  all.sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));

  for (let i = 0; i < all.length; i++) {
    const a = all[i];
    const d = new Date(year, month - 1, a.day);
    const [start, end] = a.time.split("~");
    let duration = 0;
    if (/^\d\d:\d\d$/.test(start) && /^\d\d:\d\d$/.test(end)) {
      const [sh, sm] = start.split(":").map(Number);
      const [eh, em] = end.split(":").map(Number);
      duration = (eh * 60 + em) - (sh * 60 + sm);
      if (duration < 0) duration += 24 * 60;
    }
    rows.push({
      seq: i + 1,
      date: `${year}-${String(month).padStart(2, "0")}-${String(a.day).padStart(2, "0")}`,
      weekday: WEEK[d.getDay()],
      childName: a.childName,
      startTime: start,
      endTime: end,
      duration,
      makeup: a.makeup ? "보강" : "",
    });
  }

  // 엑셀 sheet 생성
  const header = [
    "회기 출석부",
    "",
  ];
  const meta = [
    [`치료사`, therapist.name],
    [`연·월`, `${year}년 ${month}월`],
    [`총 회기`, `${rows.length}회`],
    [`총 시간`, `${rows.reduce((s, r) => s + r.duration, 0)}분 (${Math.round(rows.reduce((s, r) => s + r.duration, 0) / 60 * 10) / 10}시간)`],
  ];
  const ws_data: (string | number)[][] = [
    [header[0]],
    [],
    ...meta,
    [],
    ["회차", "날짜", "요일", "아동", "시작시간", "종료시간", "소요(분)", "비고"],
    ...rows.map((r) => [r.seq, r.date, r.weekday, r.childName, r.startTime, r.endTime, r.duration, r.makeup]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(ws_data);
  ws["!cols"] = [
    { wch: 6 }, { wch: 12 }, { wch: 6 }, { wch: 14 },
    { wch: 10 }, { wch: 10 }, { wch: 9 }, { wch: 10 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${month}월 출석부`);

  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = encodeURIComponent(
    `${therapist.name}_${year}년${String(month).padStart(2, "0")}월_출석부.xlsx`
  );

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
