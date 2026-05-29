import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { WEEK, parseSlots } from "@/lib/constants";
import { addBlock, deleteBlock } from "./actions";

export const dynamic = "force-dynamic";

export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const user = await requireRole(["THERAPIST", "OWNER"]);
  const sp = await searchParams;

  if (!user.therapistId) {
    return (
      <div className="card">
        <div className="card-body">
          <div className="flash warn">
            치료사 계정으로 연결돼 있지 않아요. 원장님께 본인을 치료사 레코드와 연결해달라고 요청하세요.
          </div>
        </div>
      </div>
    );
  }

  const [blocks, center] = await Promise.all([
    prisma.therapistBlock.findMany({
      where: { therapistId: user.therapistId },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    }),
    prisma.center.findUnique({ where: { id: user.centerId ?? -1 }, select: { slots: true } }),
  ]);
  const slots = parseSlots(center?.slots);

  // 요일별 그룹
  const byDow: Record<number, typeof blocks> = {};
  for (let i = 0; i < 7; i++) byDow[i] = [];
  for (const b of blocks) byDow[b.dayOfWeek].push(b);

  return (
    <>
      <div className="section-head">
        <div>
          <h2>내 차단 시간</h2>
          <p>받기 어려운 시간을 미리 막아두세요. 원장님이 일정표 만들 때 표시됩니다.</p>
        </div>
      </div>

      {sp.err && <div className="flash warn">{sp.err}</div>}
      {sp.ok && <div className="flash ok">{sp.ok}</div>}

      <div className="card">
        <div className="card-header">
          <span className="step">+</span>
          <h2>시간 차단 추가</h2>
        </div>
        <div className="card-body">
          <form action={addBlock} className="form-grid">
            <div className="field">
              <label>요일<span className="req">*</span></label>
              <select className="select" name="dayOfWeek" required defaultValue="">
                <option value="" disabled>선택</option>
                {WEEK.map((w, i) => (
                  <option key={i} value={i}>{w}요일</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>치료 시간대<span className="req">*</span></label>
              <select className="select" name="slot" required defaultValue="">
                <option value="" disabled>선택</option>
                {slots.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ gridColumn: "span 2" }}>
              <label>사유 (선택)</label>
              <input className="input" name="reason" />
            </div>
            <div className="field" style={{ alignSelf: "end" }}>
              <button className="btn btn-primary" type="submit">추가</button>
            </div>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>요일별 차단 시간</h2>
          <span className="hint">전체 {blocks.length}건</span>
        </div>
        <div className="card-body">
          {blocks.length === 0 ? (
            <div className="placeholder">차단된 시간이 없어요. 받기 어려운 시간을 위에서 추가하세요.</div>
          ) : (
            <div className="grid-scroll" style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(120px, 1fr))", gap: 10 }}>
              {WEEK.map((w, i) => (
                <div key={i} style={{
                  background: "var(--surface-2)",
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--border)",
                  padding: "10px 8px",
                  minHeight: 120,
                }}>
                  <div style={{
                    fontWeight: 700,
                    fontSize: 12,
                    color: i === 0 ? "var(--danger)" : i === 6 ? "#456C7F" : "var(--text)",
                    marginBottom: 8,
                    textAlign: "center",
                  }}>{w}요일</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {byDow[i].length === 0 ? (
                      <div className="sub-mute" style={{ fontSize: 11, textAlign: "center" }}>—</div>
                    ) : (
                      byDow[i].map((b) => (
                        <form
                          key={b.id}
                          action={async () => { "use server"; await deleteBlock(b.id); }}
                        >
                          <button type="submit" style={{
                            width: "100%",
                            background: "var(--surface)",
                            border: "1px solid #F4DDD7",
                            borderLeft: "3px solid var(--danger)",
                            borderRadius: "var(--r-xs)",
                            padding: "6px 8px",
                            fontSize: 11,
                            textAlign: "left",
                            cursor: "pointer",
                          }} title="클릭하면 삭제됩니다">
                            <div style={{ fontWeight: 700, color: "var(--danger)", fontVariantNumeric: "tabular-nums" }}>
                              {b.startTime} ~ {b.endTime}
                            </div>
                            {b.reason && (
                              <div style={{ color: "var(--text-mute)", marginTop: 2 }}>{b.reason}</div>
                            )}
                          </button>
                        </form>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
