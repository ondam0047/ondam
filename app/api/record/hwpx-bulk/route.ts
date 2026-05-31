import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, getEffectiveTherapistId } from "@/lib/auth";
import { pad } from "@/lib/constants";
import {
  buildRecordSheets,
  buildManualRecordSheets,
  bundleAsZip,
  readRecordTemplate,
  readManualRecordTemplate,
  safeFileName,
  type RecordPayload,
} from "@/lib/record-hwpx";

// 한 사용자의 (연·월) 저장된 모든 기록지를 한 번에 .hwpx 생성 → ZIP 으로.
//   GET /api/record/hwpx-bulk?year=2026&month=2
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const year = Number(req.nextUrl.searchParams.get("year"));
  const month = Number(req.nextUrl.searchParams.get("month"));
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return Response.json({ error: "year/month required" }, { status: 400 });
  }

  const myTherapistId = await getEffectiveTherapistId(user);
  if (!myTherapistId) {
    return Response.json({ error: "치료사 정보가 없어요" }, { status: 400 });
  }

  const records = await prisma.record.findMany({
    where: {
      year,
      month,
      childService: {
        therapistId: myTherapistId,
        // 지투는 양식 준비 중 — 일괄 출력에서 자동 제외
        programType: "DEVREHAB",
        child: { centerId: user.centerId ?? -1 },
      },
    },
    include: {
      sessions: { orderBy: { ordinal: "asc" } },
      childService: { include: { child: true } },
    },
    orderBy: [{ childService: { child: { name: "asc" } } }],
  });

  if (records.length === 0) {
    return Response.json({ error: `${year}년 ${month}월 발달바우처로 저장된 기록지가 없어요.` }, { status: 404 });
  }

  // 수기 기록지 모드 — 전체 일괄에도 동일 적용. 모드에 따라 템플릿 선택.
  const center = await prisma.center.findUnique({
    where: { id: user.centerId ?? -1 },
    select: { manualMode: true, printUseDay: true, printPayDay: true, printApprNo: true },
  });
  const manualMode = center?.manualMode ?? false;
  const manualOpts = {
    manualMode: true,
    printUseDay: center?.printUseDay ?? true,
    printPayDay: center?.printPayDay ?? true,
    printApprNo: center?.printApprNo ?? true,
  };

  let templateBuf: Buffer;
  try {
    templateBuf = manualMode ? await readManualRecordTemplate() : await readRecordTemplate();
  } catch {
    return Response.json({ error: "템플릿 파일을 찾을 수 없어요." }, { status: 500 });
  }

  const files: { name: string; data: Buffer }[] = [];
  const usedNames = new Set<string>();

  for (const r of records) {
    const child = r.childService.child;
    const payload: RecordPayload = {
      childName: r.childName,
      childBirth: r.childBirth ?? "",
      org: r.org,
      month: r.month,
      sessions: r.sessions.map((s) => ({
        date: s.date ?? "",
        startTime: s.startTime ?? "",
        endTime: s.endTime ?? "",
        voucher: s.voucher ?? "",
        extra: s.extra ?? "",
        amount: s.amount ?? "",
        useDay: s.useDay ?? "",
        payDay: s.payDay ?? "",
        apprNumber: s.apprNumber ?? "",
        result: s.result ?? "",
        resultExtra: s.resultExtra ?? undefined,
      })),
      opinion: r.opinion ?? undefined,
    };
    const sheets = manualMode
      ? buildManualRecordSheets(templateBuf, payload, manualOpts)
      : buildRecordSheets(templateBuf, payload);

    const baseName = `${safeFileName(child.name)}_${pad(r.month)}월_기록지`;
    if (sheets.length === 1) {
      let name = `${baseName}.hwpx`;
      let n = 2;
      while (usedNames.has(name)) {
        name = `${baseName}_${n}.hwpx`;
        n++;
      }
      usedNames.add(name);
      files.push({ name, data: sheets[0] });
    } else {
      sheets.forEach((data, idx) => {
        let name = `${baseName}_${idx + 1}.hwpx`;
        let n = 2;
        while (usedNames.has(name)) {
          name = `${baseName}_${idx + 1}_${n}.hwpx`;
          n++;
        }
        usedNames.add(name);
        files.push({ name, data });
      });
    }
  }

  const zipBuf = bundleAsZip(files);
  const zipName = encodeURIComponent(`${year}년${pad(month)}월_기록지_모음_${records.length}건.zip`);
  return new Response(new Uint8Array(zipBuf), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${zipName}`,
    },
  });
}
