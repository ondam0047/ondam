import { requireUser } from "@/lib/auth";
import ApprovalCheckClient from "./ApprovalCheckClient";

export const dynamic = "force-dynamic";

export default async function ApprovalCheckPage() {
  await requireUser();
  return <ApprovalCheckClient />;
}
