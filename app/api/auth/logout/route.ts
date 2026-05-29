import { NextRequest, NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  await destroySession();
  // Nginx 리버스 프록시 뒤에서는 req.url 이 localhost 가 될 수 있어 X-Forwarded-* 우선 사용
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return NextResponse.redirect(`${proto}://${host}/login`, { status: 303 });
}
