import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { parseServiceTypes } from "@/lib/constants";

// 아동 일괄 등록용 기본 양식(.xlsx) 다운로드.
// 첫 줄: 컬럼 헤더 + 도움말 행 + 예시 2건.
// 같은 아동이 여러 서비스를 받으면 줄을 여러 개 작성해 같은 사람으로 묶이게 함.

export async function GET() {
  const user = await requireRole(["OWNER", "ADMIN"]);
  const center = await prisma.center.findUnique({
    where: { id: user.centerId ?? -1 },
    select: { serviceTypes: true, name: true },
  });
  const services = parseServiceTypes(center?.serviceTypes);
  const exampleService1 = services[0] ?? "언어재활";
  const exampleService2 = services[1] ?? services[0] ?? "놀이치료";

  const ws_data: (string | number)[][] = [
    // 헤더
    ["성명", "생년월일", "서비스", "담당", "시간", "요일", "단가", "목표 회기", "메모"],
    // 도움말 행 (회색으로 보이게 안내문)
    [
      "필수",
      "예: 19.04.02",
      `예: ${services.join(" / ")}`,
      "치료사 이름",
      "예: 10:00-10:50",
      "예: 월, 수",
      "예: 65000",
      "예: 5",
      "선택",
    ],
    // 예시 1 — 한 아동, 한 서비스
    ["김바로", "19.04.02", exampleService1, "이언어", "10:00-10:50", "월, 수", 65000, 5, ""],
    // 예시 2 — 다른 아동
    ["강일지", "20.09.07", exampleService2, "김놀이", "13:30-14:20", "목, 금", 65000, 5, ""],
    // 예시 3 — 같은 김바로가 다른 서비스도 받음 (같은 사람으로 자동 묶임)
    ["김바로", "19.04.02", exampleService2, "김놀이", "14:20-15:10", "수", 65000, 4, "같은 아동의 두 번째 서비스"],
  ];

  const ws = XLSX.utils.aoa_to_sheet(ws_data);
  ws["!cols"] = [
    { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 10 },
    { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 18 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "아동등록");

  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = encodeURIComponent(
    `${center?.name ?? "바로일지"}_아동등록_양식.xlsx`
  );

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
