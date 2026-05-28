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

  return (
    <>
      <div className="card">
        <h2>
          <span className="n">≡</span>아동 목록 ({children.length}명)
          <Link className="btn sm" href="/children/new" style={{ marginLeft: "auto" }}>+ 아동 추가</Link>
        </h2>
        {children.length === 0 ? (
          <div className="empty-state">아직 등록된 아동이 없어요. 우측 상단 “+ 아동 추가”를 눌러보세요.</div>
        ) : (
          <table className="list-tbl">
            <thead>
              <tr>
                <th>이름</th><th>서비스</th><th>담당 치료사</th>
                <th>기본 요일</th><th>기본 시간</th><th>목표</th>
                <th style={{ width: 160 }}></th>
              </tr>
            </thead>
            <tbody>
              {children.map((c) => {
                const days = (c.defaultDays ?? "").split(",").filter(Boolean).map(Number);
                return (
                  <tr key={c.id} style={c.active ? undefined : { opacity: 0.55 }}>
                    <td><b>{c.name}</b>{c.birthDate && <span style={{ color: "var(--muted)", marginLeft: 6, fontSize: 12 }}>({c.birthDate})</span>}</td>
                    <td>{c.serviceType}</td>
                    <td>{c.therapist?.name ?? "-"}</td>
                    <td>{days.length > 0 ? days.map((d) => WEEK[d]).join(" ") : "-"}</td>
                    <td>{c.defaultSlot ?? "-"}</td>
                    <td>{c.defaultTarget}회</td>
                    <td>
                      <div className="row-actions">
                        <Link className="btn ghost sm" href={`/children/${c.id}/edit`}>수정</Link>
                        <form
                          action={async () => {
                            "use server";
                            await deleteChild(c.id);
                          }}
                        >
                          <button className="btn ghost sm danger" type="submit">삭제</button>
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
