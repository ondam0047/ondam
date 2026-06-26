"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// 로그인 후 1회 노출되는 "새로워진 점" 안내. 버전 문자열을 바꾸면 다음 로그인에 다시 뜬다.
// (신규 가입자는 환영/투어가 있으므로, 환영을 이미 본 기존 사용자에게만 표시)
const VERSION = "2026-06-26b";

const NEW = [
  ["🗂", "종결함 서류 보관·다운로드", "종결한 아동도 저장된 일정표·기록지를 아동 옆 ‘서류’ 버튼에서 보고 한글파일로 받을 수 있어요. 한 아동의 전체 서류를 한 번에(.zip)도 가능."],
  ["✨", "AI 양식 자동매핑 개선", "기타지원사업에 양식(.hwpx)을 올렸을 때 칸 인식이 더 똑똑해졌어요 — 기관·날짜·결과·생년월일 등 양식 모양이 달라도 더 잘 잡아줍니다."],
  ["🛠", "승인내역 재업로드 오류 해결", "승인내역 엑셀을 더 넓은 기간으로 다시 올려도, ‘다시 시도/대시보드’ 오류 화면 없이 정상 작동해요."],
  ["📅", "일정표 ‘횟수’ 바로잡음", "일정표를 한글파일로 내려받을 때 ‘횟수’가 화면과 똑같이 실제 회기 수로 나와요(목표 회기수가 잘못 들어가던 것 수정)."],
  ["💰", "기록지 총이용금액 안정화", "총이용금액이 설정한 회당 단가 그대로 유지돼요. 엑셀을 넣거나 다른 아동을 거쳤다 와도 바뀌지 않고, 예전에 잘못 들어가 있던 금액도 한 번에 정리했어요."],
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
