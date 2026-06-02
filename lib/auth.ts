// 로그인 세션 헬퍼. 쿠키에 토큰을 두고, DB AuthSession 에서 검증.

import { cookies } from "next/headers";
import { randomBytes, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

const COOKIE_NAME = "ondam_session";
const SESSION_DAYS = 14;

export type Role = "OWNER" | "ADMIN" | "THERAPIST";

export type SessionUser = {
  id: number;
  email: string;
  name: string;
  role: Role;
  therapistId: number | null;
  centerId: number | null;
  centerName: string | null;
};

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

function newToken(): string {
  return randomBytes(32).toString("hex");
}

// 새 로그인 시 같은 user 의 기존 세션을 모두 무효화 → 단일 활성 세션 강제.
// 같은 계정을 두 사람이 동시에 쓰면 서로 자동 로그아웃 핑퐁 → 사실상 공유 불가.
export async function createSession(userId: number): Promise<string> {
  // 1) 기존 세션 다 삭제 (다른 기기에서 로그인된 상태 해제)
  await prisma.authSession.deleteMany({ where: { userId } });
  // 2) 새 세션 생성
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  await prisma.authSession.create({
    data: { token, userId, expiresAt },
  });
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
  return token;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) {
    await prisma.authSession.deleteMany({ where: { token } });
  }
  jar.delete(COOKIE_NAME);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await prisma.authSession.findUnique({
    where: { token },
    include: { user: { include: { center: true } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role as Role,
    therapistId: session.user.therapistId,
    centerId: session.user.centerId,
    centerName: (session.user.center?.name?.trim() || null),
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

// 페이지에서 호출. 권한 없으면 /dashboard 로.
export async function requireRole(allowed: Role[]): Promise<SessionUser> {
  const { redirect } = await import("next/navigation");
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
    throw new Error("unreachable"); // type narrowing
  }
  if (!allowed.includes(user.role)) {
    redirect("/dashboard");
    throw new Error("unreachable");
  }
  return user;
}

export function isAdmin(user: SessionUser): boolean {
  return user.role === "OWNER" || user.role === "ADMIN";
}

// ADMIN(행정)은 센터의 모든 ChildService 접근 가능 — 운영 관리 목적.
// OWNER·THERAPIST 는 본인 담당 ChildService 만.
export function canAccessService(
  user: SessionUser,
  service: { therapistId: number | null }
): boolean {
  if (user.role === "ADMIN") return true;
  if (user.therapistId !== null) {
    return service.therapistId === user.therapistId;
  }
  return false;
}

// 원장만 OWNER 역할 자동 부여 (첫 사용자)
export async function isFirstSignup(): Promise<boolean> {
  const count = await prisma.user.count();
  return count === 0;
}

// 6자리 영숫자 코드 (혼동되기 쉬운 0/O/1/I 제외)
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export async function generateApprovalCode(): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    }
    const exists = await prisma.center.findUnique({ where: { approvalCode: code } });
    if (!exists) return code;
  }
  throw new Error("승인코드 생성 실패");
}

// 12자리 토큰 — 일회용 초대용. 충돌이 거의 없음.
export async function generateInvitationToken(): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    let token = "";
    for (let i = 0; i < 12; i++) {
      token += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    }
    const exists = await prisma.invitation.findUnique({ where: { token } });
    if (!exists) return token;
  }
  throw new Error("초대 토큰 생성 실패");
}

// 기존 데이터 보존용: 가장 오래된 센터 (= 첫 가입자의 센터). 마이그레이션 호환.
// null centerId 인 레코드를 이 센터에 묶거나 조회할 때 사용.
export async function getDefaultCenterId(): Promise<number | null> {
  const c = await prisma.center.findFirst({ orderBy: { id: "asc" } });
  return c?.id ?? null;
}

// 사용자에게 연결된 "치료사로서의" ID 를 반환.
// - user.therapistId 가 이미 있으면 그것
// - 없으면 같은 센터에서 이름 일치하는 Therapist 찾아 연결
// - 그래도 없으면 새 Therapist 레코드 만들어 연결
// 일정표·기록지 등 "내 담당 아동" 을 필터링할 때 사용.
export async function getEffectiveTherapistId(user: SessionUser): Promise<number | null> {
  if (user.therapistId) return user.therapistId;
  if (!user.centerId) return null;

  // 이름 일치하는 활성 치료사 찾기
  let therapist = await prisma.therapist.findFirst({
    where: { centerId: user.centerId, name: user.name, active: true, user: null },
  });

  // 없으면 새로 만들기 (OWNER 가 본인 이름의 치료사 레코드가 없는 경우)
  if (!therapist) {
    therapist = await prisma.therapist.create({
      data: { centerId: user.centerId, name: user.name, active: true },
    });
  }

  // User 레코드에 연결 (다음번부터 바로 user.therapistId 사용)
  await prisma.user.update({
    where: { id: user.id },
    data: { therapistId: therapist.id },
  });

  return therapist.id;
}
