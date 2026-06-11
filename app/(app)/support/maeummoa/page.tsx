import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import MaeummoaForm from "./MaeummoaForm";

export const dynamic = "force-dynamic";

const OWNER_EMAIL = "yj2000102@gmail.com"; // 기타지원사업 전용 운영자 계정

export default async function MaeummoaPage() {
  const user = await requireUser();
  if (user.email.toLowerCase() !== OWNER_EMAIL) redirect("/dashboard");

  return <MaeummoaForm therapist={user.name} place={user.centerName ?? ""} />;
}
