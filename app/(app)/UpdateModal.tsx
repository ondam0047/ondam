"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// 로그인 후 1회 노출되는 "새로워진 점" 안내. 버전 문자열을 바꾸면 다음 로그인에 다시 뜬다.
// (신규 가입자는 환영/투어가 있으므로, 환영을 이미 본 기존 사용자에게만 표시)
const VERSION = "2026-06-29";

const NEW = [
  ["📝", "기록지·일정표 양식 따로 올리기", "우리 센터 양식을 ‘기록지 / 일정표’ 슬롯으로 나눠 올려요. 한 파일에 기록지와 일정표가 같이 있는 양식이면, 같은 파일을 양쪽 슬롯에 올리면 각자 자기 영역만 매핑·출력돼요."],
  ["🔤", "양식 글자 통일", "양식에 채워지는 글자의 크기·모양·색·밑줄·기울임이 칸마다 제각각이지 않고 깔끔하게 통일돼요. 일정표 달력의 시간 표시까지 동일하게 맞춰집니다."],
  ["📐", "회기 칸 5칸 자동 정리·너비 맞춤", "회기 칸이 5개를 넘는 양식은 자동으로 5칸으로 정리하고 표 너비를 옆 표와 맞춰 깔끔하게 출력해요. ‘샘플로 확인’도 실제 출력과 똑같이 보여줘요."],
  ["🕘", "승인일자+시간 한 칸 채움", "승인일자 칸 안에 날짜와 시간(:)이 위·아래로 같이 있는 양식도 날짜와 시간이 모두 채워져요."],
  ["🗂", "양식 저장 개수 안내", "기록지·일정표를 종류별로 여러 개 저장할 수 있어요(요금제별 Solo 2개·Pro 5개, 무료체험·베타 5개). 저장 화면에 현재 개수와 한도가 표시돼요."],
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
