import { requireUser } from "@/lib/auth";
import MedicalDisclaimer from "./MedicalDisclaimer";

// 바로툴 섹션 공통 레이아웃 — 로그인한 모든 사용자에게 공개.
// 모든 모듈 화면 하단에 비의료기기 면책 고정. (로그인·센터 확인은 상위 (app)/layout 에서 처리)
export default async function ToolsLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <>
      {children}
      <MedicalDisclaimer />
    </>
  );
}
