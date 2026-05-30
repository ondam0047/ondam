import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  createSession, hashPassword, getCurrentUser,
  generateApprovalCode,
} from "@/lib/auth";
import BrandMark from "../BrandMark";

export const dynamic = "force-dynamic";

// 1인 사물함 가입 — 본인 명의로 가입하면 본인 전용 공간이 자동 생성됨.
// 내부 구조상 Center 가 만들어지지만 UI 에선 노출 안 함.
async function signupSolo(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!name || !email || password.length < 6) {
    redirect("/signup?err=" + encodeURIComponent("이름·이메일·비밀번호(6자 이상)를 모두 입력해주세요"));
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    redirect("/signup?err=" + encodeURIComponent("이미 사용 중인 이메일이에요"));
  }

  // 내부 Center 자동 생성 (이름 = 사용자 이름 그대로). UI 에는 안 보이지만 데이터 격리에 사용.
  const approvalCode = await generateApprovalCode();
  const center = await prisma.center.create({
    data: { name, approvalCode },
  });
  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await hashPassword(password),
      role: "OWNER",
      active: true,
      centerId: center.id,
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

  return (
    <div className="card">
      <div style={{ padding: "28px 26px 8px", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center" }}><BrandMark size={56} /></div>
        <h2 style={{ marginTop: 12, fontSize: 18 }}>바로일지 시작하기</h2>
        <div className="sub-mute" style={{ marginTop: 4 }}>
          본인 명의로 가입하면 본인만 보는 사물함이 만들어져요.
        </div>
      </div>

      <div className="card-body">
        {sp.err && <div className="flash warn" style={{ marginBottom: 12 }}>{sp.err}</div>}

        <form action={signupSolo}>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>이름<span className="req">*</span></label>
            <input className="input" name="name" required placeholder="치료사 본인 이름" />
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>이메일<span className="req">*</span></label>
            <input className="input" name="email" type="email" required />
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>비밀번호 <span className="sub-mute">(6자 이상)</span></label>
            <input className="input" name="password" type="password" required minLength={6} />
          </div>
          <button className="btn btn-primary" type="submit" style={{ width: "100%", justifyContent: "center" }}>
            가입하고 바로 시작
          </button>
          <div className="tip" style={{ marginTop: 14 }}>
            💡 가입 즉시 본인만 보는 사물함이 열려요. 다른 사람은 절대 못 봅니다.
          </div>
        </form>

        <div style={{ marginTop: 14, textAlign: "center", fontSize: 12.5 }}>
          <Link href="/login" style={{ color: "var(--text-mute)" }}>← 로그인으로</Link>
        </div>
      </div>
    </div>
  );
}
