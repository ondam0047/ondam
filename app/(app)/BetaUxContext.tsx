"use client";

import { createContext, useContext } from "react";

// 새 베타 UX 노출 여부 — 레이아웃에서 서버 판정값을 주입, 클라 컴포넌트는 훅으로 사용.
const BetaUxContext = createContext(false);

export function BetaUxProvider({ value, children }: { value: boolean; children: React.ReactNode }) {
  return <BetaUxContext.Provider value={value}>{children}</BetaUxContext.Provider>;
}

export function useBetaUx(): boolean {
  return useContext(BetaUxContext);
}
