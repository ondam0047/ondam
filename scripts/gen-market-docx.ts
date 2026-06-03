// 시장분석(docs/market-analysis.md)을 Word(.docx) 로 출력.
// 실행: node --experimental-strip-types scripts/gen-market-docx.ts
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, ShadingType,
} from "docx";
import { writeFileSync } from "node:fs";

const FONT = "맑은 고딕";

function h1(text: string) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 140 },
    children: [new TextRun({ text, bold: true, size: 30, font: FONT })] });
}
function h2(text: string) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 220, after: 100 },
    children: [new TextRun({ text, bold: true, size: 25, font: FONT })] });
}
function p(text: string, opts: { bold?: boolean; italic?: boolean; color?: string } = {}) {
  return new Paragraph({ spacing: { after: 100, line: 300 },
    children: [new TextRun({ text, font: FONT, size: 21, bold: opts.bold, italics: opts.italic, color: opts.color })] });
}
function bullet(text: string) {
  return new Paragraph({ bullet: { level: 0 }, spacing: { after: 60, line: 290 },
    children: [new TextRun({ text, font: FONT, size: 21 })] });
}
function cell(text: string, opts: { bold?: boolean; head?: boolean; width?: number } = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.head ? { type: ShadingType.CLEAR, fill: "1F4E91", color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [new Paragraph({ children: [new TextRun({
      text, font: FONT, size: 19, bold: opts.bold || opts.head, color: opts.head ? "FFFFFF" : undefined,
    })] })],
  });
}
function table(headers: string[], rows: string[][], widths?: number[]) {
  const border = { style: BorderStyle.SINGLE, size: 4, color: "D0D5DD" };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((hd, i) => cell(hd, { head: true, width: widths?.[i] })) }),
      ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, { width: widths?.[i] })) })),
    ],
  });
}
function spacer() { return new Paragraph({ spacing: { after: 80 }, children: [] }); }

const children: (Paragraph | Table)[] = [];

// 표지
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 60 },
  children: [new TextRun({ text: "바로일지 시장분석", bold: true, size: 44, font: FONT, color: "1F4E91" })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 },
  children: [new TextRun({ text: "발달재활서비스(발달바우처) 치료사용 일지 자동화 SaaS", size: 22, font: FONT, color: "475467" })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
  children: [new TextRun({ text: "작성일 2026-06-03", size: 18, font: FONT, color: "98A2B3" })] }));
children.push(p("※ 수치는 공개 통계 기반의 추정·범위이며, 사업 의사결정 전 1차 출처(보건복지부 사업안내·사회서비스 전자바우처 통계)로 검증이 필요합니다.", { italic: true, color: "667085" }));

// 1
children.push(h1("1. 제품 정의"));
children.push(p("바로일지 = “치료사의 1인 사물함” — 발달재활서비스 제공인력(치료사)이 매월 반복 작성하는 일정표·기록지·제공내역 점검을 자동화하는 1인용 웹 도구.", { bold: true }));
children.push(p("핵심 기능"));
[
  "일정표 자동 생성: 아동·반복 요일·시간대 → 한 달치 회기 자동 생성 → 한글파일(.hwpx) 출력",
  "기록지 작성: 전자바우처 ‘서비스제공내역.xls’ 업로드 → 회기 자동 추출, 전월 기록 복사, 한글파일 출력",
  "승인내역 점검: 결제시간 중복·소급결제·제공일자≠승인일자 자동 검출(지자체 점검 대비)",
  "엑셀 일괄 가져오기 / 출석부 / 일괄 다운로드",
  "1인 사물함 데이터 격리 + 한 계정 = 한 기기 로그인",
].forEach((t) => children.push(bullet(t)));
children.push(p("다루는 데이터에는 아동 성명·생년월일·관리번호, 제공내역(승인번호·결제일·금액), 본인부담금 등 장애아동 관련 민감정보가 포함됩니다."));

