import Link from "next/link";
import { prisma } from "@/lib/db";
import { createChild } from "../actions";
import ChildForm from "../ChildForm";
import { requireUser, isAdmin } from "@/lib/auth";
import { parseServiceTypes } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function NewChildPage() {
  const user = await requireUser();
  const centerId = user.centerId ?? -1;

  const [therapists, center] = await Promise.all([
    isAdmin(user)
      ? prisma.therapist.findMany({
          where: { active: true, centerId },
          orderBy: { name: "asc" },
          select: { id: true, name: true, active: true },
        })
      : Promise.resolve([] as { id: number; name: string; active: boolean }[]),
    prisma.center.findUnique({ where: { id: centerId }, select: { serviceTypes: true } }),
  ]);

  const serviceTypes = parseServiceTypes(center?.serviceTypes);

  return (
    <>
      <div className="section-head">
        <div>
          <h2>아동 등록</h2>
          <p>
            {isAdmin(user)
              ? "한 번 등록해두면 매월 일정표·기록지에서 자동 호출돼요."
              : "본인 담당 아동을 등록하세요. 자동으로 본인에게 배정됩니다."}
            {" 한 아동이 여러 서비스를 받으면 [서비스 추가] 로 추가하세요."}
          </p>
        </div>
        <Link className="btn btn-ghost" href="/children">← 목록</Link>
      </div>

      <div className="card">
        <div className="card-body">
          <ChildForm
            therapists={therapists}
            serviceTypes={serviceTypes}
            action={createChild}
            submitLabel="등록"
            hideTherapistSelect={!isAdmin(user)}
          />
        </div>
      </div>
    </>
  );
}
