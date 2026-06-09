// 운영자용 비밀번호 재설정 도구 (베타: 자가 초기화 없음).
// 사용법 (서버 /opt/baroilji 에서):
//   set -a; . ./.env; set +a
//   npx tsx scripts/reset-password.ts <이메일> <새비밀번호>
// 예: npx tsx scripts/reset-password.ts teacher@example.com NewPass1234!

import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

(async () => {
  const [email, pw] = process.argv.slice(2);
  if (!email || !pw) {
    console.error("사용법: npx tsx scripts/reset-password.ts <이메일> <새비밀번호>");
    process.exit(1);
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error("❌ 해당 이메일 사용자가 없습니다:", email);
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(pw, 10);
  await prisma.user.update({ where: { email }, data: { passwordHash } });
  console.log(`✓ 비밀번호 변경 완료 — ${email} (${user.name})`);
  process.exit(0);
})().catch((e) => {
  console.error("오류:", e?.message ?? e);
  process.exit(1);
});
