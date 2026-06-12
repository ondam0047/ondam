import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isRecordFormKey } from "@/lib/record-forms";
import { buildRecordSheets, readRecordTemplate, type RecordPayload } from "@/lib/record-hwpx";

// 첫 로그인 사용자가 "결과물"을 미리 보도록, 더미 데이터로 채운 샘플 기록지 1장.
//   GET /api/record/sample  → .hwpx 다운로드 (센터가 고른 서식으로)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const center = user.centerId
    ? await prisma.center.findUnique({ where: { id: user.centerId }, select: { recordForm: true, name: true } })
    : null;
  const form = isRecordFormKey(center?.recordForm) ? center!.recordForm : "standard";

  const now = new Date();
  const month = now.getMonth() + 1;
  const sample: RecordPayload = {
    childName: "예시아동",
    childBirth: "20.03.15",
    org: center?.name ?? "○○발달센터",
    month,
    serviceType: "언어재활",
    opinion: "이건 샘플입니다. 실제로는 회기 일정만 입력하면 이렇게 자동으로 채워집니다.",
    sessions: [
      { date: `${month}/3`,  startTime: "15:10", endTime: "16:00", voucher: "40", extra: "10", amount: "65,000", useDay: "", payDay: `${month}/3`,  apprNumber: "500000000001", result: "고빈도 어휘 산출 활동에서 목표 단어를 정조음하였다." },
      { date: `${month}/10`, startTime: "15:10", endTime: "16:00", voucher: "40", extra: "10", amount: "65,000", useDay: "", payDay: `${month}/10`, apprNumber: "500000000002", result: "문장 따라말하기에서 어순 오류가 줄었다." },
      { date: `${month}/17`, startTime: "15:10", endTime: "16:00", voucher: "40", extra: "10", amount: "65,000", useDay: "", payDay: `${month}/17`, apprNumber: "500000000003", result: "이야기 다시말하기에서 핵심 사건을 포함하였다." },
    ],
  };

  let buf: Buffer;
  try {
    buf = await readRecordTemplate(form);
  } catch {
    return Response.json({ error: "샘플 템플릿을 찾을 수 없어요." }, { status: 500 });
  }
  const sheet = buildRecordSheets(buf, sample, form)[0];
  const filename = encodeURIComponent("샘플_기록지.hwpx");
  return new Response(new Uint8Array(sheet), {
    headers: {
      "Content-Type": "application/hwp+zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
