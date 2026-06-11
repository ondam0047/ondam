import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import MaeummoaForm from "./MaeummoaForm";

export const dynamic = "force-dynamic";

const BETA_EMAIL = (process.env.BETA_ADMIN_EMAIL ?? "yj2000102@gmail.com").toLowerCase();

export default async function MaeummoaPage() {
  const user = await requireUser();
  if (user.email.toLowerCase() !== BETA_EMAIL) redirect("/dashboard");

  return <MaeummoaForm therapist={user.name} place={user.centerName ?? ""} />;
}
