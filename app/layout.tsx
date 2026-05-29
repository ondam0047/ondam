import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "온담 말·언어 연구소 통합관리",
  description: "발달재활서비스 일정표·기록지 자동화 프로그램",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
