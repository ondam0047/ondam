// 규칙 리졸버(resolveForm)가 못 잡는 양식을 LLM으로 보완하는 폴백.
// 핵심 신뢰성 설계: LLM에 (table,row,col) 좌표를 되돌려 받지 않는다(환각 위험).
// 각 후보 칸에 안정적 ID를 부여하고 LLM은 {id → role}만 고른다. 좌표 복원은 서버가 한다.
//
// 2026-06 업그레이드(다양한 기타지원사업 양식 일반화):
//  - 표를 평면 나열이 아니라 2D 격자(행×열)로 렌더 → 모델이 라벨↔값의 공간관계를 직접 본다.
//  - 규칙 리졸버가 이미 찾은 역할을 «인식:..» 힌트로 동봉(결정론+LLM 하이브리드).
//  - 긴 서술칸(결과 narrative)도 후보에 포함(길이로 버리지 않고 표시만 절단).
//  - 확장 사고(adaptive thinking)로 레이아웃 추론, 구조화 출력(json_schema+enum)으로 파싱 신뢰성 확보.
//  - 고정 시스템부 프롬프트 캐싱.

import { ROLE_DEFS, ALL_ROLES, rolesForForm, type FormType } from "@/lib/record-roles";

export type SlimCell = { r: number; c: number; cs: number; rs: number; text: string; role?: string | null; p?: number; paras?: string[] };
export type LlmSuggestion = { table: number; row: number; col: number; p: number; role: string; confidence: number };

// 채움 대상이 아닌 '안내/지시문' 칸 — id 를 주지 않고 격자에 맥락으로만 표시.
// (긴 데이터 서술은 더 이상 제외하지 않는다 — 결과 narrative 가 값칸이므로.)
function isInstruction(text: string): boolean {
  if (!text) return false;
  if (/[※☞]/.test(text)) return true;
  if (/(바랍니다|받아야|기재하|표기합니다|확인하고|작성요령|유의사항|아래와\s*같이|해당사항|기입)/.test(text)) return true;
  return false;
}

