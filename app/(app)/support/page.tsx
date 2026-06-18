import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { maxCustomPrograms, canAddProgram } from "@/lib/plan";

export const dynamic = "force-dynamic";

const SYSTEM_PROGRAMS = [
  {
    key: "maeummoa",
    title: "교육청 치료지원 (마음모아)",
    desc: "월별 치료지원 일지(서식 4)를 작성해 한글(.hwpx)로 출력합니다.",
    href: "/support/maeummoa",
    ready: true,
  },
  {
    key: "community-invest",
    title: "지역사회서비스 투자사업",
    desc: "지자체별 사업 양식. (준비 중 — 양식 확보 후 추가)",
    href: "",
    ready: false,
  },
];

export default async function SupportHubPage() {
  const sessionUser = await requireUser();

  const [programs, planRow] = await Promise.all([
    prisma.program.findMany({
      where: { ownerId: sessionUser.id, active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, formSpec: true },
    }),
    prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { plan: true, trialEndsAt: true },
    }),
  ]);

  const planUser = { plan: planRow?.plan ?? "trial", trialEndsAt: planRow?.trialEndsAt ?? null };
  const limit = maxCustomPrograms(planUser);
  const canAdd = canAddProgram(planUser, programs.length);

  const cardBase: React.CSSProperties = {
    display: "flex", flexDirection: "column",
    padding: 18, borderRadius: 14,
    border: "1px solid var(--border)", background: "var(--surface)",
    minHeight: 120, textDecoration: "none", color: "inherit",
  };

  return (
    <>
      <div className="section-head">
        <div>
          <h2>기타지원사업</h2>
          <p>발달재활 바우처 외 지원사업의 기록지를 바로일지에서 작성해 한글로 출력해요.</p>
        </div>
      </div>

      {/* 시스템 사업 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(248px, 1fr))", gap: 14 }}>
        {SYSTEM_PROGRAMS.map((p) => {
          const inner = (
            <>
              <h3 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em", wordBreak: "keep-all" }}>
                {p.title}
              </h3>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--text-soft)", wordBreak: "keep-all", flex: 1 }}>
                {p.desc}
              </p>
              <div style={{ marginTop: 12 }}>
                {p.ready ? <span className="badge badge-success">작성 가능</span> : <span className="badge badge-mute">준비중</span>}
              </div>
            </>
          );
          return p.ready ? (
            <Link key={p.key} href={p.href} className="tool-card" style={cardBase}>{inner}</Link>
          ) : (
            <div key={p.key} style={{ ...cardBase, cursor: "default", opacity: 0.72 }} aria-disabled>{inner}</div>
          );
        })}
      </div>

      {/* 커스텀 사업 섹션 */}
      <div style={{ marginTop: 32 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--text-soft)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
              내가 추가한 사업
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-mute)" }}>
              {programs.length} / {limit}개 사용 중
            </p>
          </div>
          {canAdd ? (
            <Link
              href="/support/programs/new"
              className="btn btn-primary"
              style={{ fontSize: 13, padding: "6px 14px" }}
            >
              + 사업 추가
            </Link>
          ) : (
            <span style={{ fontSize: 12, color: "var(--text-mute)", padding: "6px 14px", border: "1px solid var(--border)", borderRadius: 8 }}>
              한도 도달 ({limit}개)
            </span>
          )}
        </div>

        {programs.length === 0 ? (
          <div style={{ padding: "28px 0", textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
            아직 추가한 사업이 없어요.{" "}
            {canAdd && (
              <Link href="/support/programs/new" style={{ color: "var(--primary)" }}>
                + 사업 추가
              </Link>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(248px, 1fr))", gap: 14 }}>
            {programs.map((p) => (
              <Link key={p.id} href={`/support/programs/${p.id}`} className="tool-card" style={cardBase}>
                <h3 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em", wordBreak: "keep-all" }}>
                  {p.name}
                </h3>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--text-soft)", flex: 1 }}>
                  기타지원사업 기록지
                </p>
                <div style={{ marginTop: 12 }}>
                  {p.formSpec
                    ? <span className="badge badge-success">양식 등록됨</span>
                    : <span className="badge badge-mute">양식 미등록</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
