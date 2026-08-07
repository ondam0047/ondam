import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isRecordFormKey } from "@/lib/record-forms";
import {
  buildRecordSheets,
  bundleAsZip,
  readRecordTemplate,
  safeFileName,
  type RecordPayload,
} from "@/lib/record-hwpx";
import { generateRecordFromForm, repairScheduleSpec } from "@/lib/record-fill-spec";
import { buildSchedExtra, buildSchedCalSessions } from "@/lib/record-sched-enrich";
import { buildRecordSheetsHwp, buildRecordSheetsHwpFromForm, RECORD_TEMPLATE_HWP_PATH } from "@/lib/record-hwp";
import { acquireConvertSlot, releaseConvertSlot, GateBusyError } from "@/lib/convert-gate";
import { readFile } from "node:fs/promises";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const p = (await req.json()) as RecordPayload & {
    formId?: number;
    therapist?: string;
    childServiceId?: number;
    year?: number;
    format?: "hwpx" | "hwp"; // hwp = 한글 2002+ 호환 바이너리(구버전 센터용)
  };

  const baseName = `${safeFileName(p.childName)}_${String(p.month).padStart(2, "0")}월_기록지`;

  // .hwp 다운로드 — 내장 표준(발달바우처) 서식, 또는 .hwp 원본을 보관 중인 저장 양식.
  if (p.format === "hwp") {
    if (p.formId) {
      // 저장 양식 — .hwp 로 올린 원본이 있으면 그 원본으로 채워 내린다("올린 형식 그대로").
      const rf = await prisma.recordForm.findFirst({
        where: { id: Number(p.formId), ownerUserId: user.id, kind: "record" },
        select: { template: true, templateHwp: true, spec: true },
      });
      if (!rf) return Response.json({ error: "저장된 양식을 찾을 수 없어요." }, { status: 404 });
      if (!rf.templateHwp) {
        return Response.json(
          { error: "이 양식은 .hwp 원본이 없어 .hwp 다운로드를 지원하지 않아요. (.hwp 파일로 양식을 다시 올리면 열려요)" },
          { status: 400 },
        );
      }
      const specJson = repairScheduleSpec(rf.spec, Buffer.from(rf.template));
      let schedExtra: Record<string, string> | undefined;
      let schedCal: { day: number; time: string }[] | undefined;
      let hasSchedule = false;
      try {
        const sp = JSON.parse(specJson);
        hasSchedule = Array.isArray(sp?.schedule) && sp.schedule.length > 0;
      } catch { hasSchedule = false; }
      if (hasSchedule) {
        const month = Number(p.month) || new Date().getMonth() + 1;
        schedExtra = await buildSchedExtra({
          user, childServiceId: p.childServiceId, year: p.year, month,
          sessionDates: (p.sessions ?? []).map((s) => s.date ?? ""),
        });
        schedCal = await buildSchedCalSessions({ user, childServiceId: p.childServiceId, year: p.year, month });
      }
      try {
        await acquireConvertSlot();
      } catch (e) {
        if (e instanceof GateBusyError) return Response.json({ error: e.message }, { status: 429 });
        throw e;
      }
      let sheets2: Buffer[];
      try {
        sheets2 = await buildRecordSheetsHwpFromForm(
          Buffer.from(rf.templateHwp), specJson, p, p.therapist ?? "", schedExtra, p.year, schedCal,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : ".hwp 생성 중 문제가 생겼어요.";
        return Response.json({ error: msg }, { status: 500 });
      } finally {
        releaseConvertSlot();
      }
      if (sheets2.length === 1) {
        const filename = encodeURIComponent(`${baseName}.hwp`);
        return new Response(new Uint8Array(sheets2[0]), {
          headers: {
            "Content-Type": "application/x-hwp",
            "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
          },
        });
      }
      const zip2 = bundleAsZip(sheets2.map((data, idx) => ({ name: `${baseName}_${idx + 1}.hwp`, data })));
      const filename2 = encodeURIComponent(`${baseName}.zip`);
      return new Response(new Uint8Array(zip2), {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename*=UTF-8''${filename2}`,
        },
      });
    }
    // 지역 변형 서식(동탄·남양주)은 .hwp 템플릿 판이 아직 없어 표준형만 지원.
    const center = user.centerId
      ? await prisma.center.findUnique({ where: { id: user.centerId }, select: { recordForm: true } })
      : null;
    if (isRecordFormKey(center?.recordForm) && center!.recordForm !== "standard") {
      return Response.json(
        { error: "이 센터의 기록지 서식은 아직 .hwp 다운로드를 지원하지 않아요." },
        { status: 400 },
      );
    }
    let templateHwp: Buffer;
    try {
      templateHwp = await readFile(RECORD_TEMPLATE_HWP_PATH);
    } catch {
      return Response.json({ error: "기록지 .hwp 템플릿 파일을 찾을 수 없어요." }, { status: 500 });
    }
    // JVM 1개/요청(셀 채우기) — .hwp 변환과 같은 동시 실행 게이트를 공유.
    try {
      await acquireConvertSlot();
    } catch (e) {
      if (e instanceof GateBusyError) return Response.json({ error: e.message }, { status: 429 });
      throw e;
    }
    let hwpSheets: Buffer[];
    try {
      hwpSheets = await buildRecordSheetsHwp(templateHwp, p);
    } catch (e) {
      const msg = e instanceof Error ? e.message : ".hwp 생성 중 문제가 생겼어요.";
      return Response.json({ error: msg }, { status: 500 });
    } finally {
      releaseConvertSlot();
    }
    if (hwpSheets.length === 1) {
      const filename = encodeURIComponent(`${baseName}.hwp`);
      return new Response(new Uint8Array(hwpSheets[0]), {
        headers: {
          "Content-Type": "application/x-hwp",
          "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
        },
      });
    }
    const zip = bundleAsZip(hwpSheets.map((data, idx) => ({ name: `${baseName}_${idx + 1}.hwp`, data })));
    const filename = encodeURIComponent(`${baseName}.zip`);
    return new Response(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      },
    });
  }

  let sheets: Buffer[];

  if (p.formId) {
    // 저장한 우리 센터 양식으로 채움
    const rf = await prisma.recordForm.findFirst({
      where: { id: Number(p.formId), ownerUserId: user.id, kind: "record" },
      select: { template: true, spec: true },
    });
    if (!rf) return Response.json({ error: "저장된 양식을 찾을 수 없어요." }, { status: 404 });
    // 통합 양식(일정표+기록지 한 장)이면 일정표 라벨 데이터를 서버에서 보강.
    // legacy spec(일정표 매핑이 깎여 저장된 것)은 템플릿에서 재인식해 복구.
    const specJson = repairScheduleSpec(rf.spec, Buffer.from(rf.template));
    let schedExtra: Record<string, string> | undefined;
    let hasSchedule = false;
    try {
      const sp = JSON.parse(specJson);
      hasSchedule = Array.isArray(sp?.schedule) && sp.schedule.length > 0;
    } catch { hasSchedule = false; }
    let schedCal: { day: number; time: string }[] | undefined;
    if (hasSchedule) {
      const month = Number(p.month) || new Date().getMonth() + 1;
      schedExtra = await buildSchedExtra({
        user,
        childServiceId: p.childServiceId,
        year: p.year,
        month,
        sessionDates: (p.sessions ?? []).map((s) => s.date ?? ""),
      });
      schedCal = await buildSchedCalSessions({ user, childServiceId: p.childServiceId, year: p.year, month });
    }
    try {
      sheets = generateRecordFromForm(Buffer.from(rf.template), specJson, p, p.therapist ?? "", schedExtra, p.year, schedCal);
    } catch {
      return Response.json({ error: "양식에 데이터를 채우는 중 문제가 생겼어요." }, { status: 500 });
    }
  } else {
    // 우리 센터 양식 미등록 — 발달바우처 기본 서식(코드 내장 표준 양식)으로 출력.
    const center = user.centerId
      ? await prisma.center.findUnique({ where: { id: user.centerId }, select: { recordForm: true } })
      : null;
    const form = isRecordFormKey(center?.recordForm) ? center!.recordForm : "standard";
    let templateBuf: Buffer;
    try {
      templateBuf = await readRecordTemplate(form);
    } catch {
      return Response.json({ error: "기록지 템플릿 파일을 찾을 수 없어요." }, { status: 500 });
    }
    sheets = buildRecordSheets(templateBuf, p, form);
  }

  if (sheets.length === 1) {
    const filename = encodeURIComponent(`${baseName}.hwpx`);
    return new Response(new Uint8Array(sheets[0]), {
      headers: {
        "Content-Type": "application/hwp+zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      },
    });
  }

  const zipBuf = bundleAsZip(
    sheets.map((data, idx) => ({ name: `${baseName}_${idx + 1}.hwpx`, data })),
  );
  const filename = encodeURIComponent(`${baseName}.zip`);
  return new Response(new Uint8Array(zipBuf), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
