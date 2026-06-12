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
            className="btn"
            href="/import"
            style={{
              background: "linear-gradient(135deg, #6FA1E5, #1F4E91)",
              color: "#fff",
              border: "1px solid #1F4E91",
              fontWeight: 700,
              padding: "12px 18px",
              fontSize: 14,
              boxShadow: "0 2px 6px rgba(31,78,145,0.25)",
            }}
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12" />
            </svg>
            엑셀로 가져오기
          </Link>
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
              <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                <Link
                  className="btn"
                  href="/import"
                  style={{
                    background: "linear-gradient(135deg, #6FA1E5, #1F4E91)",
                    color: "#fff", border: "1px solid #1F4E91",
                    fontWeight: 700, padding: "12px 20px", fontSize: 14,
                  }}
                >
                  엑셀로 가져오기
                </Link>
                <Link className="btn btn-primary" href="/children/new" style={{ padding: "12px 20px", fontWeight: 700 }}>
                  한 명씩 등록
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>아동</th>
                  <th>상세 내용</th>
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
                        <Link href={`/children/${c.id}/edit`} title="눌러서 수정" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                          <div className="row-name">
                            <span className="avatar-sm">{initial}</span>
                            <div>
                              <div style={{ fontWeight: 600 }}>{c.name}</div>
                              {c.birthDate && (
                                <div className="sub-mute" style={{ fontSize: 11.5 }}>{c.birthDate}</div>
                              )}
                            </div>
                          </div>
                        </Link>
                      </td>
                      <td>
                        <Link href={`/children/${c.id}/edit`} title="눌러서 수정" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {visibleServices.map((s) => {
                              const days = (s.defaultDays ?? "").split(",").filter(Boolean).map(Number);
                              const copay = s.monthlyCopay != null ? `${s.monthlyCopay.toLocaleString("ko-KR")}원` : "미설정";
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
                                      기본 {s.defaultSlot || "시간대 미정"}
                                      {` · 월 목표 ${s.defaultTarget}회`}
                                      {` · 본인부담 ${copay}`}
                                      {days.length > 0 ? ` · ${days.map((d) => WEEK[d]).join(" ")}` : ""}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </Link>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 6 }}>
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
