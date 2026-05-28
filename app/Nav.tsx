"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/schedule", label: "① 일정표" },
  { href: "/record", label: "② 기록지" },
  { href: "/children", label: "아동 관리" },
  { href: "/therapists", label: "치료사 관리" },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="nav">
      {ITEMS.map((it) => {
        const active = pathname === it.href || pathname.startsWith(it.href + "/");
        return (
          <Link key={it.href} href={it.href} className={active ? "active" : ""}>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
