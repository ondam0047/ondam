// 규칙 리졸버(resolveForm)가 못 잡는 양식을 LLM으로 보완하는 폴백.
// 핵심 신뢰성 설계: LLM에 (table,row,col) 좌표를 되돌려 받지 않는다(환각 위험).
// 각 후보 칸에 안정적 ID를 부여하고 LLM은 {id → role}만 고른다. 좌표 복원은 서버가 한다.

import { ROLE_DEFS, ALL_ROLES } from "@/lib/record-roles";

export type SlimCell = { r: number; c: number; cs: number; rs: number; text: string; role?: string | null; p?: number; paras?: string[] };
export type LlmSuggestion = { table: number; row: number; col: number; p: number; role: string; confidence: number };

// 지시문·주석 칸(채움 대상 아님) 휴리스틱 — 후보에서 제외해 토큰 절약 + 오탐 감소.
// 빈칸은 '값이 들어갈 칸'이라 후보에 반드시 포함한다(제외하면 LLM이 라벨만 보고 오답).
function isNoise(text: string): boolean {
  if (!text) return false;
  if (/[※☞]/.test(text)) return true;
  if (/(바랍니다|받아야|기재하|표기합니다|확인하고|작성요령)/.test(text)) return true;
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

  // 후보 칸 + 안정 ID. 좌표(행 r·열 c)를 함께 줘서 LLM이 표의 공간 구조를 이해하게 한다.
  // 한 칸에 여러 줄(문단)이 든 칸은 문단마다 별도 후보(p)로 펼친다.
  const id2coord: Array<{ table: number; row: number; col: number; p: number }> = [];
  const blocks: string[] = [];
  grid.forEach((cells, ti) => {
    const lines: string[] = [];
    cells.forEach((cell) => {
      const paras = cell.paras && cell.paras.length ? cell.paras : [(cell.text ?? "").trim()];
      const span = cell.cs > 1 || cell.rs > 1 ? ` ${cell.cs}x${cell.rs}` : "";
      if (paras.length > 1) {
        paras.forEach((ptext, pi) => {
          const t = (ptext ?? "").trim();
          if (isNoise(t)) return;
          const id = id2coord.length;
          id2coord.push({ table: ti, row: cell.r, col: cell.c, p: pi });
          lines.push(`  id=${id} r${cell.r} c${cell.c}${span} 문단${pi}: ${t || "(빈칸)"}`);
        });
      } else {
        const t = (paras[0] ?? "").trim();
        if (isNoise(t)) return;
        const id = id2coord.length;
        id2coord.push({ table: ti, row: cell.r, col: cell.c, p: 0 });
        lines.push(`  id=${id} r${cell.r} c${cell.c}${span}: ${t || "(빈칸)"}`);
      }
    });
    if (lines.length) blocks.push(`[표${ti}]\n${lines.join("\n")}`);
  });
  if (id2coord.length === 0) return { suggestions: [], model: MODEL };

  const roleList = ROLE_DEFS.map((r) => `- ${r.role} (${r.kind === "row" ? "회기반복" : "단일"}): ${r.desc}`).join("\n");

  const system =
    "너는 한국 치료·복지 '서비스 제공 기록지'(.hwpx 표)의 각 칸 역할을 분류하는 전문가다. " +
    "각 칸에는 좌표 r(행)·c(열)이 있다. 같은 r끼리는 가로 한 줄, 같은 c끼리는 세로 한 열이다. " +
    "핵심: 라벨 칸(글자가 적힌 칸)이 아니라, 값이 들어갈 '빈칸'(빈칸이거나 괄호만 있는 칸)의 id를 고른다. " +
    "값칸은 보통 라벨의 오른쪽(같은 r, 다음 c) 또는 아래(같은 c, 다음 r)의 빈칸이다. " +
    "예: r0 c0='이용자 성명'(라벨)이면 그 오른쪽 r0 c2 빈칸이 대상자이름이다. 확신이 없으면 제외한다.";

  const instruction =
    `역할 목록(이 중에서만 선택):\n${roleList}\n\n` +
    "지침:\n" +
    "- 단일(scalar) 역할: 보통 한 칸이지만, 같은 값이 다른 위치에도 필요하면(예: 치료사 이름이 상단 '제공인력' 칸과 하단 '제공인력 확인' 서명란 양쪽) 여러 칸에 줄 수 있다. 라벨이 아니라 값칸의 id를 고른다.\n" +
    "- '비고'·'종합의견 및 특이사항' 아래의 넓은 빈칸은 종합의견 역할로.\n" +
    "- 회기반복(row) 역할(회차·날짜·시작·종료·결과·비고): 한 회기마다 한 칸씩, 회기 수만큼 모두. " +
    "한 회기의 칸은 보통 같은 행 또는 같은 열에 모이고 회기가 늘면 반복된다. 서비스 내용·결과 칸이 회기 행마다 있으면 각각 결과로.\n" +
    "- '내용/결과'·'서비스 내용' 칸은 결과, '비고'·'특이사항' 칸은 비고로 구분한다. 둘이 따로 있으면 각각 다른 역할을 주고, 회기 수만큼 모두 매핑한다(빠뜨리지 말 것).\n" +
    "- '문단0','문단1'처럼 한 칸이 여러 줄(문단)로 나뉜 경우, 각 문단을 개별 입력칸으로 보고 알맞은 역할을 부여하라. " +
    "예: 제공회차 칸이 문단0='( )회차', 문단1='( / )', 문단2='( : )', 문단3='( : )'이면 → 문단0=회차, 문단1=날짜, 문단2=시작, 문단3=종료.\n" +
    "- 결제·비용·금액 표의 '(  )회차' 칸은 회차별 금액칸이므로 회차 역할 금지. 날짜·시간이 함께 있는 실제 회기의 회차만.\n" +
    "- 라벨/제목/안내 문구 칸에는 역할을 주지 않는다.\n" +
    "- 반드시 아래 JSON만 출력(다른 텍스트 금지):\n" +
    `{"map":[{"id":<번호>,"role":"<역할>","confidence":<0~1>}]}\n\n` +
    (opts.title ? `문서 제목: ${opts.title}\n\n` : "") +
    "칸 목록:\n" + blocks.join("\n\n");

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

  // 같은 (칸,문단)에 중복 제안만 제거. scalar가 여러 칸(상단+서명란 등)에 오는 건 허용.
  const seenCell = new Set<string>();
  const suggestions: LlmSuggestion[] = [];
  for (const m of parsed.map ?? []) {
    const coord = id2coord[m.id];
    if (!coord || !ALL_ROLES.has(m.role)) continue;
    const ck = `${coord.table},${coord.row},${coord.col},${coord.p}`;
    if (seenCell.has(ck)) continue;
    seenCell.add(ck);
    suggestions.push({ ...coord, role: m.role, confidence: typeof m.confidence === "number" ? m.confidence : 0.7 });
  }
  return { suggestions, model: MODEL };
}
