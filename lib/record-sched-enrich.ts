// 통합 양식(일정표+기록지 한 장, 예: 성심) 출력 시 서버에서 일정표 라벨 데이터 보강.
// 기록지 탭에서는 회기 데이터만 입력하므로, 단가·본인부담·관리번호·제공일·횟수 등은
// 저장된 Schedule(있으면) 또는 ChildService 기본값에서 끌어와 역할→값 맵으로 만든다.

import { prisma } from "@/lib/db";
import { canAccessService } from "@/lib/auth";
import type { SessionUser } from "@/lib/auth";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const won = (n: number) => (Number(n) || 0).toLocaleString("ko-KR");

// 해당 월 회기 날짜들("M/D")로부터 제공 요일(중복 제거, 요일순)을 만든다.
function weekdaysFromDates(year: number, dates: string[]): string[] {
  const idx = new Set<number>();
  for (const d of dates) {
    const m = /(\d+)\s*[/.\-]\s*(\d+)/.exec(d || "");
    if (!m) continue;
    const dt = new Date(year, Number(m[1]) - 1, Number(m[2]));
    if (!isNaN(dt.getTime())) idx.add(dt.getDay());
  }
  return [...idx].sort((a, b) => a - b).map((i) => WEEK[i]);
}

// 통합 양식 일정표 라벨 보강값(역할→값). 권한 없거나 자료 없으면 부분/빈 맵.
export async function buildSchedExtra(opts: {
  user: SessionUser;
  childServiceId?: number;
  year?: number;
  month: number;
  sessionDates: string[]; // 기록지 회기 날짜("M/D") — 제공일/횟수 폴백용
}): Promise<Record<string, string>> {
  const { user, childServiceId, year, month, sessionDates } = opts;
  if (!childServiceId || !Number.isInteger(childServiceId)) return {};

  const cs = await prisma.childService.findUnique({
    where: { id: Number(childServiceId) },
    include: { child: true },
  });
  if (!cs) return {};
  if (cs.child.centerId !== user.centerId || !canAccessService(user, cs)) return {};

  const out: Record<string, string> = {};
  const yr = year ?? new Date().getFullYear();

  // 1) 저장된 일정표(Schedule)가 있으면 우선 사용 — 가장 정확.
  const sched = await prisma.schedule.findUnique({
    where: { childServiceId_year_month: { childServiceId: Number(childServiceId), year: yr, month } },
    include: { sessions: { orderBy: { day: "asc" } } },
  });

  if (sched) {
    const wds = [...new Set(sched.sessions.map((s) => WEEK[new Date(yr, month - 1, s.day).getDay()]))];
    const cnt = sched.sessions.length || sched.target || 0;
    if (sched.mgmtNumber || cs.child.mgmtNumber) out.관리번호 = sched.mgmtNumber || cs.child.mgmtNumber || "";
    if (sched.pvOrg) { out.제공자 = sched.pvOrg; out.제공자명 = sched.pvOrg; }
    if (sched.pvTel) out.전화 = sched.pvTel;
    if (sched.pvCharge) out.담당 = sched.pvCharge;
    if (sched.costUnit) out.단가 = sched.costUnit;
    if (sched.costSelf) out.본인부담금 = sched.costSelf;
    if (cnt) out.횟수 = String(cnt);
    if (wds.length) { out.제공일 = wds.join("·"); out.주기 = `주 ${wds.length}회`; }
    const unitNum = Number(String(sched.costUnit ?? "").replace(/[^0-9]/g, "")) || cs.defaultUnit;
    if (unitNum && cnt) out.총금액 = won(unitNum * cnt);
    return out;
  }

  // 2) 폴백 — ChildService 기본값 + 회기 날짜로부터 제공일/횟수.
  const cnt = sessionDates.filter(Boolean).length || cs.defaultTarget || 0;
  const wds = weekdaysFromDates(yr, sessionDates);
  if (cs.child.mgmtNumber) out.관리번호 = cs.child.mgmtNumber;
  if (cs.org) { out.제공자 = cs.org; out.제공자명 = cs.org; }
  if (cs.defaultUnit) out.단가 = won(cs.defaultUnit);
  if (cs.monthlyCopay != null) out.본인부담금 = won(cs.monthlyCopay);
  if (cnt) out.횟수 = String(cnt);
  if (wds.length) { out.제공일 = wds.join("·"); out.주기 = `주 ${wds.length}회`; }
  if (cs.defaultUnit && cnt) out.총금액 = won(cs.defaultUnit * cnt);
  return out;
}
