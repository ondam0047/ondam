import MedicalDisclaimer from "./MedicalDisclaimer";

// 바로툴 섹션 공통 레이아웃 — 모든 모듈 화면 하단에 비의료기기 면책을 고정.
// (로그인·센터 확인은 상위 (app)/layout 에서 이미 처리)
export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <MedicalDisclaimer />
    </>
  );
}
