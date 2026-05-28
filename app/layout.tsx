import type { Metadata } from "next";
import "./globals.css";
import Nav from "./Nav";

export const metadata: Metadata = {
  title: "온담말언어발달센터 통합관리",
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
      <body>
        <div className="wrap">
          <div className="app-chrome">
            <div className="topbar">
              <h1>온담말언어발달센터</h1>
              <span className="tag">통합관리</span>
            </div>
            <div className="sub">
              일정표 생성 → 회기 진행 → 엑셀 업로드 → 기록지 자동완성
            </div>
            <Nav />
          </div>
          {children}
        </div>
      </body>
    </html>
  );
}
