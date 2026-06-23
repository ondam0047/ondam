"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// 로그인 후 1회 노출되는 "새로워진 점" 안내. 버전 문자열을 바꾸면 다음 로그인에 다시 뜬다.
// (신규 가입자는 환영/투어가 있으므로, 환영을 이미 본 기존 사용자에게만 표시)
const VERSION = "2026-06-23";

const NEW = [
  ["🆕", "기타지원사업 기록지", "지원사업 양식(.hwpx)을 올리면 칸을 인식해 채워서 한글로 출력해요. 회기가 양식 칸보다 많으면 여러 장(ZIP)으로 자동 분할."],
  ["✨", "AI 자동매핑", "어떤 기록지 양식이든 올리면 AI가 이름·날짜·시간·결과 칸을 자동으로 잡아줘요. 한 번 맞춘 양식은 다음부터 자동 적용."],
  ["🆕", "바로툴 대상자 · 모니터링", "내 아동과 별개로 바로툴 개인 대상자를 관리하고, 이름을 누르면 측정 추이를 모니터링해요."],
  ["♻️", "도움말 정리", "주제별 칸(카드)으로 깔끔하게 — 필요한 항목만 눌러 사용법 영상·단계를 봐요."],
  ["🛠", "화면 개선", "대시보드·기록지 등 화면을 더 촘촘하게 정리해 스크롤을 줄이고, 매핑 화면을 보기 쉽게 바꿨어요."],
];

export default function UpdateModal({ userId }: { userId: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      const seen = localStorage.getItem(`baroilji_update_seen_${VERSION}`);
      const welcomed = localStorage.getItem(`baroilji_welcome_seen_v1_${userId}`);
      if (!seen && welcomed) setShow(true);
    } catch {}
  }, [userId]);

  const close = () => {
    try { localStorage.setItem(`baroilji_update_seen_${VERSION}`, "1"); } catch {}
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.45)",
        display: "grid", placeItems: "center", padding: 16,
      }}
    >
      <div style={{
        background: "var(--surface)", borderRadius: "var(--r-lg)", border: "1px solid var(--border)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)", width: "min(520px, 100%)", maxHeight: "85vh", overflowY: "auto",
      }}>
        <div style={{ padding: "20px 22px 14px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--primary)", letterSpacing: "0.04em" }}>업데이트 안내</div>
          <h2 style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 800 }}>✨ 바로일지가 새로워졌어요</h2>
        </div>
        <div style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
          {NEW.map(([icon, title, desc], i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
              <span style={{ fontSize: 15, flex: "0 0 auto" }}>{icon}</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
                <div className="sub-mute" style={{ fontSize: 12.5, lineHeight: 1.6, wordBreak: "keep-all" }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: "14px 22px 20px", display: "flex", gap: 10, alignItems: "center", borderTop: "1px solid var(--border)" }}>
          <Link href="/guide" onClick={close} className="btn btn-ghost btn-sm">📖 자세히 — 도움말</Link>
          <button onClick={close} className="btn btn-primary" style={{ marginLeft: "auto", padding: "10px 22px", fontWeight: 700 }}>
            확인했어요
          </button>
        </div>
      </div>
    </div>
  );
}
