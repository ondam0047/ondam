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
  hideTherapistSelect = false,
}: {
  child?: ChildLike;
  therapists: TherapistOpt[];
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  showActive?: boolean;
  hideTherapistSelect?: boolean;
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
      <div className="form-grid">
        <div className="field">
          <label>이름<span className="req">*</span></label>
          <input className="input" name="name" defaultValue={c.name} required />
        </div>
        <div className="field">
          <label>생년월일 (자유 형식)</label>
          <input className="input" name="birthDate" defaultValue={c.birthDate ?? ""} />
        </div>
        <div className="field">
          <label>서비스 종류</label>
          <select className="select" name="serviceType" defaultValue={c.serviceType}>
            {SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="field">
          <label>관리번호 (선택)</label>
          <input className="input" name="mgmtNumber" defaultValue={c.mgmtNumber ?? ""} />
        </div>
        {!hideTherapistSelect && (
          <div className="field">
            <label>담당 치료사</label>
            <select className="select" name="therapistId" defaultValue={c.therapistId?.toString() ?? ""}>
              <option value="">— 미지정 —</option>
              {therapists.map((t) => (
                <option key={t.id} value={t.id} disabled={!t.active}>
                  {t.name}{t.active ? "" : " (비활성)"}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="divider" />

      <div className="label-block">기본값 <span className="small">— 일정표에서 이 아동을 불러올 때 자동 채워지는 값</span></div>
      <div className="form-grid">
        <div className="field">
          <label>월 목표 회기</label>
          <select className="select" name="defaultTarget" defaultValue={c.defaultTarget}>
            {[4, 5, 6, 7, 8].map((i) => <option key={i} value={i}>{i}회</option>)}
          </select>
        </div>
        <div className="field">
          <label>회당 단가 (원)</label>
          <input className="input" name="defaultUnit" type="number" defaultValue={c.defaultUnit} />
        </div>
        <div className="field">
          <label>기본 시간대</label>
          <select className="select" name="defaultSlot" defaultValue={c.defaultSlot ?? ""}>
            <option value="">— 미지정 —</option>
            {SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="field" style={{ marginTop: 14 }}>
        <label>기본 반복 요일 (탭하여 선택)</label>
        <DaySelector initial={[...selectedDays].sort()} />
      </div>

      <div className="field" style={{ marginTop: 14 }}>
        <label>메모 (선택)</label>
        <textarea className="textarea" name="memo" defaultValue={c.memo ?? ""} />
      </div>

      {showActive && (
        <div style={{ marginTop: 14 }}>
          <label className="modal-check">
            <input type="checkbox" name="active" defaultChecked={c.active ?? true} />
            활동 중인 아동
          </label>
        </div>
      )}

      <div className="divider" />
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" type="submit">{submitLabel}</button>
        <Link className="btn btn-ghost" href="/children">취소</Link>
      </div>
    </form>
  );
}
