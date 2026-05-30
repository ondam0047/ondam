import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { updateCenter } from "./actions";

export const dynamic = "force-dynamic";

export default async function CenterPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const me = await requireRole(["OWNER", "ADMIN"]);
  const sp = await searchParams;
  const centerId = me.centerId ?? -1;

  const [center, childCount] = await Promise.all([
    prisma.center.findUnique({ where: { id: centerId } }),
    prisma.child.count({ where: { centerId, active: true } }),
  ]);

  if (!center) {
    return (
      <div className="card">
        <div className="card-body">
          <div className="flash warn">정보를 찾을 수 없어요. 다시 로그인해주세요.</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="section-head">
        <div>
          <h2>내 설정</h2>
          <p>본인 정보·치료 영역·시간대를 관리합니다.</p>
        </div>
      </div>

      {sp.err && <div className="flash warn">{sp.err}</div>}
      {sp.ok && <div className="flash ok">{sp.ok}</div>}

      <div className="card">
        <div className="card-header">
          <h2>내 정보</h2>
        </div>
        <div className="card-body">
          <form action={updateCenter}>
            <div className="form-grid">
              <div className="field" style={{ gridColumn: "span 2" }}>
                <label>이름 / 소속 센터명<span className="req">*</span></label>
                <input className="input" name="name" defaultValue={center.name} required />
                <div className="sub-mute" style={{ fontSize: 11, marginTop: 4 }}>
                  일정표·기록지의 '제공기관명' 기본값으로 사용됩니다.
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
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>치료 영역 (콤마 또는 줄바꿈으로 구분)</label>
                <textarea
                  className="textarea"
                  name="serviceTypes"
                  defaultValue={center.serviceTypes}
                  rows={3}
                  placeholder="예: 언어재활, 놀이치료, 감각통합치료, 인지재활"
                />
                <div className="sub-mute" style={{ fontSize: 11, marginTop: 4 }}>
                  아동 등록·일정표·기록지에서 보이는 드롭다운 항목입니다.
                </div>
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>치료 시간대 (콤마 또는 줄바꿈으로 구분, HH:MM~HH:MM)</label>
                <textarea
                  className="textarea"
                  name="slots"
                  defaultValue={center.slots}
                  rows={4}
                  placeholder="예: 09:00~09:50, 09:50~10:40, ..."
                  style={{ fontFamily: "monospace", fontSize: 13 }}
                />
                <div className="sub-mute" style={{ fontSize: 11, marginTop: 4 }}>
                  일정표·내 차단 시간·세션 편집에서 보이는 시간 옵션입니다. 본인의 회기 운영 시간에 맞춰 설정하세요.
                </div>
              </div>
            </div>
            <div className="divider" />
            <button className="btn btn-primary" type="submit">저장</button>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>내 사물함 현황</div>
            <div className="sub-mute" style={{ fontSize: 13 }}>
              등록된 아동 <b style={{ color: "var(--text)" }}>{childCount}명</b>
            </div>
          </div>
          <div className="sub-mute" style={{ fontSize: 12, maxWidth: 360, textAlign: "right" }}>
            본인 사물함의 모든 데이터는 다른 사람에게 절대 보이지 않습니다.
          </div>
        </div>
      </div>
    </>
  );
}
