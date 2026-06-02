import { redirect } from "next/navigation";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import WelcomeTooltip from "./WelcomeTooltip";
import SessionGuard from "./SessionGuard";
import Tour from "./Tour";
import { getCurrentUser, generateApprovalCode, getEffectiveTherapistId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureLegacyDataLinked } from "@/lib/migrate-center";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let user = await getCurrentUser();
  if (!user) redirect("/login");

  // 멀티센터 도입 전부터 있던 OWNER 계정인 경우, 기본 센터를 만들고
  // 기존 모든 데이터를 자동으로 그 센터로 묶음. 한 번만 실행.
  if (user.role === "OWNER" && user.centerId === null) {
    const centerCount = await prisma.center.count();
    if (centerCount === 0) {
      const code = await generateApprovalCode();
      const center = await prisma.center.create({
        data: { name: "내 센터", approvalCode: code },
      });
      await ensureLegacyDataLinked(center.id);
      user = await getCurrentUser();
      if (!user) redirect("/login");
    }
  }

  // 추가 안전망: OWNER 가 자기 센터에 속해있고, 시스템에 센터가 1개 뿐이면
  // centerId 가 비어있는 새 레코드(예: 옛 import API 가 만든 것) 도 묶어줌.
  // (다중센터 환경에서는 위험하므로 1개일 때만)
  if (user.role === "OWNER" && user.centerId) {
    const centerCount = await prisma.center.count();
    if (centerCount === 1) {
      await ensureLegacyDataLinked(user.centerId);
    }
  }

  // OWNER 도 본인 이름의 Therapist 레코드와 연결해서 "내 담당 아동" 필터링이 동작하게 함.
  // 한 번 연결되면 user.therapistId 가 채워져 다음번부턴 즉시 사용.
  if (user.role === "OWNER" && !user.therapistId) {
    await getEffectiveTherapistId(user);
    user = await getCurrentUser();
    if (!user) redirect("/login");
  }

  const betaEmail = process.env.BETA_ADMIN_EMAIL?.toLowerCase();
  const isBetaAdmin = !!betaEmail && user.email.toLowerCase() === betaEmail;

  return (
    <div className="app">
      <SessionGuard userId={user.id} />
      <Sidebar user={user} isBetaAdmin={isBetaAdmin} />
      <div className="main">
        <Topbar />
        <main className="content">{children}</main>
      </div>
      <WelcomeTooltip role={user.role} userId={user.id} />
      <Tour userId={user.id} role={user.role} />
    </div>
  );
}
