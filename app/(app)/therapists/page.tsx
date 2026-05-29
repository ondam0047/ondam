import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import {
  createTherapist, deleteTherapist,
  createTherapistAccount, resetTherapistPassword, deleteTherapistAccount,
  createAdminAccount, toggleAdminActive,
  approveTherapist, rejectTherapist,
} from "./actions";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  OWNER: "원장",
  ADMIN: "행정",
  THERAPIST: "치료사",
};

export default async function TherapistsPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const me = await requireRole(["OWNER", "ADMIN"]);
  const sp = await searchParams;

  const [therapists, adminUsers, pendingTherapists] = await Promise.all([
    prisma.therapist.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: {
        user: true,
        _count: { select: { children: { where: { active: true } } } },
      },
    }),
    prisma.user.findMany({
      where: { role: { in: ["OWNER", "ADMIN"] } },
      orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }],
    }),
    prisma.user.findMany({
      where: { role: "THERAPIST", active: false },
      orderBy: { createdAt: "asc" },
      include: { therapist: true },
    }),
  ]);

  return (
    <>
      <div className="section-head">
        <div>
          <h2>치료사 관리</h2>
          <p>치료사·행정·원장 계정 발급과 담당 배정을 한 곳에서.</p>
        </div>
      </div>

      {sp.err && <div className="flash warn">{sp.err}</div>}
      {sp.ok && <div className="flash ok">{sp.ok}</div>}

      {/* 가입 승인 대기 — 있을 때만 노출 */}
      {pendingTherapists.length > 0 && (
        <div className="card" style={{ borderColor: "var(--accent)" }}>
          <div className="card-header" style={{ background: "rgba(183,146,104,.08)" }}>
            <h2>승인 대기 ({pendingTherapists.length}명)</h2>
            <span className="hint">치료사가 직접 가입 신청한 계정. 승인하면 로그인할 수 있어요.</span>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>이름</th>
                <th>이메일</th>
                <th>신청 시간</th>
                <th style={{ width: 180 }}></th>
              </tr>
            </thead>
            <tbody>
              {pendingTherapists.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="row-name">
                      <span className="avatar-sm">{u.name[0]}</span>
                      <div style={{ fontWeight: 600 }}>{u.name}</div>
                    </div>
                  </td>
                  <td className="num-cell">{u.email}</td>
                  <td className="num-cell" style={{ fontSize: 11.5, color: "var(--text-mute)" }}>
                    {new Date(u.createdAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: 6 }}>
                      <form action={async () => { "use server"; await approveTherapist(u.id); }} style={{ display: "inline" }}>
                        <button className="btn btn-primary btn-sm" type="submit">승인</button>
                      </form>
                      <form action={async () => { "use server"; await rejectTherapist(u.id); }} style={{ display: "inline" }}>
                        <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} type="submit">거절</button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 행정·원장 계정 */}
      <div className="card">
        <div className="card-header">
          <h2>원장·행정 계정 ({adminUsers.length}명)</h2>
          <span className="hint">치료사 외의 관리자급 계정</span>
        </div>
        <div className="card-body">
          <form action={createAdminAccount}>
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
                <label>임시 비밀번호<span className="req">*</span></label>
                <input className="input" name="password" type="text" minLength={6} required />
              </div>
              <div className="field">
                <label>역할<span className="req">*</span></label>
                <select className="select" name="role" defaultValue="ADMIN">
                  <option value="ADMIN">행정</option>
                  {me.role === "OWNER" && <option value="OWNER">원장</option>}
                </select>
              </div>
              <div className="field" style={{ alignSelf: "end" }}>
                <button className="btn btn-primary" type="submit">계정 만들기</button>
              </div>
            </div>
          </form>
        </div>
        {adminUsers.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>이름</th><th>이메일</th><th>역할</th><th>상태</th><th style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {adminUsers.map((u) => {
                const isSelf = u.id === me.id;
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
                      <span className={"badge " + (u.role === "OWNER" ? "badge-primary" : "badge-warn")}>
                        {ROLE_LABEL[u.role]}
                      </span>
                    </td>
                    <td>
                      <span className={"badge " + (u.active ? "badge-success" : "badge-mute")}>
                        {u.active ? "활동" : "비활성"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {!isSelf && (
                        <form
                          action={async () => { "use server"; await toggleAdminActive(u.id, u.active); }}
                          style={{ display: "inline" }}
                        >
                          <button className="btn btn-ghost btn-sm" type="submit">
                            {u.active ? "비활성" : "활성"}
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 치료사 추가 */}
      <div className="card">
        <div className="card-header">
          <span className="step">+</span>
          <h2>치료사 추가</h2>
          <span className="hint">이름만 등록해두고 계정은 나중에 발급해도 됩니다.</span>
        </div>
        <div className="card-body">
          <form action={createTherapist} className="form-grid">
            <div className="field">
              <label>이름<span className="req">*</span></label>
              <input className="input" name="name" required placeholder="예: 언어/주채린" />
            </div>
            <div className="field">
              <label>전화 (선택)</label>
              <input className="input" name="phone" placeholder="010-1234-5678" />
            </div>
            <div className="field" style={{ alignSelf: "end" }}>
              <button className="btn btn-primary" type="submit">추가</button>
            </div>
          </form>
        </div>
      </div>

      {/* 치료사 목록 */}
      <div className="card">
        <div className="card-header">
          <h2>치료사 목록 ({therapists.length}명)</h2>
          <span className="hint">각 치료사 옆 [계정 만들기] 누르면 로그인 계정 발급. 본인 담당 아동만 보이게 자동 연결돼요.</span>
        </div>
        {therapists.length === 0 ? (
          <div className="card-body">
            <div className="placeholder">아직 등록된 치료사가 없어요.</div>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>이름</th>
                <th>전화</th>
                <th>로그인 계정</th>
                <th>담당 아동</th>
                <th>상태</th>
                <th style={{ width: 240 }}></th>
              </tr>
            </thead>
            <tbody>
              {therapists.map((t) => {
                const hasAccount = !!t.user;
                return (
                  <tr key={t.id} style={t.active ? undefined : { opacity: 0.55 }}>
                    <td>
                      <div className="row-name">
                        <span className="avatar-sm">{t.name[0]}</span>
                        <div style={{ fontWeight: 600 }}>{t.name}</div>
                      </div>
                    </td>
                    <td className="num-cell">{t.phone ?? "-"}</td>
                    <td>
                      {hasAccount ? (
                        <div style={{ fontSize: 12 }}>
                          <div className="num-cell" style={{ fontWeight: 500 }}>{t.user!.email}</div>
                          <div className="sub-mute" style={{ fontSize: 11 }}>
                            {t.user!.active ? "활동" : "비활성"}
                          </div>
                        </div>
                      ) : (
                        <details>
                          <summary className="btn btn-ghost btn-sm" style={{ cursor: "pointer" }}>계정 만들기</summary>
                          <form
                            action={async (fd) => { "use server"; await createTherapistAccount(t.id, fd); }}
                            style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}
                          >
                            <input className="input" name="email" type="email" placeholder="이메일" required style={{ fontSize: 12 }} />
                            <input className="input" name="password" type="text" placeholder="임시 비밀번호" minLength={6} required style={{ fontSize: 12 }} />
                            <button className="btn btn-primary btn-sm" type="submit">발급</button>
                          </form>
                        </details>
                      )}
                    </td>
                    <td className="num-cell">{t._count.children}명</td>
                    <td>
                      <span className={"badge " + (t.active ? "badge-success" : "badge-mute")}>
                        {t.active ? "활동" : "비활성"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <Link className="btn btn-ghost btn-sm" href={`/therapists/${t.id}/edit`}>수정</Link>
                        {hasAccount && (
                          <details style={{ display: "inline-block" }}>
                            <summary className="btn btn-ghost btn-sm" style={{ cursor: "pointer" }}>비번 재설정</summary>
                            <form
                              action={async (fd) => { "use server"; await resetTherapistPassword(t.user!.id, fd); }}
                              style={{ marginTop: 8, display: "flex", gap: 6 }}
                            >
                              <input className="input" name="password" type="text" placeholder="새 비밀번호" minLength={6} required style={{ fontSize: 12, maxWidth: 140 }} />
                              <button className="btn btn-primary btn-sm" type="submit">변경</button>
                            </form>
                          </details>
                        )}
                        {hasAccount && (
                          <form
                            action={async () => { "use server"; await deleteTherapistAccount(t.user!.id); }}
                            style={{ display: "inline" }}
                          >
                            <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} type="submit">계정 삭제</button>
                          </form>
                        )}
                        <form
                          action={async () => { "use server"; await deleteTherapist(t.id); }}
                          style={{ display: "inline" }}
                        >
                          <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} type="submit">치료사 삭제</button>
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
