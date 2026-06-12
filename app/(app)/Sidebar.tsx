"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 인라인 브랜드 마크 (next/image 가 그라디언트 SVG 못 띄우는 케이스 회피)
function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width={size} height={size} style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="sb-bar" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#6FA1E5" />
          <stop offset="100%" stopColor="#1F4E91" />
        </linearGradient>
        <linearGradient id="sb-leaf" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#9FD6C0" />
          <stop offset="100%" stopColor="#6FB59C" />
        </linearGradient>
      </defs>
      <rect x="12" y="32" width="36" height="11" rx="5.5" fill="url(#sb-bar)" />
      <rect x="10" y="52" width="46" height="11" rx="5.5" fill="url(#sb-bar)" />
      <rect x="8" y="72" width="56" height="11" rx="5.5" fill="url(#sb-bar)" />
      <path d="M48 36 C48 22, 42 16, 38 16 C38 22, 42 32, 48 36 Z" fill="url(#sb-leaf)" />
      <path d="M52 36 C52 22, 58 16, 62 16 C62 22, 58 32, 52 36 Z" fill="url(#sb-leaf)" />
      <path d="M65 32 L74 42 L92 18" stroke="#3D7CC9" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
import type { SessionUser } from "@/lib/auth";

const Icon = ({ d, size = 16 }: { d: string; size?: number }) => (
  <svg
    className="icon" width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.75"
    strokeLinecap="round" strokeLinejoin="round"
  >
    <path d={d} />
  </svg>
);

const IC = {
  dash:     "M3 3h7v9H3z M14 3h7v5h-7z M14 12h7v9h-7z M3 16h7v5H3z",
  calendar: "M8 2v3 M16 2v3 M3 9h18 M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2",
  doc:      "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M9 13h6 M9 17h6",
  user:     "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  team:     "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M23 21v-2a4 4 0 0 0-3-3.87",
  upload:   "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12",
  logout:   "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
};

// 역할별로 보이는 메뉴 분리
const COG_ICON = "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.07a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.07a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z";
const HELP_ICON = "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3 M12 17h.01";

const CHECK_ICON = "M9 12l2 2 4-4 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z";
const DOWNLOAD_ICON = "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3";
// 바로툴(음성·학습 모듈) — 사운드 이퀄라이저 막대
const WAVE_ICON = "M4 9v6 M8 5v14 M12 8v8 M16 4v16 M20 10v4";

type NavItem = { href: string; label: string; icon: string; tour?: string };
type NavGroup = { label?: string; items: NavItem[] };

// 사용 빈도로 2계층화: '핵심 작업'(매일) vs '도구'(가끔). 신규 사용자가
// 무엇부터 할지 헷갈리지 않도록 평면 메뉴를 그룹·라벨로 정리.
const NAV_GROUPS: NavGroup[] = [
  { items: [
    { href: "/dashboard", label: "대시보드", icon: IC.dash,        tour: "dash"  },
    { href: "/month",     label: "이번 달",  icon: DOWNLOAD_ICON,  tour: "month" },
  ] },
  { label: "핵심 작업", items: [
    { href: "/schedule", label: "일정표",  icon: IC.calendar, tour: "sched" },
    { href: "/record",   label: "기록지",  icon: IC.doc,      tour: "rec"   },
    { href: "/children", label: "내 아동", icon: IC.user,     tour: "child" },
  ] },
  { label: "도구", items: [
    { href: "/approval-check", label: "결제 겹침 찾기", icon: CHECK_ICON, tour: "appr" },
  ] },
  { items: [
    { href: "/center", label: "내 설정",        icon: COG_ICON,  tour: "set" },
    { href: "/forms",  label: "우리 센터 양식", icon: IC.doc },
    { href: "/guide",  label: "도움말",         icon: HELP_ICON, tour: "help" },
  ] },
];

const BETA_GEAR_ICON = "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z";
const SUPPORT_ICON = "M9 2h6a1 1 0 0 1 1 1v1h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V3a1 1 0 0 1 1-1z M9 4v2h6V4 M8 11h8 M8 15h5";

// 로그아웃 시 일정표·기록지 임시 작성본 등 작업 캐시를 비움.
// (환영 모달·투어 1회 표시 기록은 사용자별이라 유지)
function clearWorkCache() {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (
        k &&
        k.startsWith("baroilji_") &&
        !k.startsWith("baroilji_welcome_seen_") &&
        !k.startsWith("baroilji_tour_done_")
      ) {
        toRemove.push(k);
      }
    }
    for (const k of toRemove) localStorage.removeItem(k);
  } catch {}
}

export default function Sidebar({ user, isBetaAdmin = false }: { user: SessionUser; isBetaAdmin?: boolean }) {
  const pathname = usePathname();
  // 그룹·내부 배열 복사(원본 불변 유지)
  const groups: NavGroup[] = NAV_GROUPS.map((g) => ({ ...g, items: [...g.items] }));
  // 운영자 전용 메뉴는 '운영' 그룹으로 묶어 하단(도움말 그룹) 바로 위에 삽입.
  if (isBetaAdmin) {
    const opItems: NavItem[] = [{ href: "/tools", label: "바로툴", icon: WAVE_ICON, tour: "tools" }];
    // 기타지원사업 — yj2000102 운영자 계정에만.
    if (user.email.toLowerCase() === "yj2000102@gmail.com") {
      opItems.push({ href: "/support", label: "기타지원사업", icon: SUPPORT_ICON });
    }
    opItems.push({ href: "/admin/beta", label: "베타 운영", icon: BETA_GEAR_ICON });
    groups.splice(groups.length - 1, 0, { label: "운영", items: opItems });
  }
  const initial = user.name.charAt(0) || "?";

  return (
    <aside className="sidebar">
      <Link href="/dashboard" className="brand" style={{ textDecoration: "none", color: "inherit" }}>
        <BrandMark size={36} />
        <div className="brand-name">
          <span className="ko">{user.centerName ?? "바로일지"}</span>
          <span className="en">치료사의 1인 사물함</span>
        </div>
      </Link>

      {groups.map((group, gi) => (
        <div key={gi}>
          {group.label ? (
            <div className="nav-section" style={{ marginTop: gi > 0 ? 14 : 0 }}>{group.label}</div>
          ) : gi > 0 ? (
            <div style={{ height: 1, background: "var(--border)", margin: "10px 14px" }} />
          ) : null}
          {group.items.map((it) => {
            const active = pathname === it.href || pathname.startsWith(it.href + "/");
            return (
              <Link
                key={it.href}
                href={it.href}
                className={"nav-item" + (active ? " active" : "")}
                data-tour={it.tour || undefined}
              >
                <Icon d={it.icon} />
                <span>{it.label}</span>
              </Link>
            );
          })}
        </div>
      ))}

      <form action="/api/auth/logout" method="post" style={{ marginTop: 12 }}>
        <button type="submit" className="nav-item" style={{ cursor: "pointer" }} onClick={clearWorkCache}>
          <Icon d={IC.logout} />
          <span>로그아웃</span>
        </button>
      </form>

      <div className="sidebar-footer">
        <div className="avatar">{initial}</div>
        <div className="who">
          <div className="name">{user.name}</div>
          <div className="role">선생님</div>
        </div>
      </div>
    </aside>
  );
}
