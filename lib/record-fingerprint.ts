// 양식 지문 — 같은 구조의 기록지를 식별하는 안정적 해시.
// 표 개수·각 표의 크기/셀수 + '라벨'(비어있지 않은 셀 텍스트)의 위치를 기준으로 한다.
// 빈 값칸은 제외하므로 빈 템플릿을 한글에서 재저장해도 동일 지문이 나온다.

import { createHash } from "node:crypto";
import type { Grid } from "@/lib/record-resolver";

export function formFingerprint(grid: Grid): string {
  const parts = grid.map((cells) => {
    const maxR = cells.length ? Math.max(...cells.map((c) => c.r + c.rs)) : 0;
    const maxC = cells.length ? Math.max(...cells.map((c) => c.c + c.cs)) : 0;
    // 라벨(비어있지 않은 norm 텍스트)만 — 위치와 함께. 값칸(빈칸)은 채움 여부와 무관하게 제외.
    const labels = cells.filter((c) => c.norm).map((c) => `${c.r},${c.c}:${c.norm}`).sort();
    return `${maxR}x${maxC}#${cells.length}|${labels.join("|")}`;
  });
  return createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 32);
}
