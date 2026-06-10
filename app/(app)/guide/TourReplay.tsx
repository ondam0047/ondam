"use client";

// 도움말 페이지에서 인앱 투어를 다시 실행하는 버튼.
// localStorage 의 완료 표시를 지운 뒤 페이지를 새로 고침.

export default function TourReplay({ userId }: { userId: number }) {
  function replay() {
    try {
      localStorage.removeItem(`baroilji_tour_done_v1_${userId}`);
    } catch {}
    // 사이드바 셀렉터가 살아있는 대시보드로 보내며 새로고침
    window.location.assign("/dashboard");
  }
  return (
    <button type="button" className="btn btn-primary" onClick={replay}>
      인앱 투어 다시 보기
    </button>
  );
}
