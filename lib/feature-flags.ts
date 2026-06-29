// 새 UX 노출 여부.
// 2026-06-23 전체 공개(GA) — 모든 사용자에게 노출하므로 항상 true.
// 다시 특정 계정으로 제한하려면 이메일 화이트리스트 로직으로 되돌리면 됨.
export function isBetaUx(_email?: string | null): boolean {
  return true;
}

// .hwp 자동 변환(hwp→hwpx).
// 2026-06-29 전체 공개(GA) — 서버에 변환기(OpenJDK 21 + hwp2hwpx jar) 설치·검증 완료라 모든 로그인 사용자에게 노출.
// 다시 특정 계정으로 제한하려면 아래 이메일 화이트리스트 로직으로 되돌리면 됨(HWP_CONVERT_EMAILS / BETA_ADMIN_EMAIL).
export function isHwpConvert(_email?: string | null): boolean {
  return true;
}
