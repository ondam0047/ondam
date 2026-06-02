import * as XLSX from "xlsx";
import { requireRole } from "@/lib/auth";

// 아동 일괄 등록용 기본 양식(.xlsx) 다운로드.
// 1인 사물함 모드 — 서비스 종류는 본인 설정으로 자동 지정되므로 양식엔 없음.
// 컬럼은 일정표·기록지에서 아동을 불러올 때 자동으로 채워지는 값들과 1:1.

export async function GET() {
  await requireRole(["OWNER", "ADMIN"]);

  // 헤더 + 예시 2건. (예시 행은 그대로 두면 같이 등록되니 업로드 전에 지워주세요.)
  const ws_data: (string | number)[][] = [
    ["성명", "생년월일", "담당", "시간", "요일", "단가", "본인부담금", "목표 회기", "메모"],
    ["김바로", "19.04.02", "이언어", "10:00-10:50", "월, 수", 65000, 40000, 5, ""],
    ["강일지", "20.09.07", "김놀이", "13:30-14:20", "목, 금", 65000, 40000, 5, ""],
  ];

  const ws = XLSX.utils.aoa_to_sheet(ws_data);
  ws["!cols"] = [
    { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 14 },
    { wch: 10 }, { wch: 10 }, { wch: 11 }, { wch: 10 }, { wch: 18 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "아동등록");

  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = encodeURIComponent("아동 등록 양식.xlsx");

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
