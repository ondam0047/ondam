"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// 로그인 후 1회 노출되는 "새로워진 점" 안내. 버전 문자열을 바꾸면 다음 로그인에 다시 뜬다.
// (신규 가입자는 환영/투어가 있으므로, 환영을 이미 본 기존 사용자에게만 표시)
const VERSION = "2026-06-12";

const NEW = [
  ["🆕", "우리 센터 양식", "센터 기록지·일정표(.hwpx)를 올려두면 그 양식 그대로 출력. 저장 시 자동 5칸 정리(6회기↑ 두 장)."],
  ["🆕", "이번 달", "한 화면에서 전 아동 일정·기록지 현황 + 칸 눌러 바로 작성 + 한꺼번에 받기."],
  ["🆕", "대시보드 검색창", "키워드(일정·기록지·양식·본인부담금…)로 원하는 화면으로 바로."],
  ["🆕", "바로툴 · 기타지원사업", "음성·말 모듈, 교육청 치료지원(마음모아) 일지 공개."],
  ["♻️", "메뉴 정리", "‘내 시간표’→일정표 월간 보기 탭 · ‘일괄 다운로드’→이번 달 · ‘승인내역 점검’→결제 겹침 찾기."],
  ["🛠", "개선", "내 아동 클릭 시 바로 수정 · 본인부담금 자유 입력 · 기록지 글자 정리 · 도움말 전면 갱신."],
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
