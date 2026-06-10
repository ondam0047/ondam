import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import MedicalDisclaimer from "./MedicalDisclaimer";

// 운영 검증 단계 — 바로툴은 베타 운영 계정에서만 접근. (메뉴도 운영자에게만 노출)
// 일반 사용자에게 공개할 때 이 가드를 제거하면 됨.
const BETA_ADMIN_EMAIL = (process.env.BETA_ADMIN_EMAIL ?? "yj2000102@gmail.com").toLowerCase();

// 바로툴 섹션 공통 레이아웃 — 접근 가드 + 모든 모듈 화면 하단에 비의료기기 면책 고정.
// (로그인·센터 확인은 상위 (app)/layout 에서 이미 처리)
export default async function ToolsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.email.toLowerCase() !== BETA_ADMIN_EMAIL) redirect("/dashboard");
  return (
    <>
      {children}
      <MedicalDisclaimer />
    </>
  );
}
