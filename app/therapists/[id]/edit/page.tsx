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
    <div className="card">
      <h2><span className="n">✎</span>치료사 수정 — {t.name}</h2>
      <form action={update}>
        <div className="field-grid">
          <div>
            <label className="fl">이름</label>
            <input name="name" defaultValue={t.name} required />
          </div>
          <div>
            <label className="fl">전화 (선택)</label>
            <input name="phone" defaultValue={t.phone ?? ""} />
          </div>
          <div style={{ alignSelf: "end" }}>
            <label className="modal-check">
              <input type="checkbox" name="active" defaultChecked={t.active} />
              활동 중
            </label>
          </div>
        </div>
        <div className="actions">
          <button className="btn" type="submit">저장</button>
          <Link className="btn ghost sm" href="/therapists">취소</Link>
        </div>
      </form>
    </div>
  );
}
