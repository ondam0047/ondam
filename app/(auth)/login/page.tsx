import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession, verifyPassword, getCurrentUser } from "@/lib/auth";
import BrandMark from "../BrandMark";

export const dynamic = "force-dynamic";

async function login(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    redirect("/login?err=" + encodeURIComponent("이메일 또는 비밀번호가 일치하지 않아요"));
  }
  const ok = await verifyPassword(password, user!.passwordHash);
  if (!ok) {
    redirect("/login?err=" + encodeURIComponent("이메일 또는 비밀번호가 일치하지 않아요"));
  }
  if (!user!.active) {
    redirect("/login?err=" + encodeURIComponent("원장님 승인 대기 중이에요. 승인되면 로그인할 수 있습니다."));
  }
  await createSession(user!.id);
  redirect("/dashboard");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const sp = await searchParams;
  // 이미 로그인이면 대시보드로
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <div className="card">
      <div style={{ padding: "28px 26px 8px", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 14 }}>
          <BrandMark size={64} />
          <div style={{ textAlign: "left", lineHeight: 1 }}>
            <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em" }}>
              <span style={{ color: "#5B8FCF" }}>바로</span>
              <span style={{ color: "#B6C9DD" }}>일지</span>
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.3em", color: "#9CA3AF", marginTop: 6 }}>
              BAROILJI
            </div>
          </div>
        </div>
        <div className="sub-mute" style={{ marginTop: 14 }}>반복되는 일지 작성, 이제 바로 끝</div>
      </div>
      <div className="card-body">
        {sp.err && <div className="flash warn" style={{ marginBottom: 12 }}>{sp.err}</div>}
        <div className="tip" style={{ marginBottom: 14, wordBreak: "keep-all", lineHeight: 1.65 }}>
          처음 사용하시나요?{" "}
          <Link href="/signup" style={{ color: "var(--primary)", fontWeight: 700, whiteSpace: "nowrap" }}>
            바로 시작하기
          </Link>
          {" "}— 본인만 보는 사물함이 만들어져요.
        </div>
        <div className="tip" style={{ marginBottom: 14, wordBreak: "keep-all", lineHeight: 1.65, background: "#FFF8E1", borderColor: "#F0CD5A" }}>
          한 계정은 <b>한 기기</b>에서만 로그인 유지됩니다.
          새 기기에서 로그인하면 다른 곳은 자동 로그아웃돼요. (1인 1계정 보호)
        </div>
        <form action={login}>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>이메일</label>
            <input className="input" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>비밀번호</label>
            <input className="input" name="password" type="password" required autoComplete="current-password" />
          </div>
          <button className="btn btn-primary" type="submit" style={{ width: "100%", justifyContent: "center" }}>
            로그인
          </button>
        </form>
      </div>
    </div>
  );
}
