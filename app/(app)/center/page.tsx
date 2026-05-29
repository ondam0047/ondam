import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { updateCenter, regenerateCode } from "./actions";

export const dynamic = "force-dynamic";

export default async function CenterPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const me = await requireRole(["OWNER", "ADMIN"]);
  const sp = await searchParams;
  const centerId = me.centerId ?? -1;

  const [center, counts, pendingCount] = await Promise.all([
    prisma.center.findUnique({ where: { id: centerId } }),
    Promise.all([
      prisma.user.count({ where: { centerId, active: true } }),
      prisma.therapist.count({ where: { centerId, active: true } }),
      prisma.child.count({ where: { centerId, active: true } }),
    ]),
    prisma.user.count({ where: { centerId, role: "THERAPIST", active: false } }),
  ]);
  const [userCount, therapistCount, childCount] = counts;

  if (!center) {
    return (
      <div className="card">
        <div className="card-body">
          <div className="flash warn">센터 정보를 찾을 수 없어요. 다시 로그인해주세요.</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="section-head">
        <div>
          <h2>센터 설정</h2>
          <p>센터명·연락처·승인코드를 관리합니다.</p>
        </div>
      </div>

      {sp.err && <div className="flash warn">{sp.err}</div>}
      {sp.ok && <div className="flash ok">{sp.ok}</div>}

      {/* 현황 stat */}
      <div className="stats">
        <div className="stat">
          <div className="label">활동 사용자</div>
          <div className="value">{userCount}<span style={{ fontSize: 13, color: "var(--text-mute)", fontWeight: 500, marginLeft: 4 }}>명</span></div>
          <div className="delta">로그인 가능 계정</div>
        </div>
        <div className="stat">
          <div className="label">활동 치료사</div>
          <div className="value">{therapistCount}<span style={{ fontSize: 13, color: "var(--text-mute)", fontWeight: 500, marginLeft: 4 }}>명</span></div>
          <div className="delta">담당 배정 가능</div>
        </div>
        <div className="stat">
          <div className="label">활동 아동</div>
          <div className="value">{childCount}<span style={{ fontSize: 13, color: "var(--text-mute)", fontWeight: 500, marginLeft: 4 }}>명</span></div>
          <div className="delta">등록된 아동</div>
        </div>
        <div className="stat">
          <div className="label">승인 대기</div>
          <div className="value" style={{ color: pendingCount > 0 ? "var(--accent)" : "var(--text)" }}>
            {pendingCount}<span style={{ fontSize: 13, color: "var(--text-mute)", fontWeight: 500, marginLeft: 4 }}>건</span>
          </div>
          <div className="delta">{pendingCount > 0 ? "치료사 관리에서 승인" : "대기 없음"}</div>
        </div>
      </div>

      {/* 승인코드 카드 */}
      <div className="card">
        <div className="card-header">
          <h2>치료사 가입용 승인코드</h2>
          <span className="hint">치료사들에게 알려주세요. 가입 화면에 입력하면 우리 센터로 들어옵니다.</span>
        </div>
        <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div style={{
            fontFamily: "monospace",
            fontSize: 36,
            fontWeight: 700,
            letterSpacing: "0.18em",
            color: "var(--primary)",
            padding: "8px 24px",
            background: "var(--primary-soft)",
            borderRadius: "var(--r-md)",
          }}>
            {center.approvalCode}
          </div>
          <form action={regenerateCode}>
            <button className="btn btn-ghost" type="submit">
              새 코드로 재발급
            </button>
          </form>
          <div className="sub-mute" style={{ fontSize: 12, maxWidth: 380 }}>
            ⚠️ 재발급하면 기존 코드는 즉시 무효가 돼요. 그 동안 코드를 받은 치료사들에게 새 코드를 다시 알려야 합니다. 코드가 유출됐을 때만 사용하세요.
          </div>
        </div>
      </div>

      {/* 센터 정보 카드 */}
      <div className="card">
        <div className="card-header">
          <h2>센터 정보</h2>
        </div>
        <div className="card-body">
          <form action={updateCenter}>
            <div className="form-grid">
              <div className="field" style={{ gridColumn: "span 2" }}>
                <label>센터명<span className="req">*</span></label>
                <input className="input" name="name" defaultValue={center.name} required />
                <div className="sub-mute" style={{ fontSize: 11, marginTop: 4 }}>
                  사이드바와 양식의 '제공기관명' 기본값으로 사용돼요.
                </div>
              </div>
              <div className="field" style={{ gridColumn: "span 2" }}>
                <label>주소 (선택)</label>
                <input className="input" name="address" defaultValue={center.address ?? ""} />
              </div>
              <div className="field">
                <label>대표 전화 (선택)</label>
                <input className="input" name="phone" defaultValue={center.phone ?? ""} />
              </div>
            </div>
            <div className="divider" />
            <button className="btn btn-primary" type="submit">저장</button>
          </form>
        </div>
      </div>
    </>
  );
}
