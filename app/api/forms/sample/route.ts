import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readSection0, readHeader, patchSection0, patchFiles } from "@/lib/hwpx";
import { getCellRunCharPr, addClonedCharPr } from "@/lib/hwpx-charpr";
import { fillCells, type Coord } from "@/lib/record-fill";
import { resolveForm, buildSampleEdits, applyOverrides, scopeSpecToKind } from "@/lib/record-resolver";
import { removeTableColumns, removeTableRows } from "@/lib/record-trim";
import type { CalOpts } from "@/lib/schedule-calendar";

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

  const resolved = resolveForm(xml);
  let spec = resolved.spec;
  applyOverrides(spec, parseOverrides(form.get("overrides")));
  // 슬롯(kind)이 지정되면 그 영역만 채워 미리보기 — 통합 양식을 두 슬롯에 같은 파일로 올릴 때 영역 분리.
  const kindParam = new URL(req.url).searchParams.get("kind");
  if (kindParam === "record" || kindParam === "schedule") spec = scopeSpecToKind(spec, kindParam);

  // 값 글자 통일 — 미리보기를 실제 출력기와 동일 기준으로 맞춘다(기록지=generateRecordFromForm, 일정표=generateScheduleFromForm).
  // ※ trim 전(원본 좌표 유효) 상태에서 기준 칸 글자속성을 읽는다. header 1회 패치.
  let header = readHeader(srcBuf);
  let usedHeader = false;
  const mk = (baseId: number | null, opts: { height?: number; textColor?: string; normalize?: boolean }): number | undefined => {
    if (baseId == null) return undefined;
    const r = addClonedCharPr(header, baseId, opts);
    if (!r) return undefined;
    header = r.xml; usedHeader = true;
    return r.id;
  };
  const isSchedule = kindParam === "schedule";
  const cal = spec.scheduleCalendar;
  // 라벨/값 통일 기준칸 — 출력기와 동일: 일정표=라벨 첫칸(없으면 달력 내용칸), 기록지=날짜/이름/시작/기관.
  const normBase: Coord | undefined = isSchedule
    ? (spec.schedule?.[0]?.coord
        ?? (spec.manual?.[0] ? [spec.manual[0].table, spec.manual[0].row, spec.manual[0].col, spec.manual[0].p ?? 0] as Coord : undefined)
        ?? (cal ? [cal.table, cal.weeks[0].contentRow, cal.cols[0].startCol] as Coord : undefined))
    : (spec.date?.[0] ?? spec.name ?? spec.start?.[0] ?? spec.org);
  const normCharPr = normBase ? mk(getCellRunCharPr(xml, normBase[0], normBase[1], normBase[2]), { normalize: true, textColor: "#000000" }) : undefined;

  // 일정표 달력 — 출력기(generateScheduleFromForm)와 동일하게 날짜 숫자·시간·공휴일 통일 charPr.
  let calOpts: CalOpts | undefined;
  if (isSchedule && cal) {
    const isCombined = /제공기관명/.test(xml);
    const wkCol = cal.cols.find((c) => c.dow !== 0) ?? cal.cols[0];
    const baseNum = getCellRunCharPr(xml, cal.table, cal.weeks[0].numberRow, wkCol.startCol);
    const conBase = getCellRunCharPr(xml, cal.table, cal.weeks[0].contentRow, cal.cols[0].startCol);
    const conH = isCombined ? { height: 600 } : {};
    calOpts = {
      numCharPr: mk(baseNum, { normalize: true, textColor: "#000000" }),
      redCharPr: mk(baseNum, { normalize: true, textColor: "#FF0000" }),
      timeCharPr: mk(conBase, { normalize: true, textColor: "#000000", ...conH }),
      holidayCharPr: mk(conBase, { normalize: true, textColor: "#FF0000", ...conH }),
    };
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
  const filled = fillCells(xml, buildSampleEdits(spec, normCharPr, calOpts));
  const out = usedHeader
    ? patchFiles(srcBuf, { "Contents/section0.xml": filled, "Contents/header.xml": header })
    : patchSection0(srcBuf, filled);

  return new Response(new Uint8Array(out), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="sample-filled.hwpx"`,
    },
  });
}
