import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { parseServiceTypes } from "@/lib/constants";
import ImportClient from "./ImportClient";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const user = await requireRole(["OWNER"]);
  const center = await prisma.center.findUnique({
    where: { id: user.centerId ?? -1 },
    select: { serviceTypes: true },
  });
  const serviceTypes = parseServiceTypes(center?.serviceTypes);
  return <ImportClient serviceTypes={serviceTypes} />;
}
