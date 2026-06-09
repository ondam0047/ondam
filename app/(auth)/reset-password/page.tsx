import Link from "next/link";
import { redirect } from "next/navigation";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import BrandMark from "../BrandMark";

export const dynamic = "force-dynamic";

function hashToken(t: string) {
  return createHash("sha256").update(t).digest("hex");
}

async function doReset(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const password2 = String(formData.get("password2") ?? "");
  const back = `/reset-password?token=${encodeURIComponent(token)}`;
  if (password.length < 6) redirect(`${back}&err=${encodeURIComponent("비밀번호는 6자 이상이어야 해요")}`);
  if (password !== password2) redirect(`${back}&err=${encodeURIComponent("두 비밀번호가 일치하지 않아요")}`);

  const pr = await prisma.passwordReset.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!pr || pr.usedAt || pr.expiresAt < new Date()) {
    redirect("/reset-password?invalid=1");
  }
  await prisma.user.update({ where: { id: pr!.userId }, data: { passwordHash: await hashPassword(password) } });
  await prisma.passwordReset.update({ where: { id: pr!.id }, data: { usedAt: new Date() } });
  redirect("/login?ok=" + encodeURIComponent("비밀번호가 변경됐어요. 새 비밀번호로 로그인하세요."));
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; err?: string; invalid?: string }>;
}) {
  const sp = await searchParams;
  const token = sp.token ?? "";

  // 토큰 유효성 사전 확인
  let valid = false;
  if (token && !sp.invalid) {
    const pr = await prisma.passwordReset.findUnique({ where: { tokenHash: hashToken(token) } });
    valid = !!pr && !pr.usedAt && pr.expiresAt >= new Date();
  }

  return (
    <div className="card">
      <div style={{ padding: "28px 26px 8px", textAlign: "center" }}>
        <BrandMark size={56} />
        <h1 style={{ fontSize: 22, fontWeight: 800, marginTop: 12 }}>비밀번호 재설정</h1>
      </div>
      <div className="card-body">
        {!valid ? (
          <>
            <div className="flash warn" style={{ marginBottom: 14 }}>
              링크가 만료됐거나 잘못됐어요. 다시 요청해 주세요. (재설정 링크는 1시간만 유효)
            </div>
            <Link href="/forgot-password" className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}>
              비밀번호 찾기 다시 하기
            </Link>
          </>
        ) : (
          <>
            {sp.err && <div className="flash warn" style={{ marginBottom: 12 }}>{sp.err}</div>}
            <form action={doReset}>
              <input type="hidden" name="token" value={token} />
              <div className="field" style={{ marginBottom: 12 }}>
                <label>새 비밀번호 (6자 이상)</label>
                <input className="input" name="password" type="password" required minLength={6} autoComplete="new-password" />
              </div>
              <div className="field" style={{ marginBottom: 14 }}>
                <label>새 비밀번호 확인</label>
                <input className="input" name="password2" type="password" required minLength={6} autoComplete="new-password" />
              </div>
              <button className="btn btn-primary" type="submit" style={{ width: "100%", justifyContent: "center" }}>
                비밀번호 변경
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
