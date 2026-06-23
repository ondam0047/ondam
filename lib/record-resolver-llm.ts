// 규칙 리졸버(resolveForm)가 못 잡는 양식을 LLM으로 보완하는 폴백.
// 핵심 신뢰성 설계: LLM에 (table,row,col) 좌표를 되돌려 받지 않는다(환각 위험).
// 각 후보 칸에 안정적 ID를 부여하고 LLM은 {id → role}만 고른다. 좌표 복원은 서버가 한다.

import { ROLE_DEFS, ALL_ROLES } from "@/lib/record-roles";

export type SlimCell = { r: number; c: number; cs: number; rs: number; text: string; role?: string | null };
export type LlmSuggestion = { table: number; row: number; col: number; role: string; confidence: number };

// 지시문·주석 칸(채움 대상 아님) 휴리스틱 — 후보에서 제외해 토큰 절약 + 오탐 감소.
function isNoise(text: string): boolean {
  if (!text) return true;
  if (/[※☞]/.test(text)) return true;
  if (/(바랍니다|받아야|기재하|표기합니다|확인하고|작성요령|서명)/.test(text)) return true;
  return text.length > 40;
}

const MODEL = process.env.AI_MAP_MODEL || "claude-sonnet-4-6";

// grid(표×셀) → LLM 역할 제안. API 키 없으면 { error:"no_key" }.
export async function llmSuggestRoles(
  grid: SlimCell[][],
  opts: { title?: string } = {},
): Promise<{ suggestions: LlmSuggestion[]; model: string } | { error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: "no_key" };

  // 후보 칸 + 안정 ID
  const id2coord: Array<{ table: number; row: number; col: number }> = [];
  const lines: string[] = [];
  grid.forEach((cells, ti) => {
    cells.forEach((cell) => {
      const text = (cell.text ?? "").trim();
      if (isNoise(text)) return;
      const id = id2coord.length;
      id2coord.push({ table: ti, row: cell.r, col: cell.c });
      lines.push(`${id}\t표${ti}\t${text || "(빈칸)"}`);
    });
  });
  if (id2coord.length === 0) return { suggestions: [], model: MODEL };

  const roleList = ROLE_DEFS.map((r) => `- ${r.role} (${r.kind === "row" ? "회기반복" : "단일"}): ${r.desc}`).join("\n");

  const system =
    "너는 한국 치료·복지 '서비스 제공 기록지'(.hwpx 표)를 분석해 각 칸의 역할을 분류하는 전문가다. " +
    "표의 라벨 칸이 아니라, 값이 들어갈 '입력 칸'에만 역할을 부여한다. " +
    "예: '이용자 성명' 라벨 칸이 아니라 그 옆 빈칸이 대상자이름. '(  )회차'·'(  /  )'·'(  :  )'처럼 괄호 안이 빈 칸은 채움 대상이다. " +
    "확신이 없으면 그 칸은 결과에서 제외한다(아무 역할도 주지 않는다).";

  const instruction =
    `다음 역할 중에서만 고른다:\n${roleList}\n\n` +
    "규칙:\n" +
    "- 단일(scalar) 역할은 문서 전체에서 가장 적절한 한 칸에만 부여(중복 금지).\n" +
    "- 회기반복(row) 역할(회차·날짜·시작·종료·결과)은 회기 수만큼 여러 칸에 부여 가능. 각 회기의 해당 칸마다 같은 역할을 준다.\n" +
    "- 라벨/제목/안내 문구 칸에는 역할을 주지 않는다.\n" +
    "- 반드시 아래 JSON만 출력. 다른 텍스트 금지.\n" +
    `{"map":[{"id":<번호>,"role":"<역할>","confidence":<0~1>}]}\n\n` +
    (opts.title ? `문서 제목: ${opts.title}\n\n` : "") +
    "칸 목록 (id\\t표번호\\t텍스트):\n" + lines.join("\n");

  let raw: string;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system,
        messages: [{ role: "user", content: instruction }],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { error: `api_${res.status}${t ? `: ${t.slice(0, 200)}` : ""}` };
    }
    const data = await res.json();
    raw = (data?.content ?? []).map((b: { text?: string }) => b.text ?? "").join("");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "request_failed" };
  }

  // JSON 추출(코드펜스 제거 후 첫 { … } 블록)
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0) return { error: "parse_failed" };
  let parsed: { map?: Array<{ id: number; role: string; confidence?: number }> };
  try { parsed = JSON.parse(cleaned.slice(start, end + 1)); } catch { return { error: "parse_failed" }; }

  const seenScalar = new Set<string>();
  const scalarRoles = new Set(ROLE_DEFS.filter((r) => r.kind === "scalar").map((r) => r.role));
  const suggestions: LlmSuggestion[] = [];
  for (const m of parsed.map ?? []) {
    const coord = id2coord[m.id];
    if (!coord || !ALL_ROLES.has(m.role)) continue;
    if (scalarRoles.has(m.role)) {
      if (seenScalar.has(m.role)) continue; // scalar 중복 제거(가장 먼저 나온 것만)
      seenScalar.add(m.role);
    }
    suggestions.push({ ...coord, role: m.role, confidence: typeof m.confidence === "number" ? m.confidence : 0.7 });
  }
  return { suggestions, model: MODEL };
}
