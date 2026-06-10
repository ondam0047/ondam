"use client";

// 루트 레이아웃에서 발생한 오류까지 잡는 최상위 경계. 자체 html/body 필요.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ textAlign: "center", maxWidth: 440 }}>
            <h2>문제가 생겼어요</h2>
            <p style={{ color: "#6b7280", marginTop: 8, lineHeight: 1.6 }}>
              잠시 후 다시 시도해 주세요.
            </p>
            <button
              onClick={() => reset()}
              style={{
                marginTop: 18, padding: "11px 20px", background: "#1F4E91", color: "#fff",
                border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer",
              }}
            >
              다시 시도
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
