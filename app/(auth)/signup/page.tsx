import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  createSession, hashPassword, getCurrentUser,
  generateApprovalCode,
} from "@/lib/auth";
import { THERAPIST_TYPES, THERAPIST_TO_SERVICE, DEFAULT_SERVICE_TYPES } from "@/lib/constants";
import BrandMark from "../BrandMark";

export const dynamic = "force-dynamic";

// 베타 잠금 — BETA_ACCESS_CODE 환경변수 설정 시 가입 시 동일 코드 입력 필수.
// 비어있으면 누구나 가입 가능 (정식 출시 모드).
function getBetaCode(): string | null {
  const v = (process.env.BETA_ACCESS_CODE ?? "").trim();
  return v.length > 0 ? v : null;
}

async function signupSolo(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const therapistType = String(formData.get("therapistType") ?? "").trim();
  const centerName = String(formData.get("centerName") ?? "").trim();
  const inviteCode = String(formData.get("inviteCode") ?? "").trim().toUpperCase();

  if (!name || !email || password.length < 6) {
    redirect("/signup?err=" + encodeURIComponent("이름·이메일·비밀번호(6자 이상)를 모두 입력해주세요"));
  }
  if (!therapistType) {
    redirect("/signup?err=" + encodeURIComponent("치료사 종류를 선택해주세요"));
  }
  if (!THERAPIST_TYPES.includes(therapistType as typeof THERAPIST_TYPES[number])) {
    redirect("/signup?err=" + encodeURIComponent("치료사 종류가 잘못됐어요"));
  }

  // 베타 코드 검증
  const betaCode = getBetaCode();
  if (betaCode && inviteCode !== betaCode.toUpperCase()) {
    redirect("/signup?err=" + encodeURIComponent("초대코드가 맞지 않아요. 운영자에게 문의하세요."));
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    redirect("/signup?err=" + encodeURIComponent("이미 사용 중인 이메일이에요"));
  }

  // 치료사 종류에 맞는 기본 서비스 종류 설정
  const primaryService = THERAPIST_TO_SERVICE[therapistType];
  const defaultServices = primaryService
    ? [primaryService, ...DEFAULT_SERVICE_TYPES.filter((s) => s !== primaryService)].join(",")
    : DEFAULT_SERVICE_TYPES.join(",");

  // 내부적으로 Center 자동 생성 (사물함 컨테이너 역할).
  // 사용자가 센터명을 안 적으면 본인 이름으로.
  const workplaceName = centerName || name;
  const approvalCode = await generateApprovalCode();
  const center = await prisma.center.create({
    data: {
      name: workplaceName,
      approvalCode,
      serviceTypes: defaultServices,
    },
  });
  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await hashPassword(password),
      role: "OWNER",
      active: true,
      centerId: center.id,
      therapistType,
    },
  });
  await createSession(user.id);
  redirect("/dashboard");
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const sp = await searchParams;
  if (await getCurrentUser()) redirect("/dashboard");
  const betaLocked = !!getBetaCode();

  return (
    <div className="card">
      <div style={{ padding: "28px 26px 8px", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center" }}><BrandMark size={56} /></div>
        <h2 style={{ marginTop: 12, fontSize: 18 }}>바로일지 시작하기</h2>
        <div className="sub-mute" style={{ marginTop: 4 }}>
          본인 명의로 가입하면 본인만 보는 사물함이 열려요.
        </div>
      </div>

      <div className="card-body">
        {sp.err && <div className="flash warn" style={{ marginBottom: 12 }}>{sp.err}</div>}

        {betaLocked && (
          <div className="tip" style={{ marginBottom: 14 }}>
            🔒 <b>베타 테스트 중</b>입니다. 운영자가 알려드린 <b>초대코드</b>가 필요해요.
          </div>
        )}

        <form action={signupSolo}>
          {betaLocked && (
            <div className="field" style={{ marginBottom: 12 }}>
              <label>초대코드<span className="req">*</span></label>
              <input
                className="input"
                name="inviteCode"
                required
                style={{ fontFamily: "monospace", letterSpacing: "0.1em", textTransform: "uppercase" }}
                placeholder="운영자에게 받은 코드"
              />
            </div>
          )}
          <div className="field" style={{ marginBottom: 12 }}>
            <label>이름<span className="req">*</span></label>
            <input className="input" name="name" required placeholder="본인 이름" />
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>치료사 종류<span className="req">*</span></label>
            <select className="select" name="therapistType" required defaultValue="">
              <option value="" disabled>— 선택 —</option>
              {THERAPIST_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <div className="sub-mute" style={{ fontSize: 11, marginTop: 4 }}>
              본인 주력 분야를 선택. 일정표·기록지에 기본 서비스로 자동 채워져요.
            </div>
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>근무 센터명 <span className="sub-mute">(선택)</span></label>
            <input
              className="input"
              name="centerName"
              placeholder="예: 온담말언어발달센터 — 비우면 본인 이름으로"
            />
            <div className="sub-mute" style={{ fontSize: 11, marginTop: 4 }}>
              일정표·기록지의 '제공기관명' 기본값으로 사용돼요. 추후 변경 가능.
            </div>
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>이메일<span className="req">*</span></label>
            <input className="input" name="email" type="email" required />
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>비밀번호 <span className="sub-mute">(6자 이상)</span></label>
            <input className="input" name="password" type="password" required minLength={6} />
          </div>
          <button className="btn btn-primary" type="submit" style={{ width: "100%", justifyContent: "center" }}>
            가입하고 바로 시작
          </button>
          <div className="tip" style={{ marginTop: 14 }}>
            💡 가입 즉시 본인만 보는 사물함이 열립니다. 다른 사람은 절대 못 봐요.
          </div>
        </form>

        <div style={{ marginTop: 14, textAlign: "center", fontSize: 12.5 }}>
          <Link href="/login" style={{ color: "var(--text-mute)" }}>← 로그인으로</Link>
        </div>
      </div>
    </div>
  );
}
