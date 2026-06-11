import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

// 기록지 양식 매핑 — 운영 검증 단계, 베타 운영 계정 전용.
const OP = (process.env.BETA_ADMIN_EMAIL ?? "yj2000102@gmail.com").toLowerCase();

export default async function FormsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.email.toLowerCase() !== OP) redirect("/dashboard");
  return <>{children}</>;
}