// 2
children.push(h1("2. 시장 배경 — 발달재활서비스(발달바우처)"));
[
  "제도: 보건복지부·지자체가 운영하는 사회서비스 전자바우처 사업. 한국사회보장정보원이 결제·정산 인프라 운영.",
  "대상: 만 18세 미만 등록 장애아동(뇌병변·지적·자폐성·청각·언어·시각 등), 소득기준(기준중위소득 180% 이하) + 초과가구 일부.",
  "서비스 영역: 언어·청능·미술심리·음악·행동·놀이·심리·감각운동 재활 등.",
  "단가(2025): 월 8회(주 2회)·회당 30,000원(월 24만원 상당) 기준으로 시·군·구가 지역 단가 설정. 본인부담금 차등(가~마형, 마형 약 8만원).",
  "제공인력 자격: 언어재활사(국가자격 1·2급) 등 영역별 자격 보유자.",
].forEach((t) => children.push(bullet(t)));
children.push(spacer());
children.push(h2("시장 규모 (추정)"));
children.push(table(
  ["구분", "추정치", "근거"],
  [
    ["이용 아동(지원 인원)", "약 7.9만 명", "2023.1 6.9만→7.9만 확대"],
    ["제공기관", "약 2,200~2,600개소", "2021.8 2,160개소, 2024.4 현황 데이터"],
    ["제공인력(치료사)", "약 1.5만~3만 명(추정)", "기관당 평균 인력 × 기관 수(검증 필요)"],
    ["연간 서비스 거래액(총)", "약 2조원대(추정)", "7.9만 × 월 24만원 × 12 ≈ 2.27조"],
  ],
  [28, 30, 42],
));
children.push(spacer());
children.push(p("발달재활 외에 언어발달지원·영유아 발달지원·아동청소년 심리지원 등 인접 아동 바우처까지 포함하면 잠재 사용자(치료사) 풀은 더 넓어집니다."));

// 3
children.push(h1("3. 고객 세그먼트 & 페인포인트"));
children.push(table(
  ["세그먼트", "특성", "주요 페인포인트"],
  [
    ["프리랜서·1인 치료사 (핵심 타깃)", "여러 센터 출강·개인 운영, 행정 직접 처리", "매월 일정표·기록지 수기 반복, 한글 양식, 제공내역 대조"],
    ["소규모 센터(2~5인)", "원장이 치료+행정 겸함", "인력별 일정·기록 취합, 점검 대응"],
    ["대형 센터", "행정 인력 별도", "자체 시스템/EMR 사용 — 적합도 낮음"],
  ],
  [26, 30, 44],
));
children.push(spacer());
children.push(p("공통 페인포인트"));
[
  "반복성: 매월 동일 아동의 일정표·기록지를 손으로 다시 작성",
  "양식 부담: 지자체·기관 제출용 한글 양식 수작업",
  "점검 리스크: 제공시간 중복·소급결제·제공일≠승인일 → 환수·행정처분 위험",
  "개인정보 부담: 아동 민감정보를 엑셀·메신저로 산재 관리",
].forEach((t) => children.push(bullet(t)));
children.push(p("→ 바로일지는 1·2·3을 자동화, 4를 격리 보관으로 직접 해결합니다.", { bold: true }));

// 4
children.push(h1("4. 경쟁 환경"));
children.push(table(
  ["대안", "강점", "약점(바로일지 기회)"],
  [
    ["엑셀 수기 + 한글 양식 (현 주류)", "무료·자유도", "반복 노동·실수·점검 누락"],
    ["사회서비스 전자바우처 단말/포털", "결제·정산 공식", "일지·기록지 작성은 미지원(결제용)"],
    ["범용 일정/문서 툴(구글·노션 등)", "범용", "발달바우처 양식·점검 로직 없음"],
    ["치료센터 관리 프로그램/EMR", "다기능", "센터 단위·고가·1인에 과함"],
  ],
  [34, 26, 40],
));
children.push(spacer());
children.push(p("포지셔닝: ‘1인 치료사’ 특화 + 발달바우처 도메인 내장(제공내역 인식·승인내역 점검·한글 출력) + 프라이버시 우선(격리, 1계정 1기기).", { bold: true }));

