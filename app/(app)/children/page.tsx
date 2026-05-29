import Link from "next/link";
import { prisma } from "@/lib/db";
import { deleteChild } from "./actions";
import { WEEK } from "@/lib/constants";
import { requireUser, isAdmin, getEffectiveTherapistId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ChildrenPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; therapistId?: string; unassigned?: string; waiting?: string }>;
}) {
  const user = await requireUser();
  // 원장·행정은 센터 전체 아동 관리 가능. 치료사는 본인 담당만.
  const canManage = user.role === "ADMIN" || user.role === "OWNER";
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const filterTherapistId = sp.therapistId ? Number(sp.therapistId) : null;
  const onlyUnassigned = sp.unassigned === "1";
  const onlyWaiting = sp.waiting === "1";

  // 대기 명단은 원장·행정만. 치료사가 ?waiting=1 시도하면 거부.
  if (onlyWaiting && !canManage) {
    const { redirect } = await import("next/navigation");
    redirect("/children");
  }

  const centerId = user.centerId ?? -1;
  const myTherapistId = canManage ? null : await getEffectiveTherapistId(user);

  // 아동 단위 조회. 치료사·원장은 본인이 담당하는 ChildService 가 있는 아동만.
  // 대기 명단은 별도 토글로만 노출 (기본은 정식 등록만 보임).
  const childWhere: Record<string, unknown> = { centerId, waiting: onlyWaiting };
  if (canManage) {
    if (filterTherapistId) childWhere.services = { some: { therapistId: filterTherapistId } };
    else if (onlyUnassigned) childWhere.services = { some: { therapistId: null } };
  } else if (!onlyWaiting) {
    childWhere.services = { some: { therapistId: myTherapistId ?? -1 } };
  }
  // 검색: 이름·관리번호·메모, 그리고 담당 치료사 이름까지
  if (q) {
    childWhere.OR = [
      { name: { contains: q } },
      { mgmtNumber: { contains: q } },
      { memo: { contains: q } },
      { services: { some: { therapist: { name: { contains: q } } } } },
    ];
  }

  const [children, allTherapists] = await Promise.all([
    prisma.child.findMany({
      where: childWhere,
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { services: { include: { therapist: true } } },
    }),
    canManage
      ? prisma.therapist.findMany({
          where: { active: true, centerId },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const activeCount = children.filter((c) => c.active).length;

  return (
    <>
      <div className="section-head">
        <div>
          <h2>{onlyWaiting ? "대기 명단" : "아동 관리"}</h2>
          <p>
            {onlyWaiting
              ? `상담 예정 · 회기 시작 전 ${activeCount}명`
              : canManage
                ? `활동 중 ${activeCount}명 · 한 아동이 여러 서비스(언어재활·놀이치료 등)를 받는 경우 함께 관리됩니다.`
                : `담당 아동 ${activeCount}명`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canManage && !onlyWaiting && (
            <Link className="btn btn-ghost" href="/children?waiting=1">⏳ 대기 명단</Link>
          )}
          {canManage && onlyWaiting && (
            <Link className="btn btn-ghost" href="/children">← 등록 아동</Link>
          )}
          <Link className="btn btn-primary" href="/children/new">
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 5v14 M5 12h14" />
            </svg>
            아동 등록
          </Link>
        </div>
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
              아직 담당 아동이 없어요. 우측 상단 “아동 등록”을 눌러보세요.
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>아동</th>
                  <th>받는 치료</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {children.map((c) => {
                  const initial = c.name[0];
                  // 치료사 본인 화면에서는 본인 담당 서비스만 노출
                  const visibleServices = canManage
                    ? c.services
                    : c.services.filter((s) => s.therapistId === myTherapistId);
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
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {visibleServices.map((s) => {
                            const days = (s.defaultDays ?? "").split(",").filter(Boolean).map(Number);
                            return (
                              <div key={s.id} style={{
                                background: "var(--surface-2)",
                                border: "1px solid var(--border)",
                                borderRadius: "var(--r-sm)",
                                padding: "6px 10px",
                                fontSize: 12.5,
                              }}>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                                  <span className="badge badge-primary">{s.serviceType}</span>
                                  {canManage && (
                                    <span style={{ fontSize: 12, color: "var(--text-soft)" }}>
                                      담당: {s.therapist?.name ?? "—"}
                                    </span>
                                  )}
                                  <span style={{ color: "var(--text-mute)", fontSize: 11.5 }}>
                                    {days.length > 0 ? days.map((d) => WEEK[d]).join(" ") : "요일 미정"}
                                    {s.defaultSlot ? ` · ${s.defaultSlot}` : ""}
                                    {` · 목표 ${s.defaultTarget}회`}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 6 }}>
                          <Link className="btn btn-ghost btn-sm" href={`/children/${c.id}/edit`}>수정</Link>
                          {canManage && (
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
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
