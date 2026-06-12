"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// 키워드 → 탭(페이지) 빠른 이동. 입력하면 매칭되는 탭이 드롭다운으로 뜨고 Enter/클릭으로 이동.
type Target = { label: string; href: string; kw: string[]; desc?: string };
const TARGETS: Target[] = [
  { label: "이번 달", href: "/month", desc: "이 달 일정·기록지 현황·일괄 받기", kw: ["마감", "다운로드", "zip", "이번달", "월", "현황", "한꺼번에"] },
  { label: "일정표", href: "/schedule", desc: "회기 일정 생성·출력", kw: ["일정", "회기", "캘린더", "스케줄", "달력", "본인부담금", "본부", "단가", "관리번호", "공휴일", "보강", "제공일", "주기", "요일"] },
  { label: "월간 보기", href: "/timetable", desc: "저장된 일정 월간 달력", kw: ["시간표", "월간", "달력"] },
  { label: "기록지", href: "/record", desc: "회기 기록·결과 작성·출력", kw: ["일지", "결과", "기록", "작성", "승인번호", "소급", "별지", "엑셀", "서비스제공내역", "총평", "의견", "결제일"] },
  { label: "내 아동", href: "/children", desc: "아동 등록·본인부담금·단가·시간대 기본값", kw: ["아동", "학생", "등록", "명단", "엑셀", "본인부담금", "본부", "단가", "회당단가", "관리번호", "생년월일", "목표", "회기수", "반복요일", "시간대", "대기"] },
  { label: "결제 겹침 찾기", href: "/approval-check", desc: "결제 시간 겹침·소급 점검", kw: ["승인", "결제", "겹침", "점검", "바우처", "소급", "소급결제", "내역", "엑셀", "서비스제공내역"] },
  { label: "바로툴", href: "/tools", desc: "음성·말 모듈", kw: ["음성", "mpt", "daf", "스펙트로그램", "유창성", "말속도", "음도", "강도", "도구", "/s/", "지연청각"] },
  { label: "우리 센터 양식", href: "/forms", desc: "센터 기록지·일정표 업로드·매핑", kw: ["양식", "매핑", "hwpx", "업로드", "서식", "제공기관명", "별지", "결과표"] },
  { label: "기타지원사업", href: "/support", desc: "교육청 치료지원(마음모아) 일지", kw: ["마음모아", "교육청", "치료지원", "지원사업", "운영"] },
  { label: "내 설정", href: "/center", desc: "센터·단가·시간대·치료사 종류·내 정보", kw: ["설정", "센터", "센터명", "단가", "기본단가", "시간대", "회기시간", "프로필", "이름", "치료사종류", "서비스종류", "제공기관명", "전화", "주소"] },
  { label: "도움말", href: "/guide", desc: "사용 설명서", kw: ["가이드", "사용법", "help", "faq", "도움"] },
];

export default function DashboardSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurT = useRef<number | null>(null);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return TARGETS.filter(
      (t) =>
        t.label.toLowerCase().replace(/\s/g, "").includes(s.replace(/\s/g, "")) ||
        t.kw.some((k) => k.includes(s) || s.includes(k)),
    ).slice(0, 7);
  }, [q]);

  const go = (href?: string) => {
    if (!href) return;
    setOpen(false);
    setQ("");
    router.push(href);
  };

  return (
    <div style={{ position: "relative", marginBottom: 16 }}>
      <input
        className="input"
        value={q}
        placeholder="🔎 어디로 갈까요? — 일정, 기록지, 양식, 결제, 이번 달… 키워드로 탭 이동"
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => q && setOpen(true)}
        onBlur={() => { blurT.current = window.setTimeout(() => setOpen(false), 150); }}
        onKeyDown={(e) => {
          if (!open || matches.length === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); go(matches[active]?.href); }
          else if (e.key === "Escape") { setOpen(false); }
        }}
        style={{ fontSize: 14, padding: "12px 14px" }}
      />
      {open && matches.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 30,
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden",
        }}>
          {matches.map((t, i) => (
            <button
              key={t.href}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); go(t.href); }}
              onMouseEnter={() => setActive(i)}
              style={{
                display: "flex", alignItems: "baseline", gap: 10, width: "100%", textAlign: "left",
                padding: "10px 14px", border: "none", cursor: "pointer",
                background: i === active ? "var(--primary-soft)" : "transparent",
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{t.label}</span>
              {t.desc && <span className="sub-mute" style={{ fontSize: 12 }}>{t.desc}</span>}
              <span style={{ marginLeft: "auto", color: "var(--primary)", fontSize: 13 }}>→</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
