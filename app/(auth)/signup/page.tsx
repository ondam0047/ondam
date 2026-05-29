import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  createSession, hashPassword, getCurrentUser,
  generateApprovalCode,
} from "@/lib/auth";
import BrandMark from "../BrandMark";

export const dynamic = "force-dynamic";

// 새 센터 + 첫 원장 동시 생성
async function signupCenter(formData: FormData) {
  "use server";
  const centerName = String(formData.get("centerName") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!centerName || !name || !email || password.length < 6) {
    redirect("/signup?err=" + encodeURIComponent("센터명·이름·이메일·비밀번호(6자 이상)를 모두 입력해주세요"));
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    redirect("/signup?err=" + encodeURIComponent("이미 사용 중인 이메일이에요"));
  }

  const approvalCode = await generateApprovalCode();
  const center = await prisma.center.create({
    data: { name: centerName, approvalCode },
  });
  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await hashPassword(password),
      role: "OWNER",
      active: true,
      centerId: center.id,
    },
  });
  await createSession(user.id);
  redirect("/dashboard?welcome=" + encodeURIComponent(approvalCode));
}

// 일회용 초대 토큰으로 가입 — 원장이 발급한 invite=TOKEN URL.
async function signupWithInvite(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!token || !name || !email || password.length < 6) {
    redirect("/signup?invite=" + token + "&err=" + encodeURIComponent("이름·이메일·비밀번호(6자 이상) 모두 필요"));
  }

  const inv = await prisma.invitation.findUnique({ where: { token } });
  if (!inv) {
    redirect("/signup?err=" + encodeURIComponent("초대 링크가 잘못됐어요. 원장님께 확인하세요."));
  }
  if (inv!.usedAt) {
    redirect("/signup?err=" + encodeURIComponent("이미 사용된 초대 링크예요. 원장님께 새 초대를 요청하세요."));
  }
  if (inv!.expiresAt < new Date()) {
    redirect("/signup?err=" + encodeURIComponent("만료된 초대 링크예요."));
  }
  const emailExists = await prisma.user.findUnique({ where: { email } });
  if (emailExists) {
    redirect("/signup?invite=" + token + "&err=" + encodeURIComponent("이미 사용 중인 이메일이에요"));
  }

  let therapistId: number | null = null;
  if (inv!.role === "THERAPIST") {
    // 같은 센터·같은 이름의 치료사 레코드가 있으면 연결
    let therapist = await prisma.therapist.findFirst({
      where: { centerId: inv!.centerId, name, user: null },
    });
    if (!therapist) {
      therapist = await prisma.therapist.create({
        data: { name, centerId: inv!.centerId },
      });
    }
    therapistId = therapist.id;
  }

  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await hashPassword(password),
      role: inv!.role,
      centerId: inv!.centerId,
      therapistId,
      active: true, // 초대받은 사람은 바로 활성
    },
  });

  // 초대 사용 처리
  await prisma.invitation.update({
    where: { id: inv!.id },
    data: { usedAt: new Date() },
  });

  await createSession(user.id);
  redirect("/dashboard");
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; err?: string; pending?: string; invite?: string }>;
}) {
  const sp = await searchParams;
  if (await getCurrentUser()) redirect("/dashboard");

  // 초대 토큰 모드 — 원장이 발급한 1회용 링크
  if (sp.invite) {
    const token = sp.invite.toUpperCase();
    const inv = await prisma.invitation.findUnique({ where: { token } });
    const valid = inv && !inv.usedAt && inv.expiresAt > new Date();

    if (!valid) {
      return (
        <div className="card">
          <div style={{ padding: "28px 26px 8px", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center" }}><BrandMark size={56} /></div>
            <h2 style={{ marginTop: 12, fontSize: 18 }}>초대 링크 오류</h2>
          </div>
          <div className="card-body" style={{ textAlign: "center" }}>
            <div className="flash warn" style={{ marginBottom: 16 }}>
              {!inv ? "이 초대 링크는 존재하지 않아요." :
                inv.usedAt ? "이미 사용된 초대 링크입니다." : "만료된 초대 링크입니다."}<br />
              원장님께 새 초대를 요청해주세요.
            </div>
            <Link className="btn btn-ghost" href="/login">로그인 화면으로</Link>
          </div>
        </div>
      );
    }

    const center = await prisma.center.findUnique({ where: { id: inv!.centerId } });
    const roleLabel = inv!.role === "ADMIN" ? "행정 선생님" : "치료사 선생님";

    return (
      <div className="card">
        <div style={{ padding: "28px 26px 8px", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center" }}><BrandMark size={56} /></div>
          <h2 style={{ marginTop: 12, fontSize: 18 }}>{center?.name} · {roleLabel} 가입</h2>
          <div className="sub-mute" style={{ marginTop: 4 }}>아래 정보를 입력하면 바로 사용할 수 있어요.</div>
        </div>
        <div className="card-body">
          {sp.err && <div className="flash warn" style={{ marginBottom: 12 }}>{sp.err}</div>}
          <form action={signupWithInvite}>
            <input type="hidden" name="token" value={token} />
            <div className="field" style={{ marginBottom: 12 }}>
              <label>이름<span className="req">*</span></label>
              <input className="input" name="name" required defaultValue={inv!.name ?? ""} />
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>이메일<span className="req">*</span></label>
              <input className="input" name="email" type="email" required defaultValue={inv!.email ?? ""} />
            </div>
            <div className="field" style={{ marginBottom: 14 }}>
              <label>비밀번호 <span className="sub-mute">(6자 이상)</span></label>
              <input className="input" name="password" type="password" required minLength={6} />
            </div>
            <button className="btn btn-primary" type="submit" style={{ width: "100%", justifyContent: "center" }}>
              가입하고 시작하기
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ padding: "28px 26px 8px", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center" }}><BrandMark size={56} /></div>
        <h2 style={{ marginTop: 12, fontSize: 18 }}>가입</h2>
        <div className="sub-mute" style={{ marginTop: 4 }}>
          새 센터를 만들거나, 원장님에게 받은 <b>초대 링크</b>를 통해 가입하세요.
        </div>
      </div>

      <div className="card-body">
        {sp.err && <div className="flash warn" style={{ marginBottom: 12 }}>{sp.err}</div>}

        <form action={signupCenter}>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>센터 이름<span className="req">*</span></label>
            <input className="input" name="centerName" required />
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>원장님 이름<span className="req">*</span></label>
            <input className="input" name="name" required />
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
            센터 만들기
          </button>
          <div className="tip" style={{ marginTop: 14 }}>
            💡 치료사·행정 선생님은 <b>초대 링크</b>로만 가입할 수 있습니다.
            원장님이 [치료사 관리]에서 발급한 링크를 받아 접속하세요.
          </div>
        </form>

        <div style={{ marginTop: 14, textAlign: "center", fontSize: 12.5 }}>
          <Link href="/login" style={{ color: "var(--text-mute)" }}>← 로그인으로</Link>
        </div>
      </div>
    </div>
  );
}
