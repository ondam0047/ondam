"use client";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ minHeight: "50vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 440 }}>
        <h2 style={{ marginTop: 8 }}>문제가 생겼어요</h2>
        <p style={{ color: "#6b7280", marginTop: 8, lineHeight: 1.6 }}>
          잠시 후 다시 시도해 주세요. 계속 같은 화면이 보이면 새로고침해 주세요.
        </p>
        <div style={{ marginTop: 18, display: "flex", gap: 8, justifyContent: "center" }}>
          <button
            onClick={() => reset()}
            style={{
              padding: "11px 20px", background: "var(--primary, #1F4E91)", color: "#fff",
              border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer",
            }}
          >
            다시 시도
          </button>
          <a
            href="/dashboard"
            style={{
              padding: "11px 20px", background: "#fff", color: "var(--primary, #1F4E91)",
              border: "1px solid #d1d5db", borderRadius: 10, fontWeight: 700, textDecoration: "none",
            }}
          >
            대시보드로
          </a>
        </div>
      </div>
    </div>
  );
}
