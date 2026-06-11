// 바로툴 공용 검사 리포트 — 외부 라이브러리 없이 인쇄/PDF 친화적 HTML 생성·다운로드.
// 사용자가 열어 Ctrl/Cmd+P 로 PDF 저장 가능.
export interface ReportRow {
  label: string;
  value: string;
  ref?: string;
  status?: "normal" | "abnormal" | null;
}
export interface ReportSection {
  heading: string;
  rows: ReportRow[];
}
export interface ReportSpec {
  title: string;
  subtitle?: string;
  chartSvg?: string;
  sections: ReportSection[];
  footnote?: string;
  // 자동 기입: 대상자·치료사·측정일 (없으면 빈칸 출력)
  meta?: { subject?: string; clinician?: string; date?: string };
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const DISCLAIMER =
  "본 자료는 「의료기기법」의 적용을 받지 않는 학습·연습·시각화 보조 자료이며, 의료 진단·치료를 제공·대체하지 않습니다.";

function buildHtml(spec: ReportSpec): string {
  const dateStr = new Date().toLocaleString("ko-KR");
  const sectionsHtml = spec.sections
    .map((sec) => {
      const rows = sec.rows
        .map((r) => {
          const badge =
            r.status === "normal"
              ? `<span class="badge ok">정상</span>`
              : r.status === "abnormal"
                ? `<span class="badge bad">이상</span>`
                : r.ref
                  ? ``
                  : `<span class="badge ref">참고</span>`;
          return `<tr><td>${esc(r.label)}</td><td class="num">${esc(r.value)}</td><td class="ref">${esc(r.ref ?? "")}</td><td>${badge}</td></tr>`;
        })
        .join("");
      return `<h2>${esc(sec.heading)}</h2><table><thead><tr><th>지표</th><th>값</th><th>참고</th><th>판정</th></tr></thead><tbody>${rows}</tbody></table>`;
    })
    .join("");

  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(spec.title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", "Malgun Gothic", sans-serif; color:#1F2317; max-width: 800px; margin: 0 auto; padding: 32px 28px; }
  h1 { font-size: 22px; margin: 0; }
  .sub { color:#5A5E4E; font-size: 13px; margin-top: 2px; }
  .meta { display:flex; flex-wrap:wrap; gap: 8px 28px; margin: 18px 0 8px; font-size: 14px; }
  .meta .blank { border-bottom: 1px solid #C9BC9C; min-width: 110px; display: inline-block; }
  h2 { font-size: 14px; margin: 22px 0 6px; color:#3D4A2A; border-left: 4px solid #5A6E3D; padding-left: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { border: 1px solid #D9CFB6; padding: 5px 8px; text-align: left; }
  th { background: #EFE9DA; font-weight: 600; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  td.ref { color:#7A7A66; }
  .badge { font-size: 11px; font-weight: 700; padding: 1px 6px; border-radius: 4px; }
  .badge.ok { background:#DDEBD3; color:#3F6132; }
  .badge.bad { background:#F6E4DE; color:#8A2F1C; }
  .badge.ref { background:#EFE9DA; color:#7A7A66; }
  .foot { margin-top: 20px; font-size: 11px; color:#7A7A66; line-height: 1.6; }
  .genat { margin-top: 4px; font-size: 11px; color:#A09A85; }
  .chart { max-width: 460px; margin: 14px auto 2px; }
  .chart svg { width: 100%; height: auto; display: block; }
  .printbtn { margin: 16px 0; padding: 8px 16px; border:1px solid #C9BC9C; border-radius:8px; background:#5A6E3D; color:#fff; cursor:pointer; font-size:13px; }
  @media print { .printbtn { display:none; } body { padding: 0; } }
</style></head>
<body>
  <button class="printbtn" onclick="window.print()">인쇄 / PDF 저장</button>
  <h1>${esc(spec.title)}</h1>
  ${spec.subtitle ? `<div class="sub">${esc(spec.subtitle)}</div>` : ""}
  <div class="meta">
    <span>대상자 ${spec.meta?.subject ? `<b>${esc(spec.meta.subject)}</b>` : `<span class="blank"></span>`}</span>
    <span>치료사 ${spec.meta?.clinician ? `<b>${esc(spec.meta.clinician)}</b>` : `<span class="blank"></span>`}</span>
    <span>측정일 <b>${esc(spec.meta?.date ?? dateStr)}</b></span>
  </div>
  ${spec.chartSvg ? `<div class="chart">${spec.chartSvg}</div>` : ""}
  ${sectionsHtml}
  ${spec.footnote ? `<div class="foot">${esc(spec.footnote)}</div>` : ""}
  <div class="foot">${DISCLAIMER}</div>
  <div class="genat">생성: ${esc(dateStr)} · 바로일지 바로툴</div>
</body></html>`;
}

export function downloadReport(spec: ReportSpec, filenameBase: string): void {
  const html = buildHtml(spec);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  a.download = `${filenameBase}_${ts}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
