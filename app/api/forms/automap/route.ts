import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { llmSuggestRoles, type SlimCell } from "@/lib/record-resolver-llm";

// 클라이언트가 들고 있는 격자(slimGrid)를 받아 LLM이 역할을 제안한다.
// 규칙 리졸버가 못 잡은 칸을 보완하는 용도 — 사람이 확인 후 저장(human-in-the-loop).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: { grid?: SlimCell[][]; title?: string; formType?: "record" | "schedule" };
  try { body = await req.json(); } catch { return Response.json({ error: "invalid json" }, { status: 400 }); }
  const grid = body.grid;
  if (!Array.isArray(grid) || grid.length === 0) {
    return Response.json({ error: "격자 데이터가 없어요." }, { status: 400 });
  }
  const formType = body.formType === "record" || body.formType === "schedule" ? body.formType : undefined;

  // 제목 추정 — 첫 표의 첫 텍스트 칸
  const title = body.title || grid.flat().map((c) => c?.text?.trim()).find((t) => t && t.length > 2);

  const result = await llmSuggestRoles(grid, { title, formType });
  if ("error" in result) {
    const status = result.error === "no_key" ? 503 : 502;
    const msg = result.error === "no_key"
      ? "서버에 AI 키(ANTHROPIC_API_KEY)가 설정되지 않았어요."
      : `AI 매핑 실패: ${result.error}`;
    return Response.json({ error: msg }, { status });
  }
  return Response.json(result);
}
