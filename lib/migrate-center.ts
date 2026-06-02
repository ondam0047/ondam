// 단발성 데이터 마이그레이션: 기존 centerId=null 인 데이터를 첫 가입된
// 센터에 묶음. 멀티센터 도입 직후 한 번만 실행되면 충분.
//
// 호출 위치: 첫 로그인 후 layout 에서 한 번. 실행되더라도 중복 비용 적음.

import { prisma } from "@/lib/db";

export async function ensureLegacyDataLinked(centerId: number): Promise<void> {
  // centerId 가 비어있는 Therapist 들을 이 센터로
  await prisma.therapist.updateMany({
    where: { centerId: null },
    data: { centerId },
  });
  // centerId 가 비어있는 Child 들을 이 센터로
  await prisma.child.updateMany({
    where: { centerId: null },
    data: { centerId },
  });
  // centerId 가 비어있는 User (대부분 첫 OWNER) 들을 이 센터로
  await prisma.user.updateMany({
    where: { centerId: null },
    data: { centerId },
  });
}

// 1인 사물함 정합성 보정: 내 센터의 모든 ChildService 를 본인(치료사)에게 배정.
// 미지정(null)이거나 옛 데이터/가져오기로 다른 치료사에 잡힌 서비스를 본인으로 통일.
// (보통 0건 매칭이라 비용 적음. 멱등)
export async function ensureMyServicesAssigned(centerId: number, therapistId: number): Promise<void> {
  await prisma.childService.updateMany({
    where: {
      child: { centerId },
      OR: [{ therapistId: null }, { therapistId: { not: therapistId } }],
    },
    data: { therapistId },
  });
}
