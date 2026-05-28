import { NextRequest } from "next/server";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import path from "node:path";

type SessionInput = { day: number; weekday: string; time: string; makeup: boolean };

type Payload = {
  childName: string;
  childBirth?: string;
  therapist: string;
  serviceType: string;
  year: number;
  month: number;
  mgmtNumber?: string;
  writeDate: string;
  pvOrg: string;
  pvTel: string;
  pvCharge: string;
  pvType: string;
  costUnit: string;       // e.g. "65,000"
  costSelf: string;       // e.g. "0"
  costTotal: number;
  cycle: string;          // e.g. "수 목"
  target: number;
  sessions: SessionInput[];
};

const TEMPLATE_PATH = path.join(process.cwd(), "samples", "일정표_template.hwpx");

// 양식 원본 값 (이 값들을 새 값으로 치환)
const TEMPLATE_VALUES = {
  title: "서비스 일정표 (2월)",
  name: "노하은",
  therapist: "주채린",
  writeDate: "26.01.28",
  org: "온담말언어발달센터",
  phone: "775-0047",
  cycle: "수 목",
  daysList: "4 5 11 12 26",
  // 비용 표
  costUnit: "65,000원",
  costTotal: "325,000원",
  // 서비스 종류 — 양식엔 "언어" + "재활" 두 hp:t 런으로 쪼개져 있음
  typeFirstRun: "언어",
  typeSecondRun: "재활",
};

