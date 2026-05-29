import { requireRole } from "@/lib/auth";
import ImportClient from "./ImportClient";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await requireRole(["OWNER", "ADMIN"]);
  return <ImportClient />;
}
