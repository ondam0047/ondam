import { NextResponse, type NextRequest } from "next/server";

// 미들웨어는 Edge runtime — DB 조회는 못 함. 쿠키 존재 여부만 확인.
// 진짜 세션 검증은 페이지/라우트에서 getCurrentUser() 로.
const COOKIE_NAME = "ondam_session";
const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }
  const hasCookie = !!req.cookies.get(COOKIE_NAME);
  if (!hasCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // 정적 자산, _next, api 일부, 공개 정적 폴더(forms 미리보기) 제외
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|ondam-logo.png|api/auth|forms/).*)",
  ],
};
