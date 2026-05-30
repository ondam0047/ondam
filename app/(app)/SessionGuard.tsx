"use client";

import { useEffect } from "react";

// 로그인된 사용자가 바뀌면 이전 사용자의 localStorage 작업 캐시를 지움.
// 일정표·기록지 미리보기 등이 다음 사용자에게 새지 않도록.
// 단, 환영 모달 표시 기록(baroilji_welcome_seen_*)은 사용자별로 따로 저장되니
// 다른 사용자가 와도 지우지 않음.
function shouldPreserve(key: string): boolean {
  // 환영 모달·인앱 투어는 사용자별로 한 번씩만 — 다른 사용자가 와도 본인 키는 유지.
  return key.startsWith("baroilji_welcome_seen_") || key.startsWith("baroilji_tour_done_");
}

export default function SessionGuard({ userId }: { userId: number }) {
  useEffect(() => {
    try {
      const KEY = "baroilji_user_id";
      const saved = localStorage.getItem(KEY);
      if (saved !== String(userId)) {
        const toRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith("baroilji_") && !shouldPreserve(k)) toRemove.push(k);
        }
        for (const k of toRemove) localStorage.removeItem(k);
        localStorage.setItem(KEY, String(userId));
      }
    } catch {}
  }, [userId]);

  return null;
}
