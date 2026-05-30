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
// OWNER 원장: 행정 + 치료사 권한 모두 (직접 일정표·기록지도 작성)
// ADMIN 행정: 운영 관리만 (일정표·기록지는 직접 안 만듦)
// THERAPIST 치료사: 본인 작업만
const COG_ICON = "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.07a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.07a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z";
const GRID_ICON = "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z";
const CLOCK_ICON = "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2";
const HELP_ICON = "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3 M12 17h.01";

const OWNER_ITEMS = [
  { href: "/dashboard",    label: "대시보드",      icon: IC.dash },
  { href: "/schedule",     label: "일정표",        icon: IC.calendar },
  { href: "/record",       label: "기록지",        icon: IC.doc },
  { href: "/availability", label: "내 차단 시간",  icon: CLOCK_ICON },
  { href: "/timetable",    label: "내 시간표",     icon: GRID_ICON },
  { href: "/children",     label: "내 아동",       icon: IC.user },
  { href: "/import",       label: "엑셀 가져오기", icon: IC.upload },
  { href: "/center",       label: "내 설정",       icon: COG_ICON },
  { href: "/guide",        label: "도움말",        icon: HELP_ICON },
];
const ADMIN_ITEMS = [
  { href: "/dashboard",  label: "대시보드",      icon: IC.dash },
  { href: "/timetable",  label: "치료사 시간표", icon: GRID_ICON },
  { href: "/children",   label: "아동 관리",     icon: IC.user },
  { href: "/therapists", label: "치료사 관리",   icon: IC.team },
  { href: "/import",     label: "엑셀 가져오기", icon: IC.upload },
  { href: "/center",     label: "센터 설정",     icon: COG_ICON },
  { href: "/guide",      label: "도움말",        icon: HELP_ICON },
];
const THERAPIST_ITEMS = [
  { href: "/dashboard",    label: "대시보드",      icon: IC.dash },
  { href: "/schedule",     label: "일정표",        icon: IC.calendar },
  { href: "/record",       label: "기록지",        icon: IC.doc },
  { href: "/availability", label: "내 차단 시간",  icon: CLOCK_ICON },
  { href: "/children",     label: "내 아동",       icon: IC.user },
  { href: "/guide",        label: "도움말",        icon: HELP_ICON },
];

const ROLE_LABEL: Record<string, string> = {
  OWNER: "선생님",
  ADMIN: "행정",
  THERAPIST: "선생님",
};

export default function Sidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const items = user.role === "OWNER"
    ? OWNER_ITEMS
    : user.role === "ADMIN" ? ADMIN_ITEMS : THERAPIST_ITEMS;
  const initial = user.name.charAt(0) || "?";

  return (
    <aside className="sidebar">
      <div className="brand">
        <BrandMark size={36} />
        <div className="brand-name">
          <span className="ko">{user.centerName ?? "바로일지"}</span>
          <span className="en">바로일지 · 통합관리</span>
        </div>
      </div>

      <div className="nav-section">메뉴</div>
      {items.map((it) => {
        const active = pathname === it.href || pathname.startsWith(it.href + "/");
        return (
          <Link
            key={it.href}
            href={it.href}
            className={"nav-item" + (active ? " active" : "")}
          >
            <Icon d={it.icon} />
            <span>{it.label}</span>
          </Link>
        );
      })}

      <form action="/api/auth/logout" method="post" style={{ marginTop: 12 }}>
        <button type="submit" className="nav-item" style={{ cursor: "pointer" }}>
          <Icon d={IC.logout} />
          <span>로그아웃</span>
        </button>
      </form>

      <div className="sidebar-footer">
        <div className="avatar">{initial}</div>
        <div className="who">
          <div className="name">{user.name}</div>
          <div className="role">{ROLE_LABEL[user.role] ?? user.role}</div>
        </div>
      </div>
    </aside>
  );
}
