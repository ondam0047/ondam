import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { THERAPIST_TYPES } from "@/lib/constants";
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

  const [center, userRow, childCount] = await Promise.all([
    prisma.center.findUnique({
      where: { id: centerId },
      select: {
        name: true, address: true, phone: true, serviceTypes: true,
        slots: true, defaultUnit: true,
      },
    }),
    prisma.user.findUnique({ where: { id: me.id }, select: { name: true, therapistType: true } }),
    prisma.child.count({ where: { centerId, active: true } }),
  ]);

  if (!center || !userRow) {
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
          <p>회원가입 때 입력한 내용을 여기서 모두 수정할 수 있어요. 변경 즉시 일정표·기록지에 반영됩니다.</p>
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
              <div className="field">
                <label>내 이름<span className="req">*</span></label>
                <input className="input" name="userName" defaultValue={userRow.name} required />
                <div className="sub-mute" style={{ fontSize: 11, marginTop: 4 }}>
                  일정표·기록지의 '담당' · '치료사명' 으로 들어가요.
                </div>
              </div>
              <div className="field">
                <label>치료사 종류<span className="req">*</span></label>
                <select className="select" name="therapistType" defaultValue={userRow.therapistType ?? ""} required>
                  <option value="" disabled>— 선택 —</option>
                  {THERAPIST_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <div className="sub-mute" style={{ fontSize: 11, marginTop: 4 }}>
                  일정표·기록지의 서비스 종류 자동 채움.
                </div>
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>소속 센터명 <span className="sub-mute">(선택)</span></label>
                <input className="input" name="centerName" defaultValue={center.name} />
                <div className="sub-mute" style={{ fontSize: 11, marginTop: 4 }}>
                  일정표·기록지의 '제공기관명' 으로 들어가요. 프리랜서면 비워두세요.
                </div>
              </div>
              <div className="field">
                <label>주소 (선택)</label>
                <input className="input" name="address" defaultValue={center.address ?? ""} />
              </div>
              <div className="field">
                <label>대표 전화 (선택)</label>
                <input className="input" name="phone" defaultValue={center.phone ?? ""} />
              </div>
              <div className="field">
                <label>회당 기본 단가 (원)</label>
                <input
                  className="input"
                  name="defaultUnit"
                  type="number"
                  min={0}
                  step={1000}
                  defaultValue={center.defaultUnit}
                />
                <div className="sub-mute" style={{ fontSize: 11, marginTop: 4 }}>
                  새 아동 등록·일정표의 회당 단가에 자동 채워져요. 일정표에서 회기마다 수정 가능.
                </div>
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>회기 시간대 <span className="sub-mute">(콤마 또는 줄바꿈으로 구분, HH:MM~HH:MM)</span></label>
                <textarea
                  className="textarea"
                  name="slots"
                  defaultValue={center.slots}
                  rows={4}
                  style={{ fontFamily: "monospace", fontSize: 13 }}
                />
                <div className="sub-mute" style={{ fontSize: 11, marginTop: 4 }}>
                  본인이 운영하는 회기 시간들. 일정표·세션 편집에서 드롭다운 옵션으로 사용됩니다.
                </div>
              </div>
            </div>

            <div className="divider" />

            <div className="label-block">수기 기록지 출력 <span className="small">— 인쇄 후 손으로 채우는 분들</span></div>
            <label className="modal-check" style={{ marginBottom: 8 }}>
              <input type="checkbox" name="manualMode" defaultChecked={center.manualMode} />
              <b>수기 기록지 모드 사용</b>
            </label>
            <div className="sub-mute" style={{ fontSize: 12, lineHeight: 1.7, marginBottom: 10 }}>
              켜면 한글파일(.hwpx) 출력 시 <b>상태 및 결과 기록 / 사유</b>가 빈칸으로 인쇄돼요.
              나머지 텍스트(이름·생년월일·시간·바우처·총평 등)는 그대로 출력됩니다.
              아래 3개 칸은 따로 골라서 끌 수 있어요.
            </div>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", padding: "8px 12px", background: "var(--surface-2)", borderRadius: "var(--r-sm)" }}>
              <label className="modal-check">
                <input type="checkbox" name="printUseDay" defaultChecked={center.printUseDay} />
                제공일자 출력
              </label>
              <label className="modal-check">
                <input type="checkbox" name="printPayDay" defaultChecked={center.printPayDay} />
                승인일자 출력
              </label>
              <label className="modal-check">
                <input type="checkbox" name="printApprNo" defaultChecked={center.printApprNo} />
                승인번호 출력
              </label>
            </div>
            <div className="sub-mute" style={{ fontSize: 11, marginTop: 6 }}>
              체크 해제한 칸은 인쇄에서 빈칸으로 나가요. 수기 기록지 모드가 꺼져 있으면 이 설정은 무시됩니다.
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
