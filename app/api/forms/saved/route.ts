import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { readSection0 } from "@/lib/hwpx";
import { resolveForm } from "@/lib/record-resolver";

const OP = (process.env.BETA_ADMIN_EMAIL ?? "yj2000102@gmail.com").toLowerCase();
const KINDS = new Set(["record", "schedule"]);

// 내 저장 양식 목록(기록지/일정표 각각 다수)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (user.email.toLowerCase() !== OP) return Response.json({ error: "forbidden" }, { status: 403 });
  const forms = await prisma.recordForm.findMany({
    where: { ownerUserId: user.id },
    orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
    select: { id: true, kind: true, name: true, createdAt: true },
  });
  return Response.json({ forms });
}

// 업로드 양식 저장(자동매핑 spec 포함)
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (user.email.toLowerCase() !== OP) return Response.json({ error: "forbidden" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  const name = String(form.get("name") ?? "").trim();
  const kind = String(form.get("kind") ?? "");
  const specOverride = form.get("spec"); // 보정된 spec(JSON) — 있으면 우선
  if (!(file instanceof Blob)) return Response.json({ error: "no file" }, { status: 400 });
  if (!name) return Response.json({ error: "이름을 입력하세요." }, { status: 400 });
  if (!KINDS.has(kind)) return Response.json({ error: "종류(기록지/일정표)를 선택하세요." }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  let specJson: string;
  try {
    const xml = readSection0(buf);
    specJson = typeof specOverride === "string" && specOverride.length > 1
      ? specOverride
      : JSON.stringify(resolveForm(xml).spec);
  } catch {
    return Response.json({ error: "편집 가능한 .hwpx 가 아니에요." }, { status: 422 });
  }

  const row = await prisma.recordForm.create({
    data: { ownerUserId: user.id, kind, name: name.slice(0, 80), template: buf, spec: specJson },
    select: { id: true },
  });
  return Response.json({ ok: true, id: row.id });
}

// 양식 삭제(본인 것만)
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return Response.json({ error: "missing id" }, { status: 400 });
  await prisma.recordForm.deleteMany({ where: { id, ownerUserId: user.id } });
  return Response.json({ ok: true });
}
