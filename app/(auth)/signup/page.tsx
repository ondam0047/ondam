import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession, hashPassword, getCurrentUser, isFirstSignup } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function signup(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !name || password.length < 6) {
    redirect("/signup?err=" + encodeURIComponent("이메일·이름·비밀번호(6자 이상)를 모두 입력해주세요"));
  }
  // 첫 가입자만 허용 (이후 원장님이 발급)
  if (!(await isFirstSignup())) {
    redirect("/signup?err=" + encodeURIComponent("이미 등록된 계정이 있어요. 원장님께 계정 발급을 요청해주세요."));
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    redirect("/signup?err=" + encodeURIComponent("이미 사용 중인 이메일이에요"));
  }
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      role: "OWNER", // 첫 가입자는 원장
    },
  });
  await createSession(user.id);
  redirect("/dashboard");
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const sp = await searchParams;
  if (await getCurrentUser()) redirect("/dashboard");
  const firstSignup = await isFirstSignup();

  return (
    <div className="card">
      <div style={{ padding: "28px 26px 8px", textAlign: "center" }}>
        <Image src="/ondam-logo.png" alt="온담" width={56} height={56} style={{ margin: "0 auto" }} />
        <h2 style={{ marginTop: 12, fontSize: 18 }}>첫 계정 만들기</h2>
        <div className="sub-mute" style={{ marginTop: 4 }}>원장님 계정으로 등록됩니다</div>
      </div>
      <div className="card-body">
        {sp.err && <div className="flash warn" style={{ marginBottom: 12 }}>{sp.err}</div>}
        {!firstSignup && (
          <div className="flash warn" style={{ marginBottom: 12 }}>
            이미 등록된 계정이 있어요. 로그인 페이지로 가주세요.
          </div>
        )}
        <form action={signup}>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>이름</label>
            <input className="input" name="name" required />
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>이메일</label>
            <input className="input" name="email" type="email" required />
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>비밀번호 <span className="sub-mute">(6자 이상)</span></label>
            <input className="input" name="password" type="password" required minLength={6} />
          </div>
          <button className="btn btn-primary" type="submit" style={{ width: "100%", justifyContent: "center" }} disabled={!firstSignup}>
            계정 만들기
          </button>
        </form>
        <div style={{ marginTop: 14, textAlign: "center", fontSize: 12.5 }}>
          <Link href="/login" style={{ color: "var(--text-mute)" }}>← 로그인으로 돌아가기</Link>
        </div>
      </div>
    </div>
  );
}
