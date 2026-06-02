// 운영 모니터링/pm2 헬스체크용 — 인증 불필요, 민감정보 없음.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true, ts: Date.now() });
}
