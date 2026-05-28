"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

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
};

const ITEMS = [
  { href: "/schedule",   label: "일정표",      icon: IC.calendar },
  { href: "/record",     label: "기록지",      icon: IC.doc },
  { href: "/children",   label: "아동 관리",   icon: IC.user },
  { href: "/therapists", label: "치료사 관리", icon: IC.team },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <div className="brand">
        <Image src="/ondam-logo.png" alt="온담 로고" width={36} height={36} />
        <div className="brand-name">
          <span className="ko">온담 말·언어 연구소</span>
          <span className="en">Speech &amp; Language Lab</span>
        </div>
      </div>

      <div className="nav-section">기록지 워크플로우</div>
      {ITEMS.map((it) => {
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

      <div className="sidebar-footer">
        <div className="avatar">온</div>
        <div className="who">
          <div className="name">온담 원장</div>
          <div className="role">통합 관리</div>
        </div>
      </div>
    </aside>
  );
}
