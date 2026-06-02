import Link from "next/link";
import { prisma } from "@/lib/db";
import { createChild } from "../actions";
import ChildForm from "../ChildForm";
import { requireUser } from "@/lib/auth";
import { parseServiceTypes, parseSlots } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function NewChildPage() {
  const user = await requireUser();
  const centerId = user.centerId ?? -1;

  const center = await prisma.center.findUnique({
    where: { id: centerId },
    select: { serviceTypes: true, slots: true, defaultUnit: true },
  });

  const serviceTypes = parseServiceTypes(center?.serviceTypes);
  const slots = parseSlots(center?.slots);
  const defaultUnit = center?.defaultUnit ?? 60000;

  return (
    <>
      <div className="section-head">
        <div>
          <h2>아동 등록</h2>
          <p>본인 담당 아동을 등록하세요. 자동으로 본인에게 배정됩니다.</p>
        </div>
        <Link className="btn btn-ghost" href="/children">← 목록</Link>
      </div>

      <div className="card">
        <div className="card-body">
          <ChildForm
            therapists={[]}
            serviceTypes={serviceTypes}
            slots={slots}
            defaultUnit={defaultUnit}
            therapistName={user.name}
            action={createChild}
            submitLabel="등록"
            canSetWaiting
          />
        </div>
      </div>
    </>
  );
}