function buildNewCalendarDays(year: number, month: number): string[] {
  const dim = new Date(year, month, 0).getDate();
  const offset = new Date(year, month - 1, 1).getDay(); // 0=일
  const arr = new Array(28).fill("");
  for (let d = 1; d <= dim; d++) {
    const pos = offset + d - 1;
    if (pos < 28) arr[pos] = String(d);
  }
  return arr; // 1..28 자리에 들어갈 값 (없으면 빈 문자열)
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function substituteSectionXml(xml: string, p: Payload): string {
  let out = xml;

  // 제목
  out = out.replace(
    `<hp:t>${TEMPLATE_VALUES.title}</hp:t>`,
    `<hp:t>${xmlEscape(`서비스 일정표 (${p.month}월)`)}</hp:t>`
  );

  // 이름 (유일)
  out = out.replace(
    `<hp:t>${TEMPLATE_VALUES.name}</hp:t>`,
    `<hp:t>${xmlEscape(p.childName)}</hp:t>`
  );

  // 치료사 (제공자 + 담당 두 번 모두) — replaceAll
  out = out.split(`<hp:t>${TEMPLATE_VALUES.therapist}</hp:t>`).join(
    `<hp:t>${xmlEscape(p.therapist)}</hp:t>`
  );

  // 작성일자 (유일)
  out = out.replace(
    `<hp:t>${TEMPLATE_VALUES.writeDate}</hp:t>`,
    `<hp:t>${xmlEscape(p.writeDate)}</hp:t>`
  );

  // 기관명
  out = out.replace(
    `<hp:t>${TEMPLATE_VALUES.org}</hp:t>`,
    `<hp:t>${xmlEscape(p.pvOrg)}</hp:t>`
  );

  // 전화
  out = out.replace(
    `<hp:t>${TEMPLATE_VALUES.phone}</hp:t>`,
    `<hp:t>${xmlEscape(p.pvTel)}</hp:t>`
  );

  // 주기
  out = out.replace(
    `<hp:t>${TEMPLATE_VALUES.cycle}</hp:t>`,
    `<hp:t>${xmlEscape(p.cycle)}</hp:t>`
  );

  // 제공일 목록
  const daysList = p.sessions.map((s) => s.day).join(" ");
  out = out.replace(
    `<hp:t>${TEMPLATE_VALUES.daysList}</hp:t>`,
    `<hp:t>${xmlEscape(daysList)}</hp:t>`
  );

  // 서비스 종류 — '언어' + '재활' 두 런이 두 군데(제공현황·비용) 등장
  // '언어' → 새 종류 전체, '재활' → 빈 문자열
  out = out.split(`<hp:t>${TEMPLATE_VALUES.typeFirstRun}</hp:t>`).join(
    `<hp:t>${xmlEscape(p.serviceType)}</hp:t>`
  );
  out = out.split(`<hp:t>${TEMPLATE_VALUES.typeSecondRun}</hp:t>`).join(`<hp:t></hp:t>`);

  // 비용 단가
  out = out.replace(
    `<hp:t>${TEMPLATE_VALUES.costUnit}</hp:t>`,
    `<hp:t>${xmlEscape(p.costUnit)}원</hp:t>`
  );
  out = out.replace(
    `<hp:t>${TEMPLATE_VALUES.costTotal}</hp:t>`,
    `<hp:t>${xmlEscape(p.costTotal.toLocaleString("ko-KR"))}원</hp:t>`
  );

  // 횟수(target)와 본인부담금(self) — 위치 인식: 단가/총가 행 뒤에 나오는 단일 숫자 셀
  // 양식 원본: 횟수=5 (`<hp:t>5</hp:t>`가 65,000원 셀과 325,000원 셀 사이),
  //          본인부담금=0 (325,000원 셀 다음 `<hp:t>0</hp:t>`)
  // 위에서 이미 65,000원·325,000원을 사용자 값으로 치환했으므로,
  // 그 새 값들을 앵커로 사용.
  const newUnit = `<hp:t>${xmlEscape(p.costUnit)}원</hp:t>`;
  const newTotal = `<hp:t>${xmlEscape(p.costTotal.toLocaleString("ko-KR"))}원</hp:t>`;

  // newUnit 뒤 첫 `<hp:t>5</hp:t>` → target 으로 치환
  const targetRe = new RegExp(
    escapeRegex(newUnit) + `([\\s\\S]*?)<hp:t>5</hp:t>`
  );
  out = out.replace(targetRe, `$&`.replace(`<hp:t>5</hp:t>`, `<hp:t>${p.target}</hp:t>`));
  // safer: 다시 명시적으로 한 번 더 — 위에 정규식이 안 맞을 수 있어서
  const targetRe2 = new RegExp(
    escapeRegex(newUnit) + `([\\s\\S]*?)<hp:t>5</hp:t>`
  );
  out = out.replace(targetRe2, (whole) =>
    whole.replace(/<hp:t>5<\/hp:t>([^<]*)$/, `<hp:t>${p.target}</hp:t>$1`)
  );

  // newTotal 뒤 첫 `<hp:t>0</hp:t>` → costSelf
  const selfRe = new RegExp(
    escapeRegex(newTotal) + `([\\s\\S]*?)<hp:t>0</hp:t>`
  );
  out = out.replace(selfRe, (whole) =>
    whole.replace(/<hp:t>0<\/hp:t>([^<]*)$/, `<hp:t>${xmlEscape(p.costSelf)}</hp:t>$1`)
  );

  // ─── 캘린더 영역 처리 ──────────────────────────────────────────────────
  // 4개의 hp:tbl 중 두 번째가 캘린더
  const tblStarts: number[] = [];
  const tblRe = /<hp:tbl /g;
  let m: RegExpExecArray | null;
  while ((m = tblRe.exec(out)) !== null) tblStarts.push(m.index);
  if (tblStarts.length >= 2) {
    const calStart = tblStarts[1];
    const calEnd = out.indexOf("</hp:tbl>", calStart) + "</hp:tbl>".length;
    let cal = out.slice(calStart, calEnd);

    // 회기 시간 모두 비우기
    cal = cal.replace(/<hp:t>\d{2}:\d{2}~\d{2}:\d{2}<\/hp:t>/g, `<hp:t></hp:t>`);

    // 날짜 1..28을 새 달의 자리에 맞게 재배치
    const newDays = buildNewCalendarDays(p.year, p.month);
    let expected = 1;
    cal = cal.replace(/<hp:t>(\d{1,2})<\/hp:t>/g, (match, ds: string) => {
      const n = Number(ds);
      if (n === expected && expected <= 28) {
        const v = newDays[expected - 1];
        expected++;
        return `<hp:t>${v}</hp:t>`;
      }
      return match;
    });

    out = out.slice(0, calStart) + cal + out.slice(calEnd);
  }

  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function POST(req: NextRequest) {
  const p = (await req.json()) as Payload;

  let templateBuf: Buffer;
  try {
    templateBuf = await readFile(TEMPLATE_PATH);
  } catch {
    return Response.json(
      { error: "템플릿(samples/일정표_template.hwpx)을 찾을 수 없어요." },
      { status: 500 }
    );
  }

  const zip = await JSZip.loadAsync(templateBuf);
  const sectionFile = zip.file("Contents/section0.xml");
  if (!sectionFile) {
    return Response.json({ error: "section0.xml 없음" }, { status: 500 });
  }

  const xml = await sectionFile.async("string");
  const newXml = substituteSectionXml(xml, p);
  zip.file("Contents/section0.xml", newXml);

  const outBytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    mimeType: "application/hwp+zip",
  });
  // Response 가 Uint8Array<ArrayBufferLike> 를 받지 못하므로 일반 ArrayBuffer 로 변환
  const ab = outBytes.buffer.slice(
    outBytes.byteOffset,
    outBytes.byteOffset + outBytes.byteLength
  ) as ArrayBuffer;

  const filename = encodeURIComponent(
    `${p.childName || "일정표"}_${p.year}년${String(p.month).padStart(2, "0")}월.hwpx`
  );
  return new Response(ab, {
    headers: {
      "Content-Type": "application/hwp+zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
