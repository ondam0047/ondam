import type { NextConfig } from "next";

// 아동 PII 를 다루는 사적 도구 — 기본 보안 헤더 적용.
// CSP 는 인라인 스타일/스크립트 호환성 검증이 필요해 별도 작업으로 남김.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 바로툴 음성 모듈에서 마이크 사용 → 동일 출처(self)만 허용. 카메라·위치는 계속 차단.
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
