import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <div style={{ fontSize: 48, fontWeight: 800, color: "var(--primary, #1F4E91)" }}>404</div>
        <h2 style={{ marginTop: 8 }}>페이지를 찾을 수 없어요</h2>
        <p style={{ color: "#6b7280", marginTop: 8, lineHeight: 1.6 }}>
          주소가 바뀌었거나 삭제된 페이지일 수 있어요.
        </p>
        <Link
          href="/dashboard"
          style={{
            display: "inline-block", marginTop: 18, padding: "11px 20px",
            background: "var(--primary, #1F4E91)", color: "#fff", borderRadius: 10,
            fontWeight: 700, textDecoration: "none",
          }}
        >
          대시보드로 가기
        </Link>
      </div>
    </div>
  );
}
