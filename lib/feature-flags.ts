// 새 UX 노출 여부.
// 2026-06-23 전체 공개(GA) — 모든 사용자에게 노출하므로 항상 true.
// 다시 특정 계정으로 제한하려면 이메일 화이트리스트 로직으로 되돌리면 됨.
export function isBetaUx(_email?: string | null): boolean {
  return true;
}

// .hwp 자동 변환(hwp→hwpx) — 아직 베타 계정에만 노출.
// 서버에 변환기(JRE+jar)가 필요한 신기능이라, 운영자/지정 베타 계정에서만 켜고 검증 후 확대한다.
// HWP_CONVERT_EMAILS(쉼표구분) 또는 BETA_ADMIN_EMAIL 로 화이트리스트 지정(기본 yj2000102@gmail.com).
export function isHwpConvert(email?: string | null): boolean {
  if (!email) return false;
  const list = (process.env.HWP_CONVERT_EMAILS ?? process.env.BETA_ADMIN_EMAIL ?? "yj2000102@gmail.com")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}
