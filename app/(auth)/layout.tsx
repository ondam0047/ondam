// 로그인·회원가입 화면 — 사이드바·탑바 없이 가운데 카드만
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      background: "var(--bg)",
      padding: 24,
    }}>
      <div style={{ width: "100%", maxWidth: 460 }}>
        {children}
      </div>
    </div>
  );
}
