import Link from "next/link";
import { prisma } from "@/lib/db";
import { createTherapist, deleteTherapist } from "./actions";

export const dynamic = "force-dynamic";

export default async function TherapistsPage() {
  const therapists = await prisma.therapist.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  const activeCount = therapists.filter((t) => t.active).length;

  return (
    <>
      <div className="section-head">
        <div>
          <h2>치료사 관리</h2>
          <p>활동 중 {activeCount}명 · 일정표 작성 시 드롭다운에서 바로 선택돼요.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="step">+</span>
          <h2>치료사 추가</h2>
        </div>
        <div className="card-body">
          <form action={createTherapist} className="form-grid">
            <div className="field">
              <label>이름<span className="req">*</span></label>
              <input className="input" name="name" required placeholder="예: 주채린" />
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

      <div className="card">
        <div className="card-header">
          <h2>치료사 목록 ({therapists.length}명)</h2>
        </div>
        {therapists.length === 0 ? (
          <div className="card-body">
            <div className="placeholder">아직 등록된 치료사가 없어요. 위에서 추가해 주세요.</div>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>이름</th>
                <th>전화</th>
                <th>상태</th>
                <th style={{ width: 180 }}></th>
              </tr>
            </thead>
            <tbody>
              {therapists.map((t) => {
                const initial = t.name[0];
                return (
                  <tr key={t.id}>
                    <td>
                      <div className="row-name">
                        <span className="avatar-sm">{initial}</span>
                        <div style={{ fontWeight: 600 }}>{t.name}</div>
                      </div>
                    </td>
                    <td className="num-cell">{t.phone ?? "-"}</td>
                    <td>
                      <span className={"badge " + (t.active ? "badge-success" : "badge-mute")}>
                        {t.active ? "활동" : "비활성"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <Link className="btn btn-ghost btn-sm" href={`/therapists/${t.id}/edit`}>수정</Link>
                        <form
                          action={async () => {
                            "use server";
                            await deleteTherapist(t.id);
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
