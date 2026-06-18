import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  soloModules, proModules, canUseModule, planLabel,
  type ToolModule, type PlanUser,
} from "@/lib/plan";
import ToolChildManager from "./ToolChildManager";

export const dynamic = "force-dynamic";

// 모듈 카드 한 장.
//  - status==="soon"  → 준비중(클릭 불가, 회색 배지)
//  - 요금제 잠금       → Pro 전용 안내(클릭 불가)
//  - 사용 가능         → 카드 전체가 링크
function ModuleCard({ m, user }: { m: ToolModule; user: PlanUser }) {
  const allowed = canUseModule(user, m);
  const soon = m.status === "soon";
  const locked = !allowed;
  const dim = soon || locked;

  const inner = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span
          style={{
            display: "inline-grid", placeItems: "center",
            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
            background: "var(--primary-soft)", color: "var(--primary)",
            fontSize: 13, fontWeight: 800,
          }}
        >
          {m.no}
        </span>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em", wordBreak: "keep-all" }}>
          {m.label}
        </h3>
      </div>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--text-soft)", wordBreak: "keep-all", flex: 1 }}>
        {m.desc}
      </p>
      <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
        {soon && <span className="badge badge-mute">준비중</span>}
        {!soon && locked && <span className="badge badge-warn">Pro 전용</span>}
        {!soon && !locked && <span className="badge badge-success">사용 가능</span>}
      </div>
    </>
  );

  const baseStyle: React.CSSProperties = {
    display: "flex", flexDirection: "column",
    padding: 18, borderRadius: 14,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    minHeight: 132,
    textDecoration: "none", color: "inherit",
    opacity: dim ? 0.72 : 1,
    transition: "border-color .15s, box-shadow .15s",
  };

  // 사용 가능하고 준비된 모듈만 링크. (현재 Phase 0 단계에선 전부 준비중)
  if (!soon && !locked) {
    return (
      <Link href={m.href} className="tool-card" style={baseStyle}>
        {inner}
      </Link>
    );
  }
  return (
    <div style={{ ...baseStyle, cursor: "default" }} aria-disabled title={locked ? "Pro 요금제 전용 모듈이에요" : "준비 중인 모듈이에요"}>
      {inner}
    </div>
  );
}

function ModuleGroup({
  title, hint, modules, user,
}: {
  title: string; hint: string; modules: ToolModule[]; user: PlanUser;
}) {
  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{title}</h2>
        <span style={{ fontSize: 12.5, color: "var(--text-mute)" }}>{hint}</span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(248px, 1fr))",
          gap: 14,
        }}
      >
        {modules.map((m) => (
          <ModuleCard key={m.key} m={m} user={user} />
        ))}
      </div>
    </section>
  );
}

export default async function ToolsPage() {
  const sessionUser = await requireUser();
  const row = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { plan: true, trialEndsAt: true },
  });
  const user: PlanUser = { plan: row?.plan ?? "trial", trialEndsAt: row?.trialEndsAt ?? null };
  const badge = planLabel(user);

  return (
    <>
      <div className="section-head">
        <div>
          <h2>바로툴</h2>
          <p>발음·말속도·조음 등 음성 학습 보조 도구 모음이에요.</p>
        </div>
        <span className="badge badge-primary" style={{ alignSelf: "center" }}>{badge}</span>
      </div>

      <ModuleGroup
        title="Solo"
        hint="기본 음성 시각화 도구"
        modules={soloModules()}
        user={user}
      />
      <ModuleGroup
        title="Pro"
        hint="말속도·조음·화용 등 심화 도구"
        modules={proModules()}
        user={user}
      />

      <ToolChildManager />
    </>
  );
}
