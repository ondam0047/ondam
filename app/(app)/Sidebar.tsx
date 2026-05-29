"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
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
const OWNER_ITEMS = [
  { href: "/dashboard",  label: "대시보드",      icon: IC.dash },
  { href: "/schedule",   label: "일정표",        icon: IC.calendar },
  { href: "/record",     label: "기록지",        icon: IC.doc },
  { href: "/children",   label: "아동 관리",     icon: IC.user },
  { href: "/therapists", label: "치료사 관리",   icon: IC.team },
  { href: "/import",     label: "엑셀 가져오기", icon: IC.upload },
];
const ADMIN_ITEMS = [
  { href: "/dashboard",  label: "대시보드",      icon: IC.dash },
  { href: "/children",   label: "아동 관리",     icon: IC.user },
  { href: "/therapists", label: "치료사 관리",   icon: IC.team },
  { href: "/import",     label: "엑셀 가져오기", icon: IC.upload },
];
const THERAPIST_ITEMS = [
  { href: "/dashboard",  label: "대시보드",  icon: IC.dash },
  { href: "/schedule",   label: "일정표",    icon: IC.calendar },
  { href: "/record",     label: "기록지",    icon: IC.doc },
  { href: "/children",   label: "내 아동",   icon: IC.user },
];

const ROLE_LABEL: Record<string, string> = {
  OWNER: "원장",
  ADMIN: "행정",
  THERAPIST: "치료사",
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
        <Image src="/ondam-logo.png" alt="온담 로고" width={36} height={36} />
        <div className="brand-name">
          <span className="ko">{user.centerName ?? "온담"}</span>
          <span className="en">통합관리</span>
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