// 5
children.push(h1("5. SWOT"));
children.push(bullet("Strengths: 도메인 특화, 반복 자동화로 즉각적 시간 절감, 낮은 학습비용, 한글 출력"));
children.push(bullet("Weaknesses: 니치 시장(치료사 수 한정), 단일 도메인 의존, 결제·정산 미연동(보조 도구)"));
children.push(bullet("Opportunities: 인접 바우처 확장, 점검·환수 리스크 증가로 점검 수요, 센터 다인 버전, 통계·세무 연계"));
children.push(bullet("Threats: 제도·단가·양식 변경, 개인정보 규제 강화, 공공 시스템의 기능 흡수 가능성"));

// 6
children.push(h1("6. 진입·수익화 전략(권고)"));
[
  "베타 무료 → 핵심 유저 확보: 1인 치료사 커뮤니티·학회 중심 입소문",
  "가격(예시): 월 5,000~12,000원 구독 또는 학기 요금. 월 수 시간 절감의 명확한 ROI 소구",
  "확장 로드맵: ① 점검/환수 방어 강화 → ② 인접 바우처 양식 → ③ 소규모 센터 다인 버전 → ④ 정산·세무 리포트",
  "신뢰 자산: 개인정보 처리방침·이용약관 정비, 데이터 격리 메시지를 마케팅 전면에",
].forEach((t) => children.push(bullet(t)));
children.push(spacer());
children.push(p("SaaS 매출 잠재(개략): 치료사 2만 명 × 가입률 10% × 월 8,000원 × 12 ≈ 연 1.9억원(보수적 SOM). 인접 영역·센터 버전 포함 시 수배 확대 가능 — 니치이지만 도메인 락인이 강해 LTV가 높은 구조.", { bold: true }));

// 7
children.push(h1("7. 핵심 리스크 & 대응"));
children.push(table(
  ["리스크", "대응"],
  [
    ["제도/단가/양식 변경", "양식·단가를 설정값으로 분리(‘내 설정’), 공휴일·단가 업데이트 운영"],
    ["개인정보(민감정보)", "격리·암호화, 최소 수집, 처리방침·약관 명문화, 보관·파기 정책"],
    ["공공 시스템의 기능 흡수", "작성·점검 UX와 한글 출력 등 ‘마지막 1마일’에 집중"],
    ["단일 의존", "인접 아동 바우처로 TAM 확대"],
  ],
  [36, 64],
));

// 8
children.push(h1("8. 결론"));
children.push(p("발달바우처 시장은 약 8만 아동·2천여 기관·연 2조원대의 안정적 공공 재원 기반 시장이며, 그 안에서 1인 치료사의 반복 행정은 명확하고 미해결인 페인포인트다. 바로일지는 이 빈틈을 도메인 특화 + 프라이버시 + 한글 자동화로 정확히 겨냥한다. 시장 자체는 니치지만 전환 비용·도메인 락인이 커 방어 가능하며, 인접 바우처·센터 버전으로 확장 여지가 있다. 단기 과제는 (1) 핵심 유저 확보(무료 베타→입소문), (2) 신뢰(개인정보·약관) 정비, (3) 점검·환수 방어 가치의 명확한 증명이다."));

// 출처
children.push(h1("출처"));
[
  "사업별소개 > 발달재활서비스 | 사회서비스 전자바우처 (socialservice.or.kr)",
  "보건복지부_발달재활 제공기관 현황(2024.4.30) | 공공데이터포털 (data.go.kr)",
  "2025년 발달장애인지원 사업안내 | 보건복지부 (mohw.go.kr)",
  "장애아동 재활·돌봄 지원 확대 보도자료 | 보건복지부",
  "공공데이터를 활용한 발달재활서비스 사업 및 제공인력 현황 분석(2019–2022) | DBpia",
  "언어재활사 자격 안내 | 한국보건의료인국가시험원",
].forEach((t) => children.push(bullet(t)));

const doc = new Document({
  styles: { default: { document: { run: { font: FONT, size: 21 } } } },
  sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } }, children }],
});

const out = "docs/바로일지_시장분석.docx";
Packer.toBuffer(doc).then((buf) => {
  writeFileSync(out, buf);
  console.log("작성 완료:", out, `(${buf.length} bytes)`);
});
