import { redirect } from "next/navigation";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { getCurrentUser, generateApprovalCode } from "@/lib/auth";
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
      user = await getCurrentUser(); // 갱신된 정보 다시 로드
      if (!user) redirect("/login");
    }
  }

  return (
    <div className="app">
      <Sidebar user={user} />
      <div className="main">
        <Topbar />
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
