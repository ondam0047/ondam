import { requireUser } from "@/lib/auth";

// 기록지·일정표 양식 매핑 — 모든 사용자가 본인 양식을 올려 매핑/저장.
export default async function FormsLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <>{children}</>;
}
