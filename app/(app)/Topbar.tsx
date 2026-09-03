"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const META: Record<string, { title: string; crumb: string }> = {
  "/dashboard":  { title: "대시보드",    crumb: "센터 운영 현황 한눈에 보기" },
  "/month":      { title: "이번 달",      crumb: "이 달 전 아동의 일정·기록지 상태 한눈에 + 일괄 받기" },
  "/schedule":   { title: "일정표",      crumb: "아동 선택 → 회기 패턴 → 일정표 생성 → 한글파일 출력" },
  "/record":     { title: "기록지",      crumb: "아동·월 고르기 → 결과 쓰기 → 한글파일 받기 (엑셀은 선택)" },
  "/children":   { title: "내 아동",     crumb: "아동 등록 → 기본값 설정 → 일정표에서 한 번에 불러오기" },
  "/import":     { title: "엑셀 가져오기", crumb: "쓰던 엑셀 → 내 아동으로 일괄 등록" },
  "/center":     { title: "내 설정",     crumb: "내 정보·치료 영역·시간대 관리" },
  "/timetable":  { title: "월간 보기",   crumb: "일정표 · 저장된 회기를 월간 캘린더로 한눈에" },
  "/guide":      { title: "도움말",     crumb: "사용 설명서" },
  "/forms":      { title: "우리 센터 양식", crumb: "쓰던 기록지·일정표(.hwpx)를 올려두면 그 양식으로 출력돼요" },
  "/export":     { title: "일괄 다운로드", crumb: "월과 아동을 골라 저장된 일정표·기록지를 한 번에 받기" },
  "/approval-check": { title: "결제 겹침 찾기", crumb: "승인내역 엑셀을 올려 시간 겹침·소급결제 확인" },
  "/support":    { title: "기타지원사업", crumb: "바우처 외 사업(마음모아 등) 기록 관리" },
  "/tools":      { title: "바로툴",     crumb: "치료 세션에서 바로 쓰는 음성·말속도 도구" },
  "/monitor":    { title: "바로모니터", crumb: "대상자별 바로툴 결과 추이 보기" },
};

export default function Topbar() {
  const pathname = usePathname();
  const key = Object.keys(META).find((k) => pathname.startsWith(k));
  const m = key ? META[key] : { title: "바로일지", crumb: "통합관리" };

  const [navOpen, setNavOpen] = useState(false);

  // 경로 바뀌면 자동으로 메뉴 닫기
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  // 모바일 메뉴 상태를 <html data-navopen="1"> 로 노출 → CSS 가 사이드바 슬라이드 제어
  useEffect(() => {
    document.documentElement.dataset.navopen = navOpen ? "1" : "0";
    return () => {
      document.documentElement.dataset.navopen = "0";
    };
  }, [navOpen]);

  return (
    <>
      <header className="topbar">
        <button
          type="button"
          className="nav-toggle"
          aria-label="메뉴 열기"
          onClick={() => setNavOpen((v) => !v)}
        >
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M3 6h18 M3 12h18 M3 18h18" />
          </svg>
        </button>
        <div className="topbar-title">
          <h1>
            {m.title}{" "}
            <span style={{ color: "var(--text-mute)", fontWeight: 500, marginLeft: 6 }}>
              · 통합관리
            </span>
          </h1>
          <div className="crumb">{m.crumb}</div>
        </div>
        <div className="spacer" />
      </header>
      <div className="nav-backdrop" onClick={() => setNavOpen(false)} />
    </>
  );
}
