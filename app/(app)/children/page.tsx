import Link from "next/link";
import { prisma } from "@/lib/db";
import { deleteChild } from "./actions";
import { WEEK } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function ChildrenPage() {
  const children = await prisma.child.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { therapist: true },
  });

  const activeCount = children.filter((c) => c.active).length;

  return (
    <>
      <div className="section-head">
        <div>
          <h2>아동 관리</h2>
          <p>활동 중 {activeCount}명 · 한 번 등록해두면 일정표·기록지에서 자동 호출됩니다.</p>
        </div>
        <Link className="btn btn-primary" href="/children/new">
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 5v14 M5 12h14" />
          </svg>
          아동 등록
        </Link>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>아동 목록 ({children.length}명)</h2>
        </div>
        {children.length === 0 ? (
          <div className="card-body">
            <div className="placeholder">
              아직 등록된 아동이 없어요. 우측 상단 <b>아동 등록</b>을 눌러 시작하세요.
            </div>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>아동</th>
                <th>서비스</th>
                <th>담당 치료사</th>
                <th>기본 요일</th>
                <th>기본 시간</th>
                <th>목표</th>
                <th></th>
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
                    <td>{c.therapist?.name ?? <span className="sub-mute">-</span>}</td>
                    <td>{days.length > 0 ? days.map((d) => WEEK[d]).join(" ") : <span className="sub-mute">-</span>}</td>
                    <td className="num-cell">{c.defaultSlot ?? "-"}</td>
                    <td className="num-cell">{c.defaultTarget}회</td>
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
        )}
      </div>
    </>
  );
}
