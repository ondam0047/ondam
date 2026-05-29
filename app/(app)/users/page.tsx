import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { createUser, deleteUser, toggleActive } from "./actions";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  OWNER: "원장",
  ADMIN: "행정",
  THERAPIST: "치료사",
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const currentUser = await requireRole(["OWNER", "ADMIN"]);
  const sp = await searchParams;

  const [users, therapists] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }],
      include: { therapist: true },
    }),
    // 아직 user 계정 없는 치료사만 선택지
    prisma.therapist.findMany({
      where: { user: null, active: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <>
      <div className="section-head">
        <div>
          <h2>사용자 관리</h2>
          <p>치료사·행정 계정을 발급합니다. 발급된 계정은 본인 권한에 맞는 화면만 볼 수 있어요.</p>
        </div>
      </div>

      {sp.err && <div className="flash warn">{sp.err}</div>}
      {sp.ok && <div className="flash ok">{sp.ok}</div>}

      <div className="card">
        <div className="card-header">
          <span className="step">+</span>
          <h2>계정 발급</h2>
        </div>
        <div className="card-body">
          <form action={createUser}>
            <div className="form-grid">
              <div className="field">
                <label>이름<span className="req">*</span></label>
                <input className="input" name="name" required />
              </div>
              <div className="field">
                <label>이메일<span className="req">*</span></label>
                <input className="input" name="email" type="email" required />
              </div>
              <div className="field">
                <label>임시 비밀번호<span className="req">*</span> <span className="sub-mute">(6자 이상)</span></label>
                <input className="input" name="password" type="text" minLength={6} required />
              </div>
              <div className="field">
                <label>역할<span className="req">*</span></label>
                <select className="select" name="role" defaultValue="THERAPIST">
                  <option value="THERAPIST">치료사</option>
                  <option value="ADMIN">행정</option>
                  {currentUser.role === "OWNER" && <option value="OWNER">원장</option>}
                </select>
              </div>
              <div className="field">
                <label>치료사 연결 <span className="sub-mute">(치료사 역할일 때)</span></label>
                <select className="select" name="therapistId" defaultValue="">
                  <option value="">— 선택 안 함 —</option>
                  {therapists.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="divider" />
            <button className="btn btn-primary" type="submit">계정 만들기</button>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>계정 목록 ({users.length}명)</h2>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>이름</th>
              <th>이메일</th>
              <th>역할</th>
              <th>연결 치료사</th>
              <th>상태</th>
              <th style={{ width: 200 }}></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u.id === currentUser.id;
              return (
                <tr key={u.id} style={u.active ? undefined : { opacity: 0.55 }}>
                  <td>
                    <div className="row-name">
                      <span className="avatar-sm">{u.name[0]}</span>
                      <div style={{ fontWeight: 600 }}>
                        {u.name} {isSelf && <span className="sub-mute" style={{ fontSize: 11 }}>(나)</span>}
                      </div>
                    </div>
                  </td>
                  <td className="num-cell">{u.email}</td>
                  <td>
                    <span className={"badge " + (u.role === "OWNER" ? "badge-primary" : u.role === "ADMIN" ? "badge-warn" : "badge-mute")}>
                      {ROLE_LABEL[u.role] ?? u.role}
                    </span>
                  </td>
                  <td>{u.therapist?.name ?? <span className="sub-mute">-</span>}</td>
                  <td>
                    <span className={"badge " + (u.active ? "badge-success" : "badge-mute")}>
                      {u.active ? "활동" : "비활성"}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {!isSelf && (
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <form
                          action={async () => {
                            "use server";
                            await toggleActive(u.id, u.active);
                          }}
                          style={{ display: "inline" }}
                        >
                          <button className="btn btn-ghost btn-sm" type="submit">
                            {u.active ? "비활성" : "활성"}
                          </button>
                        </form>
                        <form
                          action={async () => {
                            "use server";
                            await deleteUser(u.id);
                          }}
                          style={{ display: "inline" }}
                        >
                          <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} type="submit">
                            삭제
                          </button>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
