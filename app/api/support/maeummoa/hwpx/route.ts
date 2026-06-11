import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  generateMaeummoaSheet,
  readMaeummoaTemplate,
  safeFileName,
  type MaeummoaPayload,
} from "@/lib/support-maeummoa-hwpx";

const BETA_EMAIL = (process.env.BETA_ADMIN_EMAIL ?? "yj2000102@gmail.com").toLowerCase();

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (user.email.toLowerCase() !== BETA_EMAIL) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const p = (await req.json()) as MaeummoaPayload;

  let buf: Buffer;
  try {
    const tpl = await readMaeummoaTemplate();
    buf = generateMaeummoaSheet(tpl, p);
  } catch {
    return Response.json({ error: "양식 생성 중 문제가 생겼어요." }, { status: 500 });
  }

  const base = `${safeFileName(p.student)}_${String(p.month).padStart(2, "0")}월_치료지원일지`;
  const filename = encodeURIComponent(`${base}.hwpx`);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/hwp+zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
