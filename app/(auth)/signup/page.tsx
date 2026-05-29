import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  createSession, hashPassword, getCurrentUser,
  generateApprovalCode, getDefaultCenterId,
} from "@/lib/auth";

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

// 기존 센터 치료사 자가 가입 (승인코드 필요)
async function signupTherapist(formData: FormData) {
  "use server";
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!code || !name || !email || password.length < 6) {
    redirect("/signup?mode=therapist&err=" + encodeURIComponent("승인코드·이름·이메일·비밀번호 모두 필요"));
  }
  const center = await prisma.center.findUnique({ where: { approvalCode: code } });
  if (!center) {
    redirect("/signup?mode=therapist&err=" + encodeURIComponent("승인코드가 맞지 않아요. 원장님께 확인하세요."));
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    redirect("/signup?mode=therapist&err=" + encodeURIComponent("이미 사용 중인 이메일이에요"));
  }

  // 같은 센터·같은 이름 치료사 레코드가 이미 있고 계정이 비어있으면 자동 연결
  let therapist = await prisma.therapist.findFirst({
    where: { centerId: center!.id, name, user: null },
  });
  if (!therapist) {
    therapist = await prisma.therapist.create({
      data: { name, centerId: center!.id },
    });
  }

  await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await hashPassword(password),
      role: "THERAPIST",
      centerId: center!.id,
      therapistId: therapist!.id,
      active: false, // 원장 승인 대기
    },
  });
  redirect("/signup?pending=1");
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; err?: string; pending?: string }>;
}) {
  const sp = await searchParams;
  if (await getCurrentUser()) redirect("/dashboard");

  // 가입 후 안내
  if (sp.pending === "1") {
    return (
      <div className="card">
        <div style={{ padding: "28px 26px 8px", textAlign: "center" }}>
          <Image src="/ondam-logo.png" alt="온담" width={56} height={56} style={{ margin: "0 auto" }} />
          <h2 style={{ marginTop: 12, fontSize: 18 }}>가입 신청 완료</h2>
        </div>
        <div className="card-body" style={{ textAlign: "center" }}>
          <div className="flash ok" style={{ marginBottom: 16 }}>
            원장님 승인 후 로그인할 수 있어요.
          </div>
          <Link className="btn btn-primary" href="/login" style={{ width: "100%", justifyContent: "center" }}>
            로그인 화면으로
          </Link>
        </div>
      </div>
    );
  }

  const mode = sp.mode === "therapist" ? "therapist" : "center";

  return (
    <div className="card">
      <div style={{ padding: "28px 26px 8px", textAlign: "center" }}>
        <Image src="/ondam-logo.png" alt="온담" width={56} height={56} style={{ margin: "0 auto" }} />
        <h2 style={{ marginTop: 12, fontSize: 18 }}>가입</h2>
        <div className="sub-mute" style={{ marginTop: 4 }}>
          {mode === "center" ? "센터를 새로 만드세요" : "원장님에게 받은 승인코드를 입력해주세요"}
        </div>
      </div>

      <div style={{ padding: "0 22px", display: "flex", gap: 6, marginTop: 12 }}>
        <Link
          href="/signup?mode=center"
          className={"chip" + (mode === "center" ? " on" : "")}
          style={{ textDecoration: "none" }}
        >🏢 센터 새로 만들기</Link>
        <Link
          href="/signup?mode=therapist"
          className={"chip" + (mode === "therapist" ? " on" : "")}
          style={{ textDecoration: "none" }}
        >👤 치료사 가입</Link>
      </div>

      <div className="card-body">
        {sp.err && <div className="flash warn" style={{ marginBottom: 12 }}>{sp.err}</div>}

        {mode === "center" ? (
          <form action={signupCenter}>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>센터 이름<span className="req">*</span></label>
              <input className="input" name="centerName" required placeholder="예: 온담말언어연구소" />
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
            <div className="tip" style={{ marginTop: 14, fontSize: 12 }}>
              가입 직후 화면에 표시되는 <b>6자리 승인코드</b>를 치료사들에게 알려주세요.
            </div>
          </form>
        ) : (
          <form action={signupTherapist}>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>센터 승인코드<span className="req">*</span></label>
              <input className="input" name="code" required placeholder="예: 7K3QPM" style={{ fontFamily: "monospace", letterSpacing: "0.1em", textTransform: "uppercase" }} />
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>이름<span className="req">*</span></label>
              <input className="input" name="name" required placeholder="예: 언어/주채린" />
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
              가입 신청
            </button>
            <div className="tip" style={{ marginTop: 14, fontSize: 12 }}>
              가입 후 원장님 승인을 기다려주세요.
            </div>
          </form>
        )}

        <div style={{ marginTop: 14, textAlign: "center", fontSize: 12.5 }}>
          <Link href="/login" style={{ color: "var(--text-mute)" }}>← 로그인으로</Link>
        </div>
      </div>
    </div>
  );
}
