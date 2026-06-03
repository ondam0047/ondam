import Link from "next/link";

export type LegalSection = { h: string; body: React.ReactNode };

export default function LegalDoc({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  intro?: React.ReactNode;
  sections: LegalSection[];
}) {
  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "40px 20px 80px" }}>
      <div style={{ marginBottom: 8 }}>
        <Link href="/signup" style={{ color: "var(--text-mute, #6b7280)", fontSize: 13, textDecoration: "none" }}>
          ← 돌아가기
        </Link>
      </div>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", margin: "6px 0 4px" }}>{title}</h1>
      <div style={{ color: "#6b7280", fontSize: 12.5, marginBottom: 24 }}>최종 개정일: {updated}</div>

      {intro && (
        <div style={{ background: "#f6f8fb", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 16px", fontSize: 13.5, lineHeight: 1.7, marginBottom: 24 }}>
          {intro}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {sections.map((s, i) => (
          <section key={i}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>{s.h}</h2>
            <div style={{ fontSize: 14, lineHeight: 1.8, color: "#1f2937" }}>{s.body}</div>
          </section>
        ))}
      </div>
    </div>
  );
}
