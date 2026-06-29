import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readSection0, readHeader, patchSection0, patchFiles } from "@/lib/hwpx";
import { getCellRunCharPr, addClonedCharPr } from "@/lib/hwpx-charpr";
import { fillCells } from "@/lib/record-fill";
import { resolveForm, buildSampleEdits, applyOverrides } from "@/lib/record-resolver";
import { removeTableColumns, removeTableRows } from "@/lib/record-trim";

function parseOverrides(v: FormDataEntryValue | null) {
  if (typeof v !== "string" || v.length < 2) return [];
  try { return JSON.parse(v) as Array<{ table: number; row: number; col: number; role: string }>; } catch { return []; }
}

// 업로드한 양식에 더미 샘플 데이터를 채워 .hwpx 로 돌려줌 — 미리보기 안전망.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) return Response.json({ error: "no file" }, { status: 400 });

  const srcBuf = Buffer.from(await file.arrayBuffer());
  let xml: string;
  try {
    xml = readSection0(srcBuf);
  } catch {
    return Response.json({ error: "분석할 수 없는 파일이에요." }, { status: 422 });
  }

  const { spec } = resolveForm(xml);
  applyOverrides(spec, parseOverrides(form.get("overrides")));

  // 값 칸 글자 통일(normCharPr) — 실제 출력과 동일하게 미리보기에서도 글자 모양/색/크기를 맞춘다.
  // 대표 값 칸(날짜·이름·시작·기관)의 글자속성을 복제해 검정·동일크기·굵게/기울임/밑줄 제거.
  // ※ trim 으로 열이 빠지기 전(원본 좌표 유효) 상태에서 기준 칸 글자속성을 읽는다.
  let header: string | null = null;
  let normCharPr: number | undefined;
  const normBase = spec.date?.[0] ?? spec.name ?? spec.start?.[0] ?? spec.org;
  if (normBase) {
    const baseId = getCellRunCharPr(xml, normBase[0], normBase[1], normBase[2]);
    if (baseId != null) {
      const r = addClonedCharPr(readHeader(srcBuf), baseId, { normalize: true, textColor: "#000000" });
      if (r) { header = r.xml; normCharPr = r.id; }
    }
  }

  // ?trim=1 이면 5칸 초과 회기 열을 물리적으로 제거(실험).
  const trim = new URL(req.url).searchParams.get("trim") === "1";
  if (trim && spec.dateTable != null && spec.extraSessionCols?.length) {
    // 남은 회기열(spec.date)에 지운 폭을 재분배 → 표 너비 유지로 우측이 다른 표와 정렬됨.
    xml = removeTableColumns(xml, spec.dateTable, spec.extraSessionCols, { redistributeTo: spec.date.map((d) => d[2]) });
  }
  if (trim && spec.resultTable != null && spec.extraResultRows?.length) {
    xml = removeTableRows(xml, spec.resultTable, spec.extraResultRows);
  }
  const filled = fillCells(xml, buildSampleEdits(spec, normCharPr));
  const out = header
    ? patchFiles(srcBuf, { "Contents/section0.xml": filled, "Contents/header.xml": header })
    : patchSection0(srcBuf, filled);

  return new Response(new Uint8Array(out), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="sample-filled.hwpx"`,
    },
  });
}
