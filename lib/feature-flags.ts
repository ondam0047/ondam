// 기능 플래그 — 새 UX를 베타 계정에만 먼저 노출하고 검증 후 전체 공개.
// BETA_UX_EMAILS(쉼표구분) 우선, 없으면 BETA_ADMIN_EMAIL(운영자)로 폴백.

function betaUxEmails(): Set<string> {
  const raw = process.env.BETA_UX_EMAILS
    ?? process.env.BETA_ADMIN_EMAIL
    ?? "yj2000102@gmail.com";
  return new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

// 이 계정이 새 베타 UX 대상인지.
export function isBetaUx(email: string | null | undefined): boolean {
  if (!email) return false;
  return betaUxEmails().has(email.toLowerCase());
}
