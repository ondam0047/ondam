import Link from "next/link";
import { prisma } from "@/lib/db";
import { createChild } from "../actions";
import ChildForm from "../ChildForm";
import { requireUser, isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NewChildPage() {
  const user = await requireUser();
  const centerId = user.centerId ?? -1;

  // 관리자(원장·행정)는 치료사 목록을 보고 누구에게나 배정 가능.
  // 치료사는 본인에게만 자동 배정 — 드롭다운 자체를 안 보여줌.
  const therapists = isAdmin(user)
    ? await prisma.therapist.findMany({
        where: { active: true, centerId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, active: true },
      })
    : [];

  const hideTherapistSelect = !isAdmin(user);

  return (
    <>
      <div className="section-head">
        <div>
          <h2>아동 등록</h2>
          <p>
            {isAdmin(user)
              ? "한 번 등록해두면 매월 일정표·기록지에서 자동 호출돼요."
              : "본인 담당 아동을 등록하세요. 자동으로 본인에게 배정됩니다."}
          </p>
        </div>
        <Link className="btn btn-ghost" href="/children">← 목록</Link>
      </div>

      <div className="card">
        <div className="card-body">
          <ChildForm
            therapists={therapists}
            action={createChild}
            submitLabel="등록"
            hideTherapistSelect={hideTherapistSelect}
          />
        </div>
      </div>
    </>
  );
}
