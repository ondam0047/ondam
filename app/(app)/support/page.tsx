import Link from "next/link";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 지원사업 레지스트리 — 새 사업은 여기에 항목만 추가하면 카드가 늘어남.
const PROGRAMS = [
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
  await requireUser();

  return (
    <>
      <div className="section-head">
        <div>
          <h2>기타지원사업</h2>
          <p>발달재활 바우처 외 지원사업의 일지·계획서를 바로일지에서 작성해 한글로 출력해요.</p>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(248px, 1fr))",
          gap: 14,
        }}
      >
        {PROGRAMS.map((p) => {
          const inner = (
            <>
              <h3 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em", wordBreak: "keep-all" }}>
                {p.title}
              </h3>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--text-soft)", wordBreak: "keep-all", flex: 1 }}>
                {p.desc}
              </p>
              <div style={{ marginTop: 12 }}>
                {p.ready
                  ? <span className="badge badge-success">작성 가능</span>
                  : <span className="badge badge-mute">준비중</span>}
              </div>
            </>
          );
          const base: React.CSSProperties = {
            display: "flex", flexDirection: "column",
            padding: 18, borderRadius: 14,
            border: "1px solid var(--border)", background: "var(--surface)",
            minHeight: 120, textDecoration: "none", color: "inherit",
            opacity: p.ready ? 1 : 0.72,
          };
          return p.ready ? (
            <Link key={p.key} href={p.href} className="tool-card" style={base}>{inner}</Link>
          ) : (
            <div key={p.key} style={{ ...base, cursor: "default" }} aria-disabled>{inner}</div>
          );
        })}
      </div>
    </>
  );
}
