"use client";

import Link from "next/link";
import { useState } from "react";
import { WEEK, parseDaySlots, serializeDaySlots } from "@/lib/constants";

type TherapistOpt = { id: number; name: string; active: boolean };

export type ServiceInput = {
  id?: number;             // 기존 ChildService 의 id (수정 시)
  serviceType: string;
  therapistId: number | null;
  defaultSlot: string | null;
  defaultDays: string | null;
  daySlots: string | null; // 요일별 시간대 오버라이드 ("1=09:00~09:50,...")
  defaultUnit: number;
  defaultTarget: number;
  monthlyCopay: number | null; // 월 본인부담금. null/0 이면 일정표에서 수동 입력
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

function makeBlankService(serviceType: string, defaultUnit: number): ServiceInput {
  return {
    serviceType,
    therapistId: null,
    defaultSlot: null,
    defaultDays: null,
    daySlots: null,
    defaultUnit,
    defaultTarget: 5,
    monthlyCopay: null,
  };
}

export default function ChildForm({
  child,
  therapists,
  serviceTypes,
  slots,
  defaultUnit = 60000,
  therapistName,
  action,
  submitLabel,
  showActive = false,
  canSetWaiting = false,
}: {
  child?: ChildInput;
  therapists: TherapistOpt[];
  serviceTypes: string[];
  slots: string[];
  defaultUnit?: number;
  // 담당 치료사 고정 표시용 — 1인 모드에서 로그인 사용자(=치료사) 이름.
  therapistName?: string;
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  showActive?: boolean;
  canSetWaiting?: boolean;
}) {
  // 서비스 종류는 내 설정(치료사 종류)에 따라 고정.
  const lockedServiceType = serviceTypes[0] ?? "언어재활";

  const initialServices = child?.services.length
    ? child.services
    : [makeBlankService(lockedServiceType, defaultUnit)];

  const c: ChildInput = child ?? {
    name: "",
    birthDate: null,
    mgmtNumber: null,
    memo: null,
    services: initialServices,
  };

  const [services, setServices] = useState<ServiceInput[]>(initialServices);

  function updateSvc(idx: number, patch: Partial<ServiceInput>) {
    setServices((arr) => arr.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }
  function removeSvc(idx: number) {
    setServices((arr) => (arr.length > 1 ? arr.filter((_, i) => i !== idx) : arr));
  }

  function svcDays(s: ServiceInput): number[] {
    return (s.defaultDays ?? "").split(",").filter(Boolean).map(Number).sort((a, b) => a - b);
  }
  function toggleDay(idx: number, dow: number) {
    setServices((arr) =>
      arr.map((s, i) => {
        if (i !== idx) return s;
        const set = new Set(svcDays(s));
        if (set.has(dow)) set.delete(dow);
        else set.add(dow);
        const days = [...set].sort((a, b) => a - b);
        // 빠진 요일의 시간대 오버라이드는 제거
        const map = parseDaySlots(s.daySlots);
        const pruned: Record<number, string> = {};
        for (const d of days) if (map[d]) pruned[d] = map[d];
        return {
          ...s,
          defaultDays: days.join(",") || null,
          daySlots: serializeDaySlots(pruned, days, s.defaultSlot),
        };
      }),
    );
  }
  function setDaySlot(idx: number, dow: number, slot: string) {
    setServices((arr) =>
      arr.map((s, i) => {
        if (i !== idx) return s;
        const map = parseDaySlots(s.daySlots);
        map[dow] = slot;
        return { ...s, daySlots: serializeDaySlots(map, svcDays(s), s.defaultSlot) };
      }),
    );
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
      <div className="label-block">받는 치료</div>

      {services.map((s, i) => {
        const days = svcDays(s);
        const overrides = parseDaySlots(s.daySlots);
        const tName =
          (s.therapistId != null ? therapists.find((t) => t.id === s.therapistId)?.name : null) ??
          therapistName ??
          "본인";
        return (
          <div key={i} style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-md)",
            padding: 14,
            marginBottom: 10,
          }}>
            {services.length > 1 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-mute)" }}>서비스 {i + 1}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ color: "var(--danger)" }}
                  onClick={() => removeSvc(i)}
                >제거</button>
              </div>
            )}
            <input type="hidden" name={`svc[${i}][id]`} value={s.id ?? ""} />
            <input type="hidden" name={`svc[${i}][serviceType]`} value={s.serviceType} />
            {/* 담당 치료사는 본인으로 고정 — 서버에서 자동 배정 */}
            <input type="hidden" name={`svc[${i}][therapistId]`} value="" />
            <input type="hidden" name={`svc[${i}][defaultDays]`} value={s.defaultDays ?? ""} />
            <input type="hidden" name={`svc[${i}][daySlots]`} value={s.daySlots ?? ""} />

            <div className="form-grid">
              <div className="field">
                <label>서비스 종류 <span className="sub-mute">(내 설정의 치료사 종류로 고정)</span></label>
                <input
                  className="input"
                  value={s.serviceType}
                  readOnly
                  style={{ background: "var(--surface)", cursor: "not-allowed" }}
                />
              </div>
              <div className="field">
                <label>담당 치료사 <span className="sub-mute">(본인으로 고정)</span></label>
                <input
                  className="input"
                  value={tName}
                  readOnly
                  style={{ background: "var(--surface)", cursor: "not-allowed" }}
                />
              </div>
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
              <div className="field">
                <label>월 본인부담금 (원) <span className="sub-mute">(선택)</span></label>
                <input
                  className="input"
                  name={`svc[${i}][monthlyCopay]`}
                  type="number"
                  min={0}
                  step={1000}
                  value={s.monthlyCopay ?? ""}
                  onChange={(e) => updateSvc(i, { monthlyCopay: e.target.value ? Number(e.target.value) : null })}
                />
                <div className="sub-mute" style={{ fontSize: 11, marginTop: 4 }}>
                  부모님이 매월 내는 금액. 일정표 만들 때 자동 채워져요.
                </div>
              </div>
              <div className="field">
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
              <div className="daypick">
                {WEEK.map((w, dow) => {
                  const on = days.includes(dow);
                  return (
                    <div
                      key={w}
                      className={"daychip" + (on ? " on" : "") + (dow === 0 ? " sun" : "")}
                      onClick={() => toggleDay(i, dow)}
                    >{w}</div>
                  );
                })}
              </div>
            </div>

            {days.length > 0 && (
              <div className="field" style={{ marginTop: 12 }}>
                <label>
                  요일별 시간 <span className="sub-mute">(요일마다 다르면 변경 — 비워두면 기본 시간대 적용)</span>
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {days.map((dow) => (
                    <div key={dow} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 700, minWidth: 24, textAlign: "center" }}>{WEEK[dow]}</span>
                      <select
                        className="select"
                        style={{ width: "auto", minWidth: 130 }}
                        value={overrides[dow] || s.defaultSlot || ""}
                        onChange={(e) => setDaySlot(i, dow, e.target.value)}
                      >
                        <option value="">— 미지정 —</option>
                        {slots.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <input type="hidden" name="serviceCount" value={services.length} />

      <div className="divider" />
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" type="submit">{submitLabel}</button>
        <Link className="btn btn-ghost" href="/children">취소</Link>
      </div>
    </form>
  );
}
