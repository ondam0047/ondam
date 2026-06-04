import { prisma } from "@/lib/db";
import ScheduleClient from "./ScheduleClient";
import { bulkGenerateSchedules } from "./bulk-actions";
import { requireRole, getEffectiveTherapistId } from "@/lib/auth";
import { parseSlots, THERAPIST_TO_SERVICE } from "@/lib/constants";

export const dynamic = "force-dynamic";

// 대상 월 옵션: 전월 1 + 이번 달 + 다음 6개월
function monthOptions(): { value: string; label: string; current: boolean }[] {
  const now = new Date();
  const base = now.getFullYear() * 12 + now.getMonth();
  const out: { value: string; label: string; current: boolean }[] = [];
  for (let off = -1; off <= 6; off++) {
    const t = base + off;
    const y = Math.floor(t / 12);
    const m = (t % 12) + 1;
    out.push({ value: `${y}-${m}`, label: `${y}년 ${m}월${off === 0 ? " (이번 달)" : ""}`, current: off === 0 });
  }
  return out;
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ bulk?: string; berr?: string }>;
}) {
  const user = await requireRole(["OWNER", "THERAPIST"]);
  const sp = await searchParams;
  const centerId = user.centerId ?? -1;
  const myTherapistId = await getEffectiveTherapistId(user);

  // 본인 사용자 + 본인 Therapist 만 가져옴 (1인 모드)
  const [userRow, services, center] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { therapistType: true } }),
    prisma.childService.findMany({
      where: {
        active: true,
        therapistId: myTherapistId ?? -1,
        child: { active: true, centerId },
      },
      include: { child: true, therapist: true },
      orderBy: [{ child: { name: "asc" } }, { id: "asc" }],
    }),
    prisma.center.findUnique({ where: { id: centerId }, select: { serviceTypes: true, slots: true, defaultUnit: true } }),
  ]);

  const childIdCount = new Map<number, number>();
  for (const s of services) {
    childIdCount.set(s.childId, (childIdCount.get(s.childId) ?? 0) + 1);
  }

  const childOptions = services.map((s) => ({
    id: s.id,
    childId: s.childId,
    name: s.child.name,
    birthDate: s.child.birthDate,
    serviceType: s.serviceType,
    mgmtNumber: s.child.mgmtNumber,
    defaultSlot: s.defaultSlot,
    defaultDays: s.defaultDays,
    daySlots: s.daySlots,
    defaultUnit: s.defaultUnit,
    defaultTarget: s.defaultTarget,
    monthlyCopay: s.monthlyCopay,
    therapistName: s.therapist?.name ?? null,
    hasMultipleServices: (childIdCount.get(s.childId) ?? 0) > 1,
  }));

  // 1인 사물함: 치료사 목록은 본인 한 명만
  const therapistOptions = [{ id: myTherapistId ?? 0, name: user.name }];

  // 서비스 종류는 가입 시 선택한 치료사 종류로 고정 (잠금)
  const lockedService = userRow?.therapistType
    ? (THERAPIST_TO_SERVICE[userRow.therapistType] ?? userRow.therapistType)
    : null;
  const serviceTypes = lockedService ? [lockedService] : ["언어재활"];
  const slots = parseSlots(center?.slots);
  const months = monthOptions();
  const defaultYm = months.find((o) => o.current)?.value ?? months[0].value;

  return (
    <>
      {sp.bulk && <div className="flash ok" style={{ marginBottom: 14 }}>{sp.bulk}</div>}
      {sp.berr && <div className="flash warn" style={{ marginBottom: 14 }}>{sp.berr}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <span className="step">★</span>
          <h2>이번 달 일괄 생성</h2>
          <span className="hint">담당 아동 전체의 일정표를 한 번에</span>
        </div>
        <div className="card-body">
          <form action={bulkGenerateSchedules} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
            <div className="field">
              <label>대상 월</label>
              <select className="select" name="ym" defaultValue={defaultYm}>
                {months.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <label className="modal-check">
              <input type="checkbox" name="overwrite" />
              기존 일정표도 다시 생성(덮어쓰기)
            </label>
            <button className="btn btn-primary" type="submit">일괄 생성</button>
          </form>
          <div className="sub-mute" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.6 }}>
            아동마다 등록된 <b>기본 반복 요일·시간대</b>(공휴일 제외)로 자동 생성·저장돼요.
            요일이나 시간대가 없는 아동은 건너뜁니다. 기본값은 <b>[내 아동]</b>에서 설정.
            생성 후 아래에서 개별 수정·한글파일 다운로드, 또는 <b>[일괄 다운로드]</b>로 한 번에 받을 수 있어요.
          </div>
        </div>
      </div>

      <ScheduleClient
        children={childOptions}
        therapists={therapistOptions}
        serviceTypes={serviceTypes}
        slots={slots}
        defaultFilterTherapist={user.name}
        defaultOrg={user.centerName ?? ""}
        centerDefaultUnit={center?.defaultUnit ?? 60000}
      />
    </>
  );
}
