"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// 로그인 후 1회 노출되는 "새로워진 점" 안내. 버전 문자열을 바꾸면 다음 로그인에 다시 뜬다.
// (신규 가입자는 환영/투어가 있으므로, 환영을 이미 본 기존 사용자에게만 표시)
const VERSION = "2026-07-20";

const NEW = [
  ["🫧", "바로조음 — 조음기관 3D (바로툴)", "혀·입술·연구개의 움직임을 3D로 보여주는 ‘바로조음’이 바로툴에 새로 들어왔어요. 한국어 자음·모음의 조음 위치를 눈으로 보며 익힐 수 있어요. (Pro 요금제)"],
  ["🎤", "마이크로 /ㅅ/ 실시간 연습", "훈련 탭에서 마이크에 「스~」를 내면 소리를 듣고 3D 혀가 실시간으로 움직여요. 정확한 치조 위치면 혀가 앞·기류 초록, 구개음화(혀가 뒤로)되면 뒤·기류 빨강으로 바로 보여줘요."],
  ["🏎️", "잘하면 자동차가 달려요", "맑은 「스~」를 유지하는 동안 자동차가 결승선까지 달리고, 도착하면 응원 소리가 나요. 아동 동기부여용 강화 장치예요."],
  ["🧭", "비교·훈련·음소산출 3가지", "목표와 실제 조음을 나란히 비교하고, 오류→목표 애니메이션으로 훈련하고, 음소별 산출까지 한 화면에서 탭으로 넘겨가며 써요."],
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
          <Link href="/tools/articulation" onClick={close} className="btn btn-ghost btn-sm">🫧 바로조음 열기</Link>
          <button onClick={close} className="btn btn-primary" style={{ marginLeft: "auto", padding: "10px 22px", fontWeight: 700 }}>
            확인했어요
          </button>
        </div>
      </div>
    </div>
  );
}
