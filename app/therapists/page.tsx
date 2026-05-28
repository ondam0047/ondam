import Link from "next/link";
import { prisma } from "@/lib/db";
import { createTherapist, deleteTherapist } from "./actions";

export const dynamic = "force-dynamic";

export default async function TherapistsPage() {
  const therapists = await prisma.therapist.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  return (
    <>
      <div className="card">
        <h2><span className="n">+</span>치료사 추가</h2>
        <form action={createTherapist} className="field-grid">
          <div>
            <label className="fl">이름</label>
            <input name="name" required placeholder="예: 주채린" />
          </div>
          <div>
            <label className="fl">전화 (선택)</label>
            <input name="phone" placeholder="775-0047" />
          </div>
          <div style={{ alignSelf: "end" }}>
            <button className="btn" type="submit">추가</button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2><span className="n">≡</span>치료사 목록 ({therapists.length}명)</h2>
        {therapists.length === 0 ? (
          <div className="empty-state">아직 등록된 치료사가 없어요. 위 폼에서 추가해보세요.</div>
        ) : (
          <table className="list-tbl">
            <thead>
              <tr><th>이름</th><th>전화</th><th>상태</th><th style={{ width: 160 }}></th></tr>
            </thead>
            <tbody>
              {therapists.map((t) => (
                <tr key={t.id}>
                  <td><b>{t.name}</b></td>
                  <td>{t.phone ?? "-"}</td>
                  <td>{t.active ? "활동" : "비활성"}</td>
                  <td>
                    <div className="row-actions">
                      <Link className="btn ghost sm" href={`/therapists/${t.id}/edit`}>수정</Link>
                      <form
                        action={async () => {
                          "use server";
                          await deleteTherapist(t.id);
                        }}
                      >
                        <button className="btn ghost sm danger" type="submit">삭제</button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
