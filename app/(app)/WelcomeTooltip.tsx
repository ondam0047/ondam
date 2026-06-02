"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// 첫 로그인 시 환영 모달. localStorage 로 한 번만 노출.
// 사용자 역할별로 핵심 안내 4-5개.

type Role = "OWNER" | "ADMIN" | "THERAPIST";

// 사용자별로 한 번씩만 노출. 키는 baroilji_welcome_seen_* 패턴 — SessionGuard 가
// 다른 사용자로 바뀌어도 보존되도록 (각 사용자가 본인 처음에만 봄).
function storageKey(userId: number) {
  return `baroilji_welcome_seen_v1_${userId}`;
}

const TIPS: Record<Role, { emoji: string; title: string; body: React.ReactNode }[]> = {
  OWNER: [
    { emoji: "", title: "내 사물함",
      body: <>본인 자료는 본인만 봅니다. 다른 사람에게 절대 노출되지 않아요.</> },
    { emoji: "", title: "내 설정",
      body: <>왼쪽 <b>[내 설정]</b> 에서 본인 정보·치료 영역·시간대를 먼저 맞춰주세요.</> },
    { emoji: "", title: "내 아동",
      body: <><b>[내 아동]</b> 에서 본인 담당 아동을 등록하면 매월 일정표·기록지에서 자동 호출돼요.</> },
    { emoji: "", title: "일정표 · 기록지",
      body: <>매월 한 번씩 [일정표] · [기록지] 작성 → 한글파일(.hwpx) 다운로드 → 인쇄·제출.</> },
    { emoji: "", title: "도움말",
      body: <>왼쪽 맨 아래 <b>[도움말]</b> 에서 자세한 사용 설명서 + PDF 다운로드.</> },
  ],
  ADMIN: [
    { emoji: "", title: "아동 관리",
      body: <><b>[아동 관리]</b> 에서 등록·수정·담당 치료사 배정을 합니다.</> },
    { emoji: "", title: "치료사 시간표",
      body: <><b>[치료사 시간표]</b> 에서 선생님별 월간 스케줄·출석부를 확인하세요.</> },
    { emoji: "", title: "엑셀 가져오기",
      body: <>전자바우처 엑셀을 그대로 올리면 자동으로 아동 명단 추출.</> },
    { emoji: "", title: "도움말",
      body: <>왼쪽 맨 아래 <b>[도움말]</b> 에서 행정용 매뉴얼 PDF 다운로드.</> },
  ],
  THERAPIST: [
    { emoji: "", title: "내 아동",
      body: <><b>[내 아동]</b> 에서 본인 담당 아동을 직접 등록·수정할 수 있어요.</> },
    { emoji: "", title: "일정표",
      body: <>'전월 일정 복사' 버튼으로 지난달 패턴을 그대로 가져와 빠르게 만들기.</> },
    { emoji: "", title: "기록지",
      body: <>전자바우처 엑셀 업로드 → 자동 회기 추출 → '전월 기록 가져오기' 로 빠른 작성.</> },
    { emoji: "", title: "도움말",
      body: <>왼쪽 맨 아래 <b>[도움말]</b> 에서 치료사용 매뉴얼 PDF 다운로드.</> },
  ],
};

export default function WelcomeTooltip({ role, userId }: { role: Role; userId: number }) {
  const [open, setOpen] = useState(false);
  const KEY = storageKey(userId);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) {
        setOpen(true);
      }
    } catch {}
  }, [KEY]);

  function close() {
    try { localStorage.setItem(KEY, "1"); } catch {}
    setOpen(false);
  }

  if (!open) return null;

  const tips = TIPS[role] ?? TIPS.THERAPIST;
  const roleLabel = role === "ADMIN" ? "행정 선생님" : "선생님";

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 50,
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <div style={{
        background: "var(--surface)",
        borderRadius: "var(--r-lg)",
        maxWidth: 540,
        width: "100%",
        maxHeight: "90vh",
        overflowY: "auto",
        boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
      }}>
        <div style={{
          padding: "26px 28px 16px",
          background: "linear-gradient(135deg, var(--primary-soft), #F8FBFE)",
          borderRadius: "var(--r-lg) var(--r-lg) 0 0",
          borderBottom: "1px solid var(--border)",
        }}>
          <div style={{ fontSize: 13, color: "var(--text-mute)", fontWeight: 600 }}>처음 사용하세요?</div>
          <h2 style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 800 }}>
            {roleLabel}, 환영합니다
          </h2>
          <div style={{ marginTop: 6, fontSize: 13.5, color: "var(--text-soft)" }}>
            바로일지 사용 전 알아두면 좋은 5가지.
          </div>
        </div>

        <div style={{ padding: "8px 16px 6px" }}>
          {tips.map((t, i) => (
            <div key={i} style={{
              display: "grid",
              gridTemplateColumns: "44px 1fr",
              gap: 12,
              padding: "12px 8px",
              borderBottom: i < tips.length - 1 ? "1px solid var(--border)" : "none",
            }}>
              <span style={{ fontSize: 22, lineHeight: 1.2 }}>{t.emoji}</span>
              <div>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>{t.title}</div>
                <div style={{ fontSize: 13, color: "var(--text-soft)", lineHeight: 1.6 }}>{t.body}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{
          padding: "14px 22px 18px",
          display: "flex",
          gap: 10,
          justifyContent: "flex-end",
          borderTop: "1px solid var(--border)",
          background: "var(--surface-2)",
          borderRadius: "0 0 var(--r-lg) var(--r-lg)",
        }}>
          <Link className="btn btn-ghost" href="/guide" onClick={close}>전체 매뉴얼 보기</Link>
          <button className="btn btn-primary" onClick={close}>시작하기</button>
        </div>
      </div>
    </div>
  );
}
