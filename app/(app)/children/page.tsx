import Link from "next/link";
import { prisma } from "@/lib/db";
import { deleteChild } from "./actions";
import { WEEK } from "@/lib/constants";
import { requireUser, isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ChildrenPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; therapistId?: string; unassigned?: string }>;
}) {
  const user = await requireUser();
  const canManage = isAdmin(user);
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const filterTherapistId = sp.therapistId ? Number(sp.therapistId) : null;
  const onlyUnassigned = sp.unassigned === "1";

  // 치료사는 본인 담당 아동만 (필터 무시), 관리자는 필터 적용
  let where: Record<string, unknown> = { centerId: user.centerId ?? -1 };
  if (canManage) {
    if (filterTherapistId) where.therapistId = filterTherapistId;
    else if (onlyUnassigned) where.therapistId = null;
    if (q) where = { ...where, name: { contains: q } };
  } else {
    where = { ...where, therapistId: user.therapistId ?? -1 };
    if (q) where = { ...where, name: { contains: q } };
  }

  const [children, allTherapists] = await Promise.all([
    prisma.child.findMany({
      where,
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { therapist: true },
    }),
    canManage
      ? prisma.therapist.findMany({
          where: { active: true, centerId: user.centerId ?? -1 },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const activeCount = children.filter((c) => c.active).length;

  return (
    <>
      <div className="section-head">
        <div>
          <h2>아동 관리</h2>
          <p>
            {canManage
              ? `활동 중 ${activeCount}명 · 한 번 등록해두면 일정표·기록지에서 자동 호출됩니다.`
              : `담당 아동 ${activeCount}명`}
          </p>
        </div>
        {canManage && (
          <Link className="btn btn-primary" href="/children/new">
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 5v14 M5 12h14" />
            </svg>
            아동 등록
          </Link>
        )}
      </div>

      {canManage && (
        <div className="card">
          <div className="card-header">
            <h2>검색·필터</h2>
          </div>
          <div className="card-body">
            <form method="get" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
              <div className="field" style={{ flex: 1, minWidth: 180 }}>
                <label>이름 검색</label>
                <input className="input" name="q" defaultValue={q} placeholder="아동 이름 일부" />
              </div>
              <div className="field" style={{ minWidth: 180 }}>
                <label>담당 치료사</label>
                <select className="select" name="therapistId" defaultValue={filterTherapistId?.toString() ?? ""}>
                  <option value="">— 전체 —</option>
                  {allTherapists.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="modal-check">
                  <input type="checkbox" name="unassigned" value="1" defaultChecked={onlyUnassigned} />
                  미배정만
                </label>
              </div>
              <button className="btn btn-primary" type="submit">적용</button>
              <Link className="btn btn-ghost" href="/children">초기화</Link>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2>아동 목록 ({children.length}명)</h2>
          {(q || filterTherapistId || onlyUnassigned) && (
            <span className="hint">
              {q && `이름: "${q}"`}
              {filterTherapistId && ` · 담당: ${allTherapists.find((t) => t.id === filterTherapistId)?.name ?? "?"}`}
              {onlyUnassigned && " · 미배정"}
            </span>
          )}
        </div>
        {children.length === 0 ? (
          <div className="card-body">
            <div className="placeholder">
              {canManage
                ? "아직 등록된 아동이 없어요. 우측 상단 “아동 등록”을 눌러보세요."
                : "아직 담당 아동이 없어요. 원장님께 배정을 요청해주세요."}
            </div>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>아동</th>
                <th>서비스</th>
                {canManage && <th>담당 치료사</th>}
                <th>기본 요일</th>
                <th>기본 시간</th>
                <th>목표</th>
                {canManage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {children.map((c) => {
                const days = (c.defaultDays ?? "").split(",").filter(Boolean).map(Number);
                const initial = c.name[0];
                return (
                  <tr key={c.id} style={c.active ? undefined : { opacity: 0.55 }}>
                    <td>
                      <div className="row-name">
                        <span className="avatar-sm">{initial}</span>
                        <div>
                          <div style={{ fontWeight: 600 }}>{c.name}</div>
                          {c.birthDate && (
                            <div className="sub-mute" style={{ fontSize: 11.5 }}>{c.birthDate}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td><span className="badge badge-primary">{c.serviceType}</span></td>
                    {canManage && (
                      <td>{c.therapist?.name ?? <span className="sub-mute">-</span>}</td>
                    )}
                    <td>{days.length > 0 ? days.map((d) => WEEK[d]).join(" ") : <span className="sub-mute">-</span>}</td>
                    <td className="num-cell">{c.defaultSlot ?? "-"}</td>
                    <td className="num-cell">{c.defaultTarget}회</td>
                    {canManage && (
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 6 }}>
                          <Link className="btn btn-ghost btn-sm" href={`/children/${c.id}/edit`}>수정</Link>
                          <form
                            action={async () => {
                              "use server";
                              await deleteChild(c.id);
                            }}
                            style={{ display: "inline" }}
                          >
                            <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} type="submit">
                              삭제
                            </button>
                          </form>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