function clip(s: string, n = 60): string {
  const t = (s ?? "").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

// ── 개인정보 마스킹 ───────────────────────────────────────────────
// 매핑에는 '라벨(양식 구조어)'과 칸 구조만 필요하고, 작성된 값(이름·날짜·기관명·임상서술)은
// 불필요하다. 사용자가 빈 양식이 아니라 작성된 양식을 올려도 Anthropic(국외)에 PII가
// 전송되지 않도록, 라벨로 인식되는 칸만 원문 전송하고 그 외 작성값은 내용을 가린다.
const LABEL_TOKENS: string[] = [...new Set(
  ROLE_DEFS.flatMap((r) => [r.role, ...r.synonyms]).concat([
    "이름", "대상자", "서비스종류", "주기", "제공일", "관리번호", "작성일자", "제공영역",
    "상태", "주요기능", "기능상태", "욕구", "서비스목표", "제공인력", "제공자", "내용",
  ]),
)].map((s) => s.replace(/\s/g, ""));

function isLabel(norm: string): boolean {
  if (!norm || norm.length > 16) return false;
  if (/\d{3,}/.test(norm)) return false; // 숫자가 많으면 값(날짜·번호·금액)
  return LABEL_TOKENS.some((t) => t.length >= 2 && norm.includes(t));
}

// 칸 표시값 — 라벨은 원문, 작성값은 마스킹, 빈칸은 (빈칸).
function cellDisplay(text: string): string {
  const t = (text ?? "").trim();
  if (!t) return "(빈칸)";
  const norm = t.replace(/\s/g, "");
  if (isLabel(norm)) return `"${clip(t)}"`;
  if (/\d/.test(norm) && /[.\-/:]/.test(norm)) return "(작성된 날짜·시간값)";
  if (t.length > 20) return "(작성된 서술값)";
  return "(작성된 값)";
}

// 모델 — 업그레이드된 입력(2D 격자)·확장사고·결정론 힌트 덕에 Sonnet 4.6 으로 대부분 충분.
// 특이·난해한 양식에서 더 강한 추론이 필요하면 AI_MAP_MODEL=claude-opus-4-8 로 환경변수 전환.
const MODEL = process.env.AI_MAP_MODEL || "claude-sonnet-4-6";

// grid(표×셀) → LLM 역할 제안. API 키 없으면 { error:"no_key" }.
export async function llmSuggestRoles(
  grid: SlimCell[][],
  opts: { title?: string; formType?: FormType } = {},
): Promise<{ suggestions: LlmSuggestion[]; model: string } | { error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: "no_key" };

  // 후보 칸 + 안정 ID. 한 칸에 여러 줄(문단)이 든 칸은 문단마다 별도 후보(p).
  const id2coord: Array<{ table: number; row: number; col: number; p: number }> = [];

  // 표를 2D 격자로 렌더 — 행마다 칸을 열 순서로 나열, 라벨/값/빈칸/병합/긴서술/이미인식 힌트 포함.
  let detected = 0;
  const blocks: string[] = [];
  grid.forEach((cells, ti) => {
    if (!cells.length) return;
    const rows = [...new Set(cells.map((c) => c.r))].sort((a, b) => a - b);
    const lines: string[] = [];
    for (const r of rows) {
      const rowCells = cells.filter((c) => c.r === r).sort((a, b) => a.c - b.c);
      const parts: string[] = [];
      for (const cell of rowCells) {
        const span = (cell.cs > 1 || cell.rs > 1) ? `〔${cell.cs}×${cell.rs}〕` : "";
        const roleHint = cell.role ? ` «인식:${cell.role}»` : "";
        if (cell.role) detected++;
        const paras = cell.paras && cell.paras.length ? cell.paras : [(cell.text ?? "").trim()];
        const multi = paras.length > 1;
        const sub: string[] = [];
        paras.forEach((ptext, pi) => {
          const t = (ptext ?? "").trim();
          if (isInstruction(t)) {
            sub.push(`「안내문」`);
            return;
          }
          const id = id2coord.length;
          id2coord.push({ table: ti, row: cell.r, col: cell.c, p: multi ? pi : 0 });
          // 라벨만 원문, 작성된 값은 마스킹 — Anthropic 으로 PII 미전송.
          const body = cellDisplay(t);
          sub.push(`${multi ? `문단${pi} ` : ""}[id=${id}]${body}`);
        });
        parts.push(`c${cell.c}${span}: ${sub.join(" / ")}${roleHint}`);
      }
      lines.push(` r${r} │ ${parts.join("   ")}`);
    }
    blocks.push(`[표${ti}]\n${lines.join("\n")}`);
  });
  if (id2coord.length === 0) return { suggestions: [], model: MODEL };

  // 양식 종류(기록지/일정표)에 맞는 역할만 후보로 — enum·프롬프트 모두 이걸로 좁혀 섞임 방지.
  const candidateRoles = rolesForForm(opts.formType);
  const roleNames = candidateRoles.map((r) => r.role);
  const roleList = candidateRoles.map((r) => `- ${r.role} (${r.kind === "row" ? "회기반복" : "단일"}): ${r.desc}`).join("\n");
  const formTypeLine =
    opts.formType === "schedule"
      ? "[양식 종류] 이 양식은 '일정표'다. 회기별 결과/시간 칸이 아니라 관리번호·단가·횟수·총금액·본인부담금·주기·제공일 같은 라벨 칸과 대상자·기관·작성일자 정보를 채운다. (월 달력 격자는 시스템이 따로 처리하니 날짜 칸 하나하나는 매핑하지 말 것.)\n\n"
      : opts.formType === "record"
        ? "[양식 종류] 이 양식은 '기록지'다. 회기별 날짜·시간·결과와 대상자 정보를 채운다.\n\n"
        : "";

  // ── 고정 시스템부(프롬프트 캐싱 대상) ──
  const system =
    "너는 한국의 치료·복지·교육 분야 '서비스 제공 기록지/일지·일정표'(.hwpx 표)를 읽고, 각 칸에 들어갈 값의 역할을 분류하는 전문가다.\n\n" +
    formTypeLine +
    "[입력 형식] 각 표는 행(r)×열(c) 격자로 주어진다. 같은 r은 가로 한 줄, 같은 c는 세로 한 열이다. " +
    "각 칸은 `c{열}: [id=번호]내용` 형태이며, 〔가로×세로〕는 병합 칸 크기다. " +
    "라벨 칸은 \"성명\"처럼 원문이 보이고, 값이 들어갈 칸은 (빈칸)=빈 칸, (작성된 값)/(작성된 날짜·시간값)/(작성된 서술값)=이미 값이 든 칸(개인정보 보호를 위해 내용은 가렸지만 모두 '값칸'이다)으로 표시된다. " +
    "「안내문」은 채우면 안 되는 지시문, «인식:역할»은 1차 규칙엔진이 이미 추정한 역할(참고 힌트)이다.\n\n" +
    "[목표] 라벨 칸이 아니라 '값이 들어갈 칸'의 id에 역할을 부여한다. 값칸은 보통 라벨의 오른쪽(같은 r, 다음 c) 또는 아래(같은 c, 다음 r)의 빈칸/서술칸이다. " +
    "예: r1에 c0=\"성명\"(라벨)·c1=(빈칸)이면 c1이 대상자이름이다. «인식:..» 힌트는 대체로 맞으니 존중하되, 빠뜨린 칸을 보완하고 틀린 힌트는 바로잡는다.\n\n" +
    "[양식 다양성] 바우처 양식뿐 아니라 교육청·지자체·기관 자체 일지 등 라벨이 제각각이다('기관명/제공기관명/센터', '일자/날짜/제공일자', '결과/서비스내용/이용자의 상태 및 재활 결과' 등). " +
    "표기가 달라도 의미로 역할을 판단한다.\n\n" +
    "[역할 목록 — 이 중에서만 선택]\n" + roleList + "\n\n" +
    "[지침]\n" +
    "- 회기반복(row) 역할(회차·날짜·시작·종료·결과·비고): 회기마다 한 칸씩, 회기 수만큼 모두. 같은 표에서 행(또는 열)이 반복되면 각 행(열)의 해당 칸을 전부 매핑한다(빠뜨리지 말 것).\n" +
    "- 한 칸에 '이용자의 상태 및 재활 결과'처럼 상태와 결과가 합쳐져 있으면 결과로. '서비스 내용/결과'는 결과로.\n" +
    "- ⚠ '비고'는 '비고'·'특이사항'이라고 라벨이 붙은 별도 서술 칸일 때만 부여한다. 그 외에는 비고로 추측하지 말 것.\n" +
    "- ⚠ 확인·서명·날인 칸(예: '이용자(확인)', '보호자 확인', '서명', '날인', '(인)', '확인란' 등 사람이 사인·도장하는 자리)에는 어떤 역할도 주지 않는다. 특히 이런 칸을 비고나 결과로 분류하지 말 것.\n" +
    "- 결제·비용표의 '(  )회차' 칸은 금액칸이므로 회차 금지. 날짜·시간이 함께 있는 실제 회기의 회차만 회차로.\n" +
    "- 라벨/제목/「안내문」 칸에는 역할을 주지 않는다.\n" +
    "- ⚠ 애매하면 '제외'가 우선이다. 옆/위 라벨이 그 역할을 분명히 가리킬 때만 부여하라. 특히 값을 직접 써넣는 단일 역할(연도·서비스종류·학교·학년 등)은 해당 라벨이 명확히 보일 때만 매핑하고, 막연한 추측은 하지 말 것(잘못 채우면 엉뚱한 칸에 값이 들어간다).\n" +
    "- 단일(scalar) 역할은 보통 한 칸이지만, 같은 값이 여러 위치에 필요하면(예: 치료사 이름이 상단과 서명란 양쪽) 여러 칸에 줄 수 있다.";

  const instruction =
    (opts.title ? `문서 제목: ${opts.title}\n\n` : "") +
    `규칙엔진이 이미 인식한 칸 ${detected}개(«인식:..» 표시). 이를 참고해 전체를 완성하라.\n\n` +
    "표(격자):\n" + blocks.join("\n\n") +
    "\n\n각 값칸의 id에 알맞은 역할과 확신도(confidence 0~1)를 부여해 출력하라.";

  // 구조화 출력 스키마 — role 은 유효 역할 enum, 파싱 실패 경로 제거.
  const schema = {
    type: "object",
    properties: {
      map: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "integer" },
            role: { type: "string", enum: roleNames },
            confidence: { type: "number" },
          },
          required: ["id", "role", "confidence"],
          additionalProperties: false,
        },
      },
    },
    required: ["map"],
    additionalProperties: false,
  };

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
        max_tokens: 16000,
        // 레이아웃 공간추론용 사고 — 단, 예산을 한정한다. adaptive(무제한)는 복잡·다칸
        // 양식에서 사고가 폭주해 max_tokens 를 사고에 다 써버리고 출력(JSON)을 못 내
        // parse_failed 가 났다. budget_tokens 로 묶어 출력 토큰(≥10k)을 항상 확보.
        thinking: { type: "enabled", budget_tokens: 6000 },
        // 출력 형식을 스키마로 강제 — 항상 유효한 JSON(role enum 검증 포함).
        output_config: { format: { type: "json_schema", schema } },
        system: [
          { type: "text", text: system, cache_control: { type: "ephemeral" } },
        ],
        messages: [{ role: "user", content: instruction }],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { error: `api_${res.status}${t ? `: ${t.slice(0, 200)}` : ""}` };
    }
    const data = await res.json();
    // 사고(thinking) 블록은 text 가 없으니 자연히 제외되고 답변 텍스트(JSON)만 모인다.
    raw = (data?.content ?? []).map((b: { text?: string }) => b.text ?? "").join("");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "request_failed" };
  }

  // 구조화 출력이라 보통 순수 JSON이지만, 안전망으로 코드펜스 제거 + 첫 {…} 추출.
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0) return { error: "parse_failed" };
  let parsed: { map?: Array<{ id: number; role: string; confidence?: number }> };
  try { parsed = JSON.parse(cleaned.slice(start, end + 1)); } catch { return { error: "parse_failed" }; }

  // 같은 (칸,문단)에 중복 제안만 제거. scalar 가 여러 칸(상단+서명란 등)에 오는 건 허용.
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
