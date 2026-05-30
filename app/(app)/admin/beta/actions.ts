"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";

const BETA_ADMIN_EMAIL = (process.env.BETA_ADMIN_EMAIL ?? "yj2000102@gmail.com").toLowerCase();

// 베타 운영자가 가입자(베타 테스터) 를 완전히 삭제.
// 사용자 본인 + 본인 Center + 모든 Therapist/Child 데이터 삭제.
// Child 삭제 시 ChildService → Schedule/Record 가 cascade 로 같이 사라짐.
export async function deleteBetaUser(userId: number) {
  const me = await requireUser();
  if (me.email.toLowerCase() !== BETA_ADMIN_EMAIL) return;
  if (me.id === userId) return; // 본인은 못 삭제

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return;

  const centerId = target.centerId;

  if (centerId) {
    // 같은 센터의 다른 사용자가 있으면 그건 살리고 이 user 만 삭제
    const otherUserCount = await prisma.user.count({
      where: { centerId, id: { not: userId } },
    });

    if (otherUserCount > 0) {
      await prisma.user.delete({ where: { id: userId } });
    } else {
      // 1인 사물함 — 센터의 모든 데이터 삭제
      await prisma.$transaction([
        prisma.child.deleteMany({ where: { centerId } }),
        prisma.therapist.deleteMany({ where: { centerId } }),
        prisma.user.deleteMany({ where: { centerId } }),
        prisma.center.delete({ where: { id: centerId } }),
      ]);
    }
  } else {
    await prisma.user.delete({ where: { id: userId } });
  }

  revalidatePath("/admin/beta");
}
