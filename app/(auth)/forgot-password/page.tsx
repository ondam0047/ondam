import Link from "next/link";
import { redirect } from "next/navigation";
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/mailer";
import BrandMark from "../BrandMark";

export const dynamic = "force-dynamic";

async function requestReset(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (email) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      // 이전 미사용 토큰 정리 후 새 토큰 발급 (1시간 유효)
      await prisma.passwordReset.deleteMany({ where: { userId: user.id, usedAt: null } });
      const raw = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(raw).digest("hex");
      await prisma.passwordReset.create({
        data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
      });
      const base = process.env.APP_URL ?? "https://baroilji.com";
      try {
        await sendPasswordResetEmail(email, `${base}/reset-password?token=${raw}`);
      } catch (e) {
        console.error("[forgot-password] 메일 발송 실패:", e);
      }
    }
  }
  // 가입 여부와 무관하게 동일 응답 (계정 존재 노출 방지)
  redirect("/forgot-password?sent=1");
}

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="card">
      <div style={{ padding: "28px 26px 8px", textAlign: "center" }}>
        <BrandMark size={56} />
        <h1 style={{ fontSize: 22, fontWeight: 800, marginTop: 12 }}>비밀번호 찾기</h1>
      </div>
      <div className="card-body">
        {sp.sent ? (
          <>
            <div className="flash" style={{ marginBottom: 14, background: "#E8F1FC", borderColor: "#7BAEE5" }}>
              가입된 이메일이라면 <b>재설정 링크</b>를 보냈어요. 메일함(스팸함 포함)을 확인해 주세요. (1시간 이내 유효)
            </div>
            <Link href="/login" className="btn btn-ghost" style={{ width: "100%", justifyContent: "center" }}>
              로그인으로 돌아가기
            </Link>
          </>
        ) : (
          <>
            <div className="tip" style={{ marginBottom: 14, wordBreak: "keep-all", lineHeight: 1.65 }}>
              가입하신 <b>이메일</b>을 입력하시면 비밀번호 재설정 링크를 보내드려요.
            </div>
            <form action={requestReset}>
              <div className="field" style={{ marginBottom: 14 }}>
                <label>이메일</label>
                <input className="input" name="email" type="email" required autoComplete="email" />
              </div>
              <button className="btn btn-primary" type="submit" style={{ width: "100%", justifyContent: "center" }}>
                재설정 링크 보내기
              </button>
            </form>
            <div style={{ marginTop: 14, textAlign: "center" }}>
              <Link href="/login" style={{ color: "var(--primary)", fontWeight: 600, fontSize: 13.5 }}>로그인으로 돌아가기</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
