import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "온담 말·언어 연구소 통합관리",
  description: "발달재활서비스 일정표·기록지 자동화 프로그램",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Grammarly·LanguageTool 등 브라우저 확장이 <body> 에 data-* 속성을
    // 주입하면서 hydration 경고가 뜸. 기능엔 영향 없지만 콘솔이 시끄러워서 무시.
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.css"
        />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
