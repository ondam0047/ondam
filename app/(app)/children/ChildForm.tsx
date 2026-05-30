"use client";

import Link from "next/link";
import { useState } from "react";
// slots 는 prop 으로 받음 (센터마다 다름)
import DaySelector from "./DaySelector";

type TherapistOpt = { id: number; name: string; active: boolean };

export type ServiceInput = {
  id?: number;             // 기존 ChildService 의 id (수정 시)
  serviceType: string;
  therapistId: number | null;
  defaultSlot: string | null;
  defaultDays: string | null;
  defaultUnit: number;
  defaultTarget: number;
  active?: boolean;
};

type ChildInput = {
  id?: number;
  name: string;
  birthDate: string | null;
  mgmtNumber: string | null;
  memo: string | null;
  active?: boolean;
  waiting?: boolean;
  services: ServiceInput[];
};

export default function ChildForm({
  child,
  therapists,
  serviceTypes,
  slots,
  defaultUnit = 60000,
  action,
  submitLabel,
  showActive = false,
  hideTherapistSelect = false,
  canSetWaiting = false,
}: {
  child?: ChildInput;
  therapists: TherapistOpt[];
  serviceTypes: string[];
  slots: string[];
  defaultUnit?: number;
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  showActive?: boolean;
  hideTherapistSelect?: boolean;
  canSetWaiting?: boolean;
}) {
  const c: ChildInput = child ?? {
    name: "",
    birthDate: null,
    mgmtNumber: null,
    memo: null,
    services: [{
      serviceType: serviceTypes[0] ?? "언어재활",
      therapistId: null,
      defaultSlot: null,
      defaultDays: null,
      defaultUnit: defaultUnit,
      defaultTarget: 5,
    }],
  };

  const [services, setServices] = useState<ServiceInput[]>(c.services.length ? c.services : [{
    serviceType: serviceTypes[0] ?? "언어재활",
    therapistId: null,
    defaultSlot: null,
    defaultDays: null,
    defaultUnit: defaultUnit,
    defaultTarget: 5,
  }]);

  function updateSvc(idx: number, patch: Partial<ServiceInput>) {
    setServices((arr) => arr.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }
  function addSvc() {
    setServices((arr) => [...arr, {
      serviceType: serviceTypes[arr.length % serviceTypes.length] ?? "언어재활",
      therapistId: null,
      defaultSlot: null,
      defaultDays: null,
      defaultUnit: defaultUnit,
      defaultTarget: 5,
    }]);
  }
  function removeSvc(idx: number) {
    setServices((arr) => arr.length > 1 ? arr.filter((_, i) => i !== idx) : arr);
  }

  return (
    <form action={action}>
      {/* 아동(사람) 정보 */}
      <div className="label-block">아동 정보</div>
      <div className="form-grid">
        <div className="field">
          <label>이름<span className="req">*</span></label>
          <input className="input" name="name" defaultValue={c.name} required />
        </div>
        <div className="field">
          <label>생년월일 (자유 형식)</label>
          <input className="input" name="birthDate" defaultValue={c.birthDate ?? ""} />
        </div>
        <div className="field" style={{ gridColumn: "span 2" }}>
          <label>관리번호 (선택)</label>
          <input className="input" name="mgmtNumber" defaultValue={c.mgmtNumber ?? ""} />
        </div>
      </div>

      <div className="field" style={{ marginTop: 14 }}>
        <label>메모 (선택)</label>
        <textarea className="textarea" name="memo" defaultValue={c.memo ?? ""} />
      </div>

      {showActive && (
        <div style={{ marginTop: 14, display: "flex", gap: 24, flexWrap: "wrap" }}>
          <label className="modal-check">
            <input type="checkbox" name="active" defaultChecked={c.active ?? true} />
            활동 중인 아동
          </label>
          {canSetWaiting && (
            <label className="modal-check">
              <input type="checkbox" name="waiting" defaultChecked={c.waiting ?? false} />
              대기 명단 (상담 예정 · 아직 회기 시작 전)
            </label>
          )}
        </div>
      )}
      {!showActive && canSetWaiting && (
        <div style={{ marginTop: 14 }}>
          <label className="modal-check">
            <input type="checkbox" name="waiting" defaultChecked={c.waiting ?? false} />
            대기 명단으로 등록 (상담만 받고 아직 회기 시작 전)
          </label>
        </div>
      )}

      <div className="divider" />

      {/* 서비스 목록 */}
      <div className="label-block">
        받는 치료
        <span className="small"> — 한 아동이 여러 서비스를 받으면 각각 추가하세요</span>
      </div>

      {services.map((s, i) => {
        const selectedDays = new Set((s.defaultDays ?? "").split(",").filter(Boolean).map(Number));
        return (
          <div key={i} style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-md)",
            padding: 14,
            marginBottom: 10,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-mute)" }}>서비스 {i + 1}</span>
              {services.length > 1 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ color: "var(--danger)" }}
                  onClick={() => removeSvc(i)}
                >제거</button>
              )}
            </div>
            <input type="hidden" name={`svc[${i}][id]`} value={s.id ?? ""} />
            <div className="form-grid">
              <div className="field">
                <label>서비스 종류<span className="req">*</span></label>
                <select
                  className="select"
                  name={`svc[${i}][serviceType]`}
                  value={s.serviceType}
                  onChange={(e) => updateSvc(i, { serviceType: e.target.value })}
                  required
                >
                  {serviceTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {!hideTherapistSelect && (
                <div className="field">
                  <label>담당 치료사</label>
                  <select
                    className="select"
                    name={`svc[${i}][therapistId]`}
                    value={s.therapistId?.toString() ?? ""}
                    onChange={(e) => updateSvc(i, { therapistId: e.target.value ? Number(e.target.value) : null })}
                  >
                    <option value="">— 미지정 —</option>
                    {therapists.map((t) => (
                      <option key={t.id} value={t.id} disabled={!t.active}>
                        {t.name}{t.active ? "" : " (비활성)"}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {hideTherapistSelect && (
                <input type="hidden" name={`svc[${i}][therapistId]`} value="" />
              )}
              <div className="field">
                <label>월 목표 회기</label>
                <select
                  className="select"
                  name={`svc[${i}][defaultTarget]`}
                  value={s.defaultTarget}
                  onChange={(e) => updateSvc(i, { defaultTarget: Number(e.target.value) })}
                >
                  {[4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}회</option>)}
                </select>
              </div>
              <div className="field">
                <label>회당 단가 (원)</label>
                <input
                  className="input"
                  name={`svc[${i}][defaultUnit]`}
                  type="number"
                  value={s.defaultUnit}
                  onChange={(e) => updateSvc(i, { defaultUnit: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="field" style={{ gridColumn: "span 2" }}>
                <label>기본 시간대</label>
                <select
                  className="select"
                  name={`svc[${i}][defaultSlot]`}
                  value={s.defaultSlot ?? ""}
                  onChange={(e) => updateSvc(i, { defaultSlot: e.target.value || null })}
                >
                  <option value="">— 미지정 —</option>
                  {slots.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
                </select>
              </div>
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label>기본 반복 요일 (탭하여 선택)</label>
              <DaySelector
                initial={[...selectedDays].sort()}
                name={`svc[${i}][defaultDays]`}
              />
            </div>
          </div>
        );
      })}

      <button type="button" className="btn btn-ghost" onClick={addSvc} style={{ marginBottom: 14 }}>
        + 서비스 추가 (다른 치료사 / 다른 종류)
      </button>

      <input type="hidden" name="serviceCount" value={services.length} />

      <div className="divider" />
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" type="submit">{submitLabel}</button>
        <Link className="btn btn-ghost" href="/children">취소</Link>
      </div>
    </form>
  );
}
