"use client";

import { usePathname } from "next/navigation";

const META: Record<string, { title: string; crumb: string }> = {
  "/dashboard":  { title: "대시보드",    crumb: "센터 운영 현황 한눈에 보기" },
  "/schedule":   { title: "일정표",      crumb: "아동 선택 → 회기 패턴 → 일정표 생성 → 한글파일 출력" },
  "/record":     { title: "기록지",      crumb: "엑셀 업로드 → 아동별 회기 확인 → 상태/결과 기록 → 한글파일 출력" },
  "/children":   { title: "아동 관리",   crumb: "아동 등록 → 기본값 설정 → 일정표에서 한 번에 불러오기" },
  "/therapists": { title: "치료사 관리", crumb: "치료사 등록 → 아동 배정" },
  "/users":      { title: "사용자 관리", crumb: "치료사·행정 계정 발급 · 권한 관리" },
  "/import":     { title: "엑셀 가져오기", crumb: "센터의 기존 엑셀 → 아동·치료사 일괄 등록" },
};

export default function Topbar() {
  const pathname = usePathname();
  // 가장 잘 맞는 prefix 의 메타 사용
  const key = Object.keys(META).find((k) => pathname.startsWith(k));
  const m = key ? META[key] : { title: "온담", crumb: "통합관리" };

  return (
    <header className="topbar">
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
  );
}
