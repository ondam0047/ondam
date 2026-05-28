import Link from "next/link";
import { SERVICE_TYPES, SLOTS } from "@/lib/constants";
import DaySelector from "./DaySelector";

type ChildLike = {
  id?: number;
  name: string;
  birthDate: string | null;
  serviceType: string;
  mgmtNumber: string | null;
  defaultSlot: string | null;
  defaultDays: string | null;
  defaultUnit: number;
  defaultTarget: number;
  memo: string | null;
  therapistId: number | null;
  active?: boolean;
};

type TherapistOpt = { id: number; name: string; active: boolean };

export default function ChildForm({
  child,
  therapists,
  action,
  submitLabel,
  showActive = false,
}: {
  child?: ChildLike;
  therapists: TherapistOpt[];
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  showActive?: boolean;
}) {
  const c: ChildLike = child ?? {
    name: "",
    birthDate: null,
    serviceType: SERVICE_TYPES[0],
    mgmtNumber: null,
    defaultSlot: null,
    defaultDays: null,
    defaultUnit: 65000,
    defaultTarget: 5,
    memo: null,
    therapistId: null,
  };
  const selectedDays = new Set((c.defaultDays ?? "").split(",").filter(Boolean).map(Number));

  return (
    <form action={action}>
      <div className="field-grid">
        <div>
          <label className="fl">이름 *</label>
          <input name="name" defaultValue={c.name} required />
        </div>
        <div>
          <label className="fl">생년월일 (자유 형식)</label>
          <input name="birthDate" defaultValue={c.birthDate ?? ""} placeholder="예: 22.04.13" />
        </div>
        <div>
          <label className="fl">서비스 종류</label>
          <select name="serviceType" defaultValue={c.serviceType}>
            {SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="fl">관리번호 (선택)</label>
          <input name="mgmtNumber" defaultValue={c.mgmtNumber ?? ""} />
        </div>
        <div>
          <label className="fl">담당 치료사</label>
          <select name="therapistId" defaultValue={c.therapistId?.toString() ?? ""}>
            <option value="">— 미지정 —</option>
            {therapists.map((t) => (
              <option key={t.id} value={t.id} disabled={!t.active}>
                {t.name}{t.active ? "" : " (비활성)"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="fl">월 목표 회기</label>
          <select name="defaultTarget" defaultValue={c.defaultTarget}>
            {[4, 5, 6, 7, 8].map((i) => <option key={i} value={i}>{i}회</option>)}
          </select>
        </div>
        <div>
          <label className="fl">회당 단가 (원)</label>
          <input name="defaultUnit" type="number" defaultValue={c.defaultUnit} />
        </div>
        <div>
          <label className="fl">기본 시간대</label>
          <select name="defaultSlot" defaultValue={c.defaultSlot ?? ""}>
            <option value="">— 미지정 —</option>
            {SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <label className="fl">기본 반복 요일 (탭하여 선택)</label>
        <DaySelector initial={[...selectedDays].sort()} />
      </div>

      <div style={{ marginTop: 16 }}>
        <label className="fl">메모 (선택)</label>
        <textarea name="memo" defaultValue={c.memo ?? ""} placeholder="아동 특이사항·치료 목표 등" />
      </div>

      {showActive && (
        <div style={{ marginTop: 16 }}>
          <label className="modal-check">
            <input type="checkbox" name="active" defaultChecked={c.active ?? true} />
            활동 중인 아동
          </label>
        </div>
      )}

      <div className="actions">
        <button className="btn" type="submit">{submitLabel}</button>
        <Link className="btn ghost sm" href="/children">취소</Link>
      </div>
    </form>
  );
}
