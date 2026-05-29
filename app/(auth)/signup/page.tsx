import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession, hashPassword, getCurrentUser, isFirstSignup } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function firstSignup(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !name || password.length < 6) {
    redirect("/signup?err=" + encodeURIComponent("이름·이메일·비밀번호(6자 이상)를 모두 입력해주세요"));
  }
  if (!(await isFirstSignup())) {
    redirect("/signup?err=" + encodeURIComponent("이미 등록된 계정이 있어요"));
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    redirect("/signup?err=" + encodeURIComponent("이미 사용 중인 이메일이에요"));
  }
  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await hashPassword(password),
      role: "OWNER",
      active: true,
    },
  });
  await createSession(user.id);
  redirect("/dashboard");
}

async function therapistSignup(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const therapistIdRaw = String(formData.get("therapistId") ?? "");
  const newName = String(formData.get("newName") ?? "").trim();
  if (!email || password.length < 6) {
    redirect("/signup?err=" + encodeURIComponent("이메일·비밀번호(6자 이상) 필요"));
  }
  if (!therapistIdRaw && !newName) {
    redirect("/signup?err=" + encodeURIComponent("본인 이름을 선택하거나 새로 입력해주세요"));
  }

  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) {
    redirect("/signup?err=" + encodeURIComponent("이미 사용 중인 이메일이에요"));
  }

  let therapistId: number;
  let name: string;

  if (therapistIdRaw) {
    therapistId = Number(therapistIdRaw);
    const t = await prisma.therapist.findUnique({ where: { id: therapistId } });
    if (!t) redirect("/signup?err=" + encodeURIComponent("선택한 치료사를 찾을 수 없어요"));
    // 이미 계정 있으면 차단
    const existingLink = await prisma.user.findUnique({ where: { therapistId } });
    if (existingLink) {
      redirect("/signup?err=" + encodeURIComponent("이 치료사는 이미 가입돼 있어요"));
    }
    name = t!.name;
  } else {
    const created = await prisma.therapist.create({ data: { name: newName } });
    therapistId = created.id;
    name = newName;
  }

  await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await hashPassword(password),
      role: "THERAPIST",
      therapistId,
      active: false, // 원장 승인 대기
    },
  });
  redirect("/signup?pending=1");
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; pending?: string }>;
}) {
  const sp = await searchParams;
  if (await getCurrentUser()) redirect("/dashboard");
  const firstTime = await isFirstSignup();

  // 가입 직후 승인 대기 안내
  if (sp.pending === "1") {
    return (
      <div className="card">
        <div style={{ padding: "28px 26px 8px", textAlign: "center" }}>
          <Image src="/ondam-logo.png" alt="온담" width={56} height={56} style={{ margin: "0 auto" }} />
          <h2 style={{ marginTop: 12, fontSize: 18 }}>가입 신청이 완료됐어요</h2>
        </div>
        <div className="card-body" style={{ textAlign: "center" }}>
          <div className="flash ok" style={{ marginBottom: 16 }}>
            원장님 승인 후 로그인이 가능합니다.<br />
            승인되면 치료사 관리 화면에서 보입니다.
          </div>
          <Link className="btn btn-primary" href="/login" style={{ width: "100%", justifyContent: "center" }}>
            로그인 화면으로
          </Link>
        </div>
      </div>
    );
  }

  // 첫 가입자 = 원장
  if (firstTime) {
    return (
      <div className="card">
        <div style={{ padding: "28px 26px 8px", textAlign: "center" }}>
          <Image src="/ondam-logo.png" alt="온담" width={56} height={56} style={{ margin: "0 auto" }} />
          <h2 style={{ marginTop: 12, fontSize: 18 }}>첫 계정 만들기</h2>
          <div className="sub-mute" style={{ marginTop: 4 }}>원장 계정으로 자동 등록됩니다</div>
        </div>
        <div className="card-body">
          {sp.err && <div className="flash warn" style={{ marginBottom: 12 }}>{sp.err}</div>}
          <form action={firstSignup}>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>이름</label>
              <input className="input" name="name" required />
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>이메일</label>
              <input className="input" name="email" type="email" required />
            </div>
            <div className="field" style={{ marginBottom: 14 }}>
              <label>비밀번호 <span className="sub-mute">(6자 이상)</span></label>
              <input className="input" name="password" type="password" required minLength={6} />
            </div>
            <button className="btn btn-primary" type="submit" style={{ width: "100%", justifyContent: "center" }}>
              계정 만들기
            </button>
          </form>
          <div style={{ marginTop: 14, textAlign: "center", fontSize: 12.5 }}>
            <Link href="/login" style={{ color: "var(--text-mute)" }}>← 로그인으로</Link>
          </div>
        </div>
      </div>
    );
  }

  // 치료사 자가 가입 (원장 승인 필요)
  const availableTherapists = await prisma.therapist.findMany({
    where: { user: null, active: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="card">
      <div style={{ padding: "28px 26px 8px", textAlign: "center" }}>
        <Image src="/ondam-logo.png" alt="온담" width={56} height={56} style={{ margin: "0 auto" }} />
        <h2 style={{ marginTop: 12, fontSize: 18 }}>치료사 가입</h2>
        <div className="sub-mute" style={{ marginTop: 4 }}>원장님 승인 후 사용 가능합니다</div>
      </div>
      <div className="card-body">
        {sp.err && <div className="flash warn" style={{ marginBottom: 12 }}>{sp.err}</div>}
        <form action={therapistSignup}>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>본인 이름 선택 <span className="sub-mute">(이미 등록된 치료사)</span></label>
            <select className="select" name="therapistId" defaultValue="">
              <option value="">— 선택 —</option>
              {availableTherapists.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>이름이 없으면 새로 입력 <span className="sub-mute">(선택)</span></label>
            <input className="input" name="newName" placeholder="예: 언어/김선영" />
          </div>
          <div className="divider" />
          <div className="field" style={{ marginBottom: 12 }}>
            <label>이메일</label>
            <input className="input" name="email" type="email" required />
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>비밀번호 <span className="sub-mute">(6자 이상)</span></label>
            <input className="input" name="password" type="password" required minLength={6} />
          </div>
          <button className="btn btn-primary" type="submit" style={{ width: "100%", justifyContent: "center" }}>
            가입 신청
          </button>
        </form>
        <div style={{ marginTop: 14, textAlign: "center", fontSize: 12.5 }}>
          <Link href="/login" style={{ color: "var(--text-mute)" }}>← 로그인으로</Link>
        </div>
      </div>
    </div>
  );
}
