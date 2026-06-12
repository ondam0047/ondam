import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import MaeummoaForm from "./MaeummoaForm";

export const dynamic = "force-dynamic";

const OWNER_EMAIL = "yj2000102@gmail.com"; // 기타지원사업 전용 운영자 계정

export default async function MaeummoaPage() {
  const user = await requireUser();
  if (user.email.toLowerCase() !== OWNER_EMAIL) redirect("/dashboard");

  const rows = await prisma.supportRecord.findMany({
    where: { ownerUserId: user.id, program: "maeummoa" },
    orderBy: { updatedAt: "desc" },
    select: { id: true, student: true, payload: true, updatedAt: true },
  });
  const saved = rows.map((r) => ({
    id: r.id,
    student: r.student,
    updatedAt: r.updatedAt.toISOString().slice(0, 10),
    payload: r.payload,
  }));

  return <MaeummoaForm therapist={user.name} place={user.centerName ?? ""} saved={saved} />;
}
