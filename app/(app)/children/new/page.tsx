import Link from "next/link";
import { prisma } from "@/lib/db";
import { createChild } from "../actions";
import ChildForm from "../ChildForm";

export const dynamic = "force-dynamic";

export default async function NewChildPage() {
  const therapists = await prisma.therapist.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, active: true },
  });
  return (
    <>
      <div className="section-head">
        <div>
          <h2>아동 등록</h2>
          <p>한 번 등록해두면 매월 일정표·기록지에서 자동 호출돼요.</p>
        </div>
        <Link className="btn btn-ghost" href="/children">← 목록</Link>
      </div>

      <div className="card">
        <div className="card-body">
          <ChildForm therapists={therapists} action={createChild} submitLabel="등록" />
        </div>
      </div>
    </>
  );
}
