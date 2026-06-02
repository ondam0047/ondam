import Link from "next/link";
import { prisma } from "@/lib/db";
import { deleteChild } from "./actions";
import { WEEK } from "@/lib/constants";
import { requireUser, getEffectiveTherapistId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ChildrenPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; waiting?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const onlyWaiting = sp.waiting === "1";

  const centerId = user.centerId ?? -1;
  const myTherapistId = await getEffectiveTherapistId(user);

  // 본인이 담당하는 ChildService 가 있는 아동만. 대기 명단은 토글로만.
  const childWhere: Record<string, unknown> = {
    centerId,
    waiting: onlyWaiting,
    services: { some: { therapistId: myTherapistId ?? -1 } },
  };
  if (q) {
    childWhere.OR = [
      { name: { contains: q } },
      { mgmtNumber: { contains: q } },
      { memo: { contains: q } },
    ];
  }

  const children = await prisma.child.findMany({
    where: childWhere,
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { services: { include: { therapist: true } } },
  });

  const activeCount = children.filter((c) => c.active).length;

  return (
    <>
      <div className="section-head">
        <div>
          <h2>{onlyWaiting ? "대기 명단" : "내 아동"}</h2>
          <p>
            {onlyWaiting
              ? `상담 예정 · 회기 시작 전 ${activeCount}명`
              : `담당 아동 ${activeCount}명 · 한 아동이 여러 서비스를 받는 경우 함께 관리됩니다.`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link
            className="btn btn-primary"
            href="/children/new"
            style={{ padding: "12px 18px", fontSize: 14, fontWeight: 700 }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
              <path d="M12 5v14 M5 12h14" />
            </svg>
            한 명씩 등록
          </Link>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>검색</h2>
        </div>
        <div className="card-body">
          <form method="get" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
            <div className="field" style={{ flex: 1, minWidth: 180 }}>
              <label>이름 검색</label>
              <input className="input" name="q" defaultValue={q} placeholder="아동 이름 일부" />
            </div>
            {onlyWaiting && <input type="hidden" name="waiting" value="1" />}
            <button className="btn btn-primary" type="submit">적용</button>
            <Link className="btn btn-ghost" href={onlyWaiting ? "/children?waiting=1" : "/children"}>초기화</Link>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>아동 목록 ({children.length}명)</h2>
          {q && <span className="hint">이름: &quot;{q}&quot;</span>}
        </div>
        {children.length === 0 ? (
          <div className="card-body" style={{ padding: "32px 24px" }}>
            <div style={{ textAlign: "center", maxWidth: 520, margin: "0 auto" }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
                아직 등록된 아동이 없어요
              </div>
              <div className="sub-mute" style={{ fontSize: 13.5, marginBottom: 20, lineHeight: 1.7 }}>
                매월 일정표·기록지에서 자동으로 회기를 만들려면 먼저 아동을 등록하세요.
              </div>
              <Link className="btn btn-primary" href="/children/new" style={{ padding: "12px 20px", fontWeight: 700 }}>
                한 명씩 등록
              </Link>
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
                  const visibleServices = c.services.filter((s) => s.therapistId === myTherapistId);
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
