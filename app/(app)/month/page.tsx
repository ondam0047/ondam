import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRole, getEffectiveTherapistId } from "@/lib/auth";

export const dynamic = "force-dynamic";

// "이번 달" 워크스페이스 — 월을 고르면 그 달 전 아동의 일정·기록지 상태를 한눈에 보고
// 바로 작성/다운로드. 월말 마감을 메뉴 넘나들지 않고 한 화면에서.
export default async function MonthPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const user = await requireRole(["OWNER", "THERAPIST"]);
  const sp = await searchParams;
  const centerId = user.centerId ?? -1;
  const tid = await getEffectiveTherapistId(user);

  const now = new Date();
  const year = sp.year ? Number(sp.year) : now.getFullYear();
  const month = sp.month ? Number(sp.month) : now.getMonth() + 1;
  const isThisMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  // 내 담당 아동(서비스) + 해당 월 일정/기록지
  const [services, schedules, records] = await Promise.all([
    prisma.childService.findMany({
      where: { active: true, therapistId: tid ?? -1, child: { active: true, centerId } },
      include: { child: true },
      orderBy: [{ child: { name: "asc" } }, { id: "asc" }],
    }),
    prisma.schedule.findMany({
      where: { year, month, childService: { therapistId: tid ?? -1, child: { centerId } } },
      select: { childServiceId: true, _count: { select: { sessions: true } } },
    }),
    prisma.record.findMany({
      where: { year, month, childService: { therapistId: tid ?? -1, child: { centerId } } },
      select: { childServiceId: true, _count: { select: { sessions: true } } },
    }),
  ]);

  const schedMap = new Map(schedules.map((s) => [s.childServiceId, s._count.sessions]));
  const recMap = new Map(records.map((r) => [r.childServiceId, r._count.sessions]));

  const schedDone = services.filter((s) => schedMap.has(s.id)).length;
  const recDone = services.filter((s) => recMap.has(s.id)).length;

  // 월 이동
  const shift = (delta: number) => {
    const t = year * 12 + (month - 1) + delta;
    return `?year=${Math.floor(t / 12)}&month=${(t % 12) + 1}`;
  };

  const Badge = ({ ok, text }: { ok: boolean; text: string }) => (
    <span className="badge" style={{
      fontSize: 12, padding: "3px 9px", borderColor: "transparent",
      background: ok ? "#DDEBD3" : "#F6E4DE", color: ok ? "#3F6132" : "#8A2F1C",
    }}>{text}</span>
  );

  return (
    <>
      <div className="section-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link className="btn btn-sm" href={shift(-1)}>◀</Link>
          <h2 style={{ margin: 0 }}>{year}년 {month}월{isThisMonth ? " (이번 달)" : ""}</h2>
          <Link className="btn btn-sm" href={shift(1)}>▶</Link>
          {!isThisMonth && <Link className="btn btn-sm" href="/month">이번 달로</Link>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a className="btn" href={`/api/schedule/hwpx-bulk?year=${year}&month=${month}`}>전체 일정 ZIP</a>
          <a className="btn" href={`/api/record/hwpx-bulk?year=${year}&month=${month}`}>전체 기록지 ZIP</a>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-body sub-mute" style={{ fontSize: 13 }}>
          담당 아동 <b style={{ color: "var(--text)" }}>{services.length}명</b> · 일정 작성 <b style={{ color: "var(--text)" }}>{schedDone}</b> · 기록지 작성 <b style={{ color: "var(--text)" }}>{recDone}</b>
          {" — "}이 달의 일정·기록지를 한 화면에서 확인하고 바로 작성·다운로드하세요.
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0, overflowX: "auto" }}>
          {services.length === 0 ? (
            <div className="sub-mute" style={{ padding: 20, fontSize: 14 }}>
              담당 아동이 없어요. <Link href="/children/new" style={{ color: "var(--primary)", fontWeight: 700 }}>아동 등록</Link>으로 시작하세요.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--surface-2)", textAlign: "left" }}>
                  <th style={{ padding: "10px 14px", fontSize: 12, fontWeight: 700 }}>아동</th>
                  <th style={{ padding: "10px 14px", fontSize: 12, fontWeight: 700 }}>일정</th>
                  <th style={{ padding: "10px 14px", fontSize: 12, fontWeight: 700 }}>기록지</th>
                  <th style={{ padding: "10px 14px", fontSize: 12, fontWeight: 700, textAlign: "right" }}>작성</th>
                </tr>
              </thead>
              <tbody>
                {services.map((s) => {
                  const sc = schedMap.get(s.id);
                  const rc = recMap.get(s.id);
                  return (
                    <tr key={s.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 14px", fontSize: 14, fontWeight: 600 }}>
                        {s.child.name}
                        <span className="sub-mute" style={{ fontSize: 11, marginLeft: 6 }}>{s.serviceType}</span>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {sc != null ? <Badge ok text={`✓ ${sc}회`} /> : <Badge ok={false} text="미생성" />}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {rc != null ? <Badge ok text={`✓ ${rc}회`} /> : <Badge ok={false} text="미작성" />}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                        <Link className="btn btn-sm" href="/schedule" style={{ marginRight: 6 }}>일정</Link>
                        <Link className="btn btn-sm btn-primary" href="/record">기록지</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
