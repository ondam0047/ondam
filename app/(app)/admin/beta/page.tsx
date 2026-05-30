import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const BETA_ADMIN_EMAIL = (process.env.BETA_ADMIN_EMAIL ?? "yj2000102@gmail.com").toLowerCase();

export default async function BetaAdminPage() {
  const user = await requireUser();
  if (user.email.toLowerCase() !== BETA_ADMIN_EMAIL) {
    redirect("/dashboard");
  }

  const code = (process.env.BETA_ACCESS_CODE ?? "").trim();
  const totalUsers = await prisma.user.count();
  const recentUsers = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      therapistType: true,
      active: true,
      createdAt: true,
      center: { select: { name: true } },
    },
  });

  return (
    <>
      <div className="section-head">
        <div>
          <h2>🛠️ 베타 운영 관리</h2>
          <p>{BETA_ADMIN_EMAIL} 만 접근 가능. 일반 사용자에겐 안 보임.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>현재 초대코드</h2>
        </div>
        <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          {code ? (
            <>
              <div style={{
                fontFamily: "monospace",
                fontSize: 32,
                fontWeight: 700,
                letterSpacing: "0.18em",
                color: "var(--primary)",
                padding: "8px 24px",
                background: "var(--primary-soft)",
                borderRadius: "var(--r-md)",
              }}>
                {code}
              </div>
              <div className="sub-mute" style={{ fontSize: 13, maxWidth: 400 }}>
                10명 베타 사용자에게 이 코드를 알려주세요. 가입 화면에서 코드를 입력해야만 통과합니다.
                <br />
                <b>변경하려면</b> 서버의 환경변수 <code>BETA_ACCESS_CODE</code> 를 수정한 뒤 재시작.
              </div>
            </>
          ) : (
            <div className="flash warn">
              ⚠️ <b>베타 잠금이 해제된 상태</b>입니다. 누구나 가입 가능.
              <br />
              환경변수 <code>BETA_ACCESS_CODE=값</code> 을 설정하면 그 코드를 가진 사람만 가입 가능해져요.
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>가입자 ({totalUsers}명)</h2>
          <span className="hint">최근 30명</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>이름</th>
                <th>이메일</th>
                <th>치료사 종류</th>
                <th>사물함 이름</th>
                <th>역할</th>
                <th>가입일</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {recentUsers.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.name}</b></td>
                  <td className="sub-mute" style={{ fontSize: 12 }}>{u.email}</td>
                  <td>{u.therapistType ?? "-"}</td>
                  <td>{u.center?.name ?? "-"}</td>
                  <td>
                    <span className="badge badge-primary">
                      {u.role === "OWNER" ? "사물함 주인" : u.role}
                    </span>
                  </td>
                  <td className="sub-mute" style={{ fontSize: 12 }}>
                    {new Date(u.createdAt).toLocaleDateString("ko-KR")}
                  </td>
                  <td>{u.active ? "✓ 활성" : "❌ 비활성"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
