import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser, getEffectiveTherapistId } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 한 아동(종결 포함)의 저장된 일정표·기록지를 모아 보고 한글파일로 내려받는 페이지.
// 생성 로직은 기존 일괄 다운로드 라우트(/api/{schedule,record}/hwpx-bulk)를 그대로 재사용한다.
// (그 라우트는 active 여부와 무관하게 치료사 소유·센터 기준으로만 거르므로 종결 아동도 동작.)
export default async function ChildDocsPage(props: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await props.params;
  const cid = Number(id);
  if (!Number.isInteger(cid)) notFound();

  const child = await prisma.child.findUnique({
    where: { id: cid },
    select: { id: true, name: true, birthDate: true, active: true, centerId: true },
  });
  if (!child) notFound();
  if (child.centerId !== user.centerId) redirect("/children");

  const myId = await getEffectiveTherapistId(user);
  const myServices = await prisma.childService.findMany({
    where: { childId: cid, therapistId: myId ?? -1 },
    select: { id: true, serviceType: true },
  });
  if (myServices.length === 0) redirect("/children");
  const svcIds = myServices.map((s) => s.id);
  const svcName = new Map(myServices.map((s) => [s.id, s.serviceType]));
  const multiService = myServices.length > 1;

  const [schedules, records] = await Promise.all([
    prisma.schedule.findMany({
      where: { childServiceId: { in: svcIds } },
      select: { id: true, year: true, month: true, childServiceId: true, _count: { select: { sessions: true } } },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    }),
    prisma.record.findMany({
      where: { childServiceId: { in: svcIds } },
      select: { id: true, year: true, month: true, childServiceId: true, _count: { select: { sessions: true } } },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    }),
  ]);

  type Doc = { id: number; year: number; month: number; childServiceId: number; _count: { sessions: number } };
  const section = (title: string, docs: Doc[], api: string, empty: string) => (
    <div className="card">
      <div className="card-header">
        <h2>{title} ({docs.length})</h2>
      </div>
      {docs.length === 0 ? (
        <div className="card-body" style={{ padding: "20px 24px" }}>
          <div className="sub-mute" style={{ fontSize: 13.5 }}>{empty}</div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>연·월</th>
                {multiService && <th>서비스</th>}
                <th>회기</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td style={{ fontWeight: 600 }}>{d.year}년 {d.month}월</td>
                  {multiService && (
                    <td><span className="badge badge-primary">{svcName.get(d.childServiceId)}</span></td>
                  )}
                  <td className="sub-mute">{d._count.sessions}회</td>
                  <td style={{ textAlign: "right" }}>
                    <a
                      className="btn btn-ghost btn-sm"
                      href={`${api}?year=${d.year}&month=${d.month}&ids=${d.childServiceId}`}
                    >
                      한글파일 받기
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="section-head">
        <div>
          <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            저장된 서류 — {child.name}
            {!child.active && (
              <span className="badge" style={{ background: "var(--surface-2)", color: "var(--text-mute)", fontWeight: 700 }}>종결</span>
            )}
          </h2>
          <p>
            이 아동의 저장된 일정표·기록지를 한글파일로 내려받을 수 있어요.
            {!child.active && " 종결한 아동도 서류는 그대로 보존됩니다."}
            {child.birthDate ? ` · 생년월일 ${child.birthDate}` : ""}
          </p>
        </div>
        <Link className="btn btn-ghost" href={child.active ? "/children" : "/children?closed=1"}>← 목록으로</Link>
      </div>

      {section("일정표", schedules, "/api/schedule/hwpx-bulk", "저장된 일정표가 없어요.")}
      {section("기록지", records, "/api/record/hwpx-bulk", "저장된 기록지가 없어요.")}
    </>
  );
}
