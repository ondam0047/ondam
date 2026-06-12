import Link from "next/link";

// 일정표 작성 ↔ 월간 보기(구 '내 시간표') 전환 탭. 두 페이지 상단에 공통 배치.
export default function ViewTabs({ active }: { active: "edit" | "month" }) {
  const tab = (href: string, key: "edit" | "month", label: string) => {
    const on = active === key;
    return (
      <Link
        href={href}
        style={{
          padding: "10px 16px",
          fontSize: 14,
          fontWeight: 800,
          textDecoration: "none",
          color: on ? "var(--primary)" : "var(--text-mute)",
          borderBottom: on ? "2px solid var(--primary)" : "2px solid transparent",
          marginBottom: -1,
        }}
      >
        {label}
      </Link>
    );
  };
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 16, borderBottom: "1px solid var(--border)" }}>
      {tab("/schedule", "edit", "일정표 작성")}
      {tab("/timetable", "month", "월간 보기")}
    </div>
  );
}
