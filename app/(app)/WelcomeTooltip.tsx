"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// 첫 로그인 시 환영 모달. localStorage 로 한 번만 노출.
// 바로일지는 '원장=치료사' 1인 사용이라 역할 분기 없이 단일 안내.

// 사용자별로 한 번씩만 노출. 키는 baroilji_welcome_seen_* 패턴 — SessionGuard 가
// 다른 사용자로 바뀌어도 보존되도록 (각 사용자가 본인 처음에만 봄).
function storageKey(userId: number) {
  return `baroilji_welcome_seen_v1_${userId}`;
}

const TIPS: { emoji: string; title: string; body: React.ReactNode }[] = [
  { emoji: "📄", title: "우리 센터 양식 그대로",
    body: <>쓰시던 기록지·일정표 한글파일(.hwpx)을 <b>[우리 센터 양식]</b> 에 올리면, 칸을 자동으로 인식해 <b>그 양식 그대로</b> 출력해요. 새로 만들 필요 없어요.</> },
  { emoji: "📊", title: "전자바우처 엑셀 자동 채움",
    body: <><b>[기록지]</b> 에 전자바우처 엑셀을 올리면 아동별 회기가 자동으로 채워져요. 결과만 입력하면 끝.</> },
  { emoji: "👶", title: "내 아동 한 번만 등록",
    body: <><b>[내 아동]</b> 에 담당 아동을 등록해두면 매월 일정표·기록지에서 자동으로 불러와요.</> },
  { emoji: "📅", title: "한글파일로 바로 출력",
    body: <>작성한 일정표·기록지는 한글파일(.hwpx)로 다운로드 → 인쇄·제출. <b>[이번 달]</b> 에서 전 아동치를 한 번에 받을 수도 있어요.</> },
  { emoji: "🔒", title: "내 사물함",
    body: <>본인 자료는 본인만 봅니다. 다른 사람에게 절대 노출되지 않아요.</> },
];

export default function WelcomeTooltip({ userId }: { userId: number }) {
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

  // Esc 로도 닫기 (어떤 오버레이가 위에 있어도 키보드로 빠져나오게)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 100001, // driver.js 오버레이(10000대)보다 항상 위 — 환영 모달이 가려져 클릭 막힘 방지

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
            선생님, 환영합니다 👋
          </h2>
          <div style={{ marginTop: 6, fontSize: 13.5, color: "var(--text-soft)" }}>
            바로일지 사용 전 알아두면 좋은 5가지.
          </div>
        </div>

        <div style={{ padding: "8px 16px 6px" }}>
          {TIPS.map((t, i) => (
            <div key={i} style={{
              display: "grid",
              gridTemplateColumns: "44px 1fr",
              gap: 12,
              padding: "12px 8px",
              borderBottom: i < TIPS.length - 1 ? "1px solid var(--border)" : "none",
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
