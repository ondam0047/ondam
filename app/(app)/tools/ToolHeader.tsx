import Link from "next/link";

// 바로툴 개별 모듈 화면 공통 헤더 — 뒤로가기 + 제목/설명.
export default function ToolHeader({
  title, subtitle,
}: {
  title: string; subtitle?: string;
}) {
  return (
    <div style={{ marginBottom: 22 }}>
      <Link
        href="/tools"
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          fontSize: 13, color: "var(--text-mute)", textDecoration: "none",
          marginBottom: 10,
        }}
      >
        ← 바로툴
      </Link>
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>{title}</h2>
      {subtitle && (
        <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--text-soft)", lineHeight: 1.6, wordBreak: "keep-all" }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
