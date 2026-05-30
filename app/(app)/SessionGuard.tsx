"use client";

import { useEffect } from "react";

// 로그인된 사용자가 바뀌면 이전 사용자의 localStorage 작업 캐시를 지움.
// 일정표·기록지 미리보기 등이 다음 사용자에게 새지 않도록.
export default function SessionGuard({ userId }: { userId: number }) {
  useEffect(() => {
    try {
      const KEY = "baroilji_user_id";
      const saved = localStorage.getItem(KEY);
      if (saved !== String(userId)) {
        // baroilji_* 로 시작하는 모든 키 제거
        const toRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith("baroilji_")) toRemove.push(k);
        }
        for (const k of toRemove) localStorage.removeItem(k);
        localStorage.setItem(KEY, String(userId));
      }
    } catch {}
  }, [userId]);

  return null;
}
