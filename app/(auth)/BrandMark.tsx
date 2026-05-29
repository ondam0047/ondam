// 로그인·회원가입에서 쓰는 인라인 로고 마크.
// next/image 가 그라디언트 SVG 를 일부 환경에서 못 띄우는 케이스가 있어서
// 인라인으로 렌더하면 어디서든 깨지지 않음.

export default function BrandMark({ size = 64 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id="bm-bar" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#6FA1E5" />
          <stop offset="100%" stopColor="#1F4E91" />
        </linearGradient>
        <linearGradient id="bm-leaf" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#9FD6C0" />
          <stop offset="100%" stopColor="#6FB59C" />
        </linearGradient>
      </defs>
      {/* 막대 3개 */}
      <rect x="12" y="32" width="36" height="11" rx="5.5" fill="url(#bm-bar)" />
      <rect x="10" y="52" width="46" height="11" rx="5.5" fill="url(#bm-bar)" />
      <rect x="8" y="72" width="56" height="11" rx="5.5" fill="url(#bm-bar)" />
      {/* 이파리 2장 */}
      <path d="M48 36 C48 22, 42 16, 38 16 C38 22, 42 32, 48 36 Z" fill="url(#bm-leaf)" />
      <path d="M52 36 C52 22, 58 16, 62 16 C62 22, 58 32, 52 36 Z" fill="url(#bm-leaf)" />
      {/* 체크 마크 */}
      <path
        d="M65 32 L74 42 L92 18"
        stroke="#3D7CC9"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
