import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession, verifyPassword, getCurrentUser, isFirstSignup } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function login(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) {
    redirect("/login?err=" + encodeURIComponent("이메일 또는 비밀번호가 일치하지 않아요"));
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    redirect("/login?err=" + encodeURIComponent("이메일 또는 비밀번호가 일치하지 않아요"));
  }
  await createSession(user.id);
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
  const firstSignup = await isFirstSignup();

  return (
    <div className="card">
      <div style={{ padding: "28px 26px 8px", textAlign: "center" }}>
        <Image src="/ondam-logo.png" alt="온담" width={56} height={56} style={{ margin: "0 auto" }} />
        <h2 style={{ marginTop: 12, fontSize: 18 }}>온담 말·언어 연구소</h2>
        <div className="sub-mute" style={{ marginTop: 4 }}>통합관리 로그인</div>
      </div>
      <div className="card-body">
        {sp.err && <div className="flash warn" style={{ marginBottom: 12 }}>{sp.err}</div>}
        {firstSignup && (
          <div className="tip" style={{ marginBottom: 14 }}>
            💡 처음 사용하시나요?{" "}
            <Link href="/signup" style={{ color: "var(--primary)", fontWeight: 700 }}>
              첫 계정 만들기
            </Link>
            로 시작하세요. (자동으로 원장 계정이 됩니다)
          </div>
        )}
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
        {!firstSignup && (
          <div style={{ marginTop: 14, textAlign: "center", fontSize: 12.5, color: "var(--text-mute)" }}>
            계정 발급은 원장님께 문의해 주세요.
          </div>
        )}
      </div>
    </div>
  );
}
