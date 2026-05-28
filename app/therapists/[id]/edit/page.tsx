import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { updateTherapist } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditTherapistPage(props: PageProps<"/therapists/[id]/edit">) {
  const { id } = await props.params;
  const tid = Number(id);
  if (!Number.isInteger(tid)) notFound();
  const t = await prisma.therapist.findUnique({ where: { id: tid } });
  if (!t) notFound();

  const update = updateTherapist.bind(null, t.id);

  return (
    <>
      <div className="section-head">
        <div>
          <h2>치료사 수정 — {t.name}</h2>
          <p>이름·전화·활동 상태를 바꿀 수 있어요.</p>
        </div>
        <Link className="btn btn-ghost" href="/therapists">← 목록</Link>
      </div>

      <div className="card">
        <div className="card-body">
          <form action={update}>
            <div className="form-grid">
              <div className="field">
                <label>이름<span className="req">*</span></label>
                <input className="input" name="name" defaultValue={t.name} required />
              </div>
              <div className="field">
                <label>전화 (선택)</label>
                <input className="input" name="phone" defaultValue={t.phone ?? ""} />
              </div>
              <div className="field" style={{ alignSelf: "end" }}>
                <label className="modal-check">
                  <input type="checkbox" name="active" defaultChecked={t.active} />
                  활동 중
                </label>
              </div>
            </div>
            <div className="divider" />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" type="submit">저장</button>
              <Link className="btn btn-ghost" href="/therapists">취소</Link>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
