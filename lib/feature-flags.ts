// 새 UX 노출 여부.
// 2026-06-23 전체 공개(GA) — 모든 사용자에게 노출하므로 항상 true.
// 다시 특정 계정으로 제한하려면 이메일 화이트리스트 로직으로 되돌리면 됨.
export function isBetaUx(_email?: string | null): boolean {
  return true;
}
