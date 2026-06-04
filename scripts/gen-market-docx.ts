// 시장분석(docs/market-analysis.md) v2 → Word(.docx).
// 실행: node --experimental-strip-types scripts/gen-market-docx.ts
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, ShadingType, TableLayoutType,
} from "docx";
import { writeFileSync } from "node:fs";

const FONT = "맑은 고딕";
// A4 세로, 좌우 여백 1100 twip → 본문 가용 폭
const CONTENT_W = 11906 - 1100 * 2; // = 9706 twip

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
function num(text: string) {
  return new Paragraph({ numbering: { reference: "n", level: 0 }, spacing: { after: 60, line: 290 },
    children: [new TextRun({ text, font: FONT, size: 21 })] });
}
function cell(text: string, opts: { head?: boolean; dxa?: number } = {}) {
  return new TableCell({
    width: opts.dxa ? { size: opts.dxa, type: WidthType.DXA } : undefined,
    shading: opts.head ? { type: ShadingType.CLEAR, fill: "1F4E91", color: "auto" } : undefined,
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
    children: [new Paragraph({ children: [new TextRun({
      text, font: FONT, size: 18, bold: opts.head, color: opts.head ? "FFFFFF" : undefined,
    })] })],
  });
}
function table(headers: string[], rows: string[][], pct?: number[]) {
  const b = { style: BorderStyle.SINGLE, size: 4, color: "D0D5DD" };
  // 백분율 → 본문 가용 폭(twip)으로 환산. 미지정 시 균등 분할.
  const n = headers.length;
  const weights = pct && pct.length === n ? pct : Array(n).fill(100 / n);
  const sum = weights.reduce((a, c) => a + c, 0);
  const colW = weights.map((w) => Math.round((w / sum) * CONTENT_W));
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: colW,
    layout: TableLayoutType.FIXED,
    alignment: AlignmentType.CENTER,
    borders: { top: b, bottom: b, left: b, right: b, insideHorizontal: b, insideVertical: b },
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((hd, i) => cell(hd, { head: true, dxa: colW[i] })) }),
      ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, { dxa: colW[i] })) })),
    ],
  });
}
function spacer() { return new Paragraph({ spacing: { after: 80 }, children: [] }); }

const children: (Paragraph | Table)[] = [];

children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 60 },
  children: [new TextRun({ text: "바로일지 시장분석", bold: true, size: 44, font: FONT, color: "1F4E91" })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 },
  children: [new TextRun({ text: "v2 · 정확도 강화판 — 발달바우처 치료사용 일지 자동화 SaaS", size: 22, font: FONT, color: "475467" })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 },
  children: [new TextRun({ text: "작성일 2026-06-03", size: 18, font: FONT, color: "98A2B3" })] }));
children.push(p("신뢰도 등급 — A: 1차 출처 확인 / B: 공식 보도·제도값 / C: 계산·추정 / D: 미확인(검증 필요).", { italic: true, color: "667085" }));

// 0
children.push(h1("0. 정확도 향상 방법론"));
children.push(p("v1의 한계(범위 추정 + 2차 출처)를 보완하기 위해 다음을 적용했다."));
[
  "1차 출처 우선: 복지부 사업안내 PDF > SSIS 연도별 제공기관·제공인력 현황 > 전자바우처 통계 > e-나라지표/KOSIS > 공공데이터포털 원자료 > 논문 > 지자체 안내.",
  "모든 수치에 〔연도·출처·신뢰도(A/B/C/D)〕 태그.",
  "거래액(GMV)과 정부 예산(집행)을 분리. '지원인원×단가×12'는 이론 상한일 뿐 실집행과 다름을 명시.",
  "제공인력 수는 Bottom-up(기관×인력) + Top-down(자격자 누계) 교차검증.",
  "TAM→SAM→SOM을 명시적 가정으로 분해하고 보수/기본/낙관 3시나리오 제시.",
  "8장 검증 체크리스트로 확정 전 1차 수치 확인.",
].forEach((t) => children.push(num(t)));

// 1
children.push(h1("1. 제품 정의"));
children.push(p("바로일지 = ‘치료사의 1인 사물함’ — 발달재활 제공인력이 매월 반복하는 일정표·기록지·제공내역 점검을 자동화하고 한글파일(.hwpx)로 출력하는 1인용 웹 도구.", { bold: true }));
children.push(p("일정표 자동생성 · 전자바우처 ‘서비스제공내역.xls’ → 기록지 자동채움 · 승인내역 점검(결제시간 중복·소급결제·제공일≠승인일) · 엑셀 일괄 가져오기 · 데이터 격리(1계정 1기기). 취급 데이터에 장애아동 민감정보 포함."));

// 2
children.push(h1("2. 시장 배경 & 규모"));
children.push(p("제도: 보건복지부·지자체 운영, 한국사회보장정보원이 전자바우처 결제·정산 인프라 담당. 〔B〕"));
children.push(h2("2-1. 제도값 (2025 사업안내 기준)"));
children.push(table(
  ["항목", "값", "신뢰도"],
  [
    ["대상", "만 18세 미만 등록 장애아동, 소득 기준중위소득 180% 이하(초과가구 일부)", "B"],
    ["기준 단가(2026)", "회당 약 35,000원(2025년 30,000원→평균 5천원 인상)※회당/월평균 확인", "B"],
    ["월 지원금(2026)", "소득 기준 차등 월 17만~25만원(정부지원분, 본인부담 별도)", "B"],
    ["본인부담금", "소득별 차등 0~8만원(가형 면제 ~ 마형 8만원)", "B"],
    ["서비스 영역", "언어·청능·미술심리·음악·행동·놀이·심리·감각운동 재활 등", "B"],
  ],
  [22, 64, 14],
));
children.push(spacer());
children.push(h2("2-2. 시장 규모 — 제공인력(=우리 고객) 중심"));
children.push(p("바로일지의 TAM은 제공기관이 아니라 제공인력(치료사). 1인·프리랜서가 여러 기관에 출강하므로 기관 수 ≠ 고객 수. 기관 수는 참고 맥락일 뿐.", { italic: true, color: "667085" }));
children.push(table(
  ["지표", "수치", "출처", "신뢰도"],
  [
    ["활동 제공인력(TAM)", "약 1.2만~1.3만명 — 전자바우처 13,000명(2020), 실태조사 12,280명(2021), 이후 증가", "효과성·개선방안 연구(2022)", "A"],
    ["핵심 타깃(SAM)", "이 중 행정을 직접 하는 1인·프리랜서·소규모 ≈ 7천~1.2만 명", "추정(6장)", "C"],
    ["연간 신규 자격 인정", "2025년 3,085명(교과목 이수·비언어) + 언어재활사 ~650명/년", "2025 자격인정 현황·국시원", "A/B"],
    ["이용 아동(맥락)", "실이용 73,195명(2021.8) / 지원인원 약 7.9만(2023~)", "보고서·복지부", "A/B"],
    ["연 거래액(이론 상한, 맥락)", "약 2,650억원 이하(2026 단가)", "7.9만×28만×12 계산", "C"],
  ],
  [24, 42, 22, 12],
));
children.push(p("참고(중요도 낮음): 발달재활 제공기관 약 2,160개(2021 실태조사)/1,786개(2024 품질평가 대상, 발달재활 단독). 1인이 여러 기관 출강 → 기관 수 ≠ 고객 수.", { italic: true, color: "667085" }));
children.push(spacer());
children.push(p("⚠️ TAM 레이어 — ‘1.3만’이 전부가 아니다 (분모 정의가 핵심)", { bold: true }));
children.push(p("1.2~1.3만은 ‘발달바우처를 실제 제공 중인 인력’만 센 수치(전체 사회서비스 전자바우처 인력 16.15만 중 발달재활 1.3만). 더 넓게 보면:"));
children.push(table(
  ["레이어", "정의", "규모", "신뢰도"],
  [
    ["L1 핵심(현 제품)", "발달바우처 활동 제공인력", "약 1.2만~1.3만(2020–21, 성장 중)", "A"],
    ["L2 자격 풀", "+ 자격 보유(미활동 포함)", "매년 3천명+ 누적 → 수만", "C"],
    ["L3 광의 아동치료", "+ 사설·비급여 아동 발달·심리·언어 치료 종사자", "수만~10만대(추정)", "D"],
  ],
  [22, 38, 28, 12],
));
children.push(p("· 바우처 행정(승인점검) 특화 → 핵심 TAM L1(~1.3만). · 일정표·기록지 자동화는 사설·비급여 치료사에게도 유효 → 일반화 시 TAM L3(수만~10만). ‘10만’ 직감은 L3(광의 시장)에 부합하나 사설·민간자격 통계가 분산·중복돼 단일 공신력 수치는 부재(추정). ⇒ 숫자보다 포지셔닝 결정이 먼저.", { italic: true, color: "667085" }));
children.push(spacer());
children.push(h2("2-3. 제공인력 — 누가 발달재활을 제공하나(근거 기반)"));
children.push(p("발달재활 제공인력은 언어재활만이 아니다. 고시상 제공 영역: 언어·청능 / 미술심리 / 음악 / 놀이심리 / 행동발달 / 재활심리 / 심리운동 / 감각·운동발달 재활. 각 영역의 관련 전공·자격 보유자가 제공한다. 〔고시, B〕"));
children.push(table(
  ["영역", "대표 직역(= 바로일지 ‘치료사 종류’)", "자격 경로"],
  [
    ["언어·청능", "언어재활사", "국가자격(국시원)"],
    ["미술심리", "미술심리재활사(미술치료)", "관련 전공+교과목 이수→자격 인정"],
    ["음악", "음악재활사(음악치료)", "〃"],
    ["놀이심리", "놀이심리재활사", "〃"],
    ["행동발달", "행동발달재활사", "〃"],
    ["재활심리·심리", "재활심리사·임상심리", "〃"],
    ["감각·운동발달", "감각·운동발달재활사(작업·물리·심리운동 등)", "〃"],
  ],
  [20, 44, 36],
));
children.push(spacer());
children.push(p("자격 인정 요건(언어재활사 외 공통): 대학 14과목(42학점) 또는 대학원 7과목(21학점) 이상 이수 → 중앙장애아동·발달장애인지원센터(broso) 자격 인정. 〔고시, B〕"));
children.push(spacer());
children.push(p("(A) 활동 제공인력 자격증 분포 — 2021 실태조사(총 12,280명, 중복 보유 가능)", { bold: true }));
children.push(table(
  ["자격증 분야", "보유 인원", "비중(개략)"],
  [
    ["언어재활", "5,573명", "약 45%"],
    ["미술심리", "2,061명", "약 17%"],
    ["놀이심리", "1,560명", "약 13%"],
    ["음악·행동·재활심리·감각·운동·심리운동·청능 등", "나머지", "—"],
  ],
  [46, 28, 26],
));
children.push(p("부가: 학력 학사이상 5,924·석사 5,164·박사+ 603 / 제공인력 1인당 월 평균 5.96명(20.2건) 담당. 〔효과성연구, A〕", { italic: true, color: "667085" }));
children.push(spacer());
children.push(p("(B) 연간 신규 자격 인정 — 2025년 교과목 이수 경로(비언어 9영역), 총 3,085명", { bold: true }));
children.push(table(
  ["영역", "감각", "미술", "놀이심리", "행동", "음악", "심리운동", "운동", "재활심리", "청능"],
  [["인정(명)", "1,109", "700", "473", "221", "197", "150", "144", "59", "32"]],
));
children.push(p("(+ 언어재활사는 국시원 국가자격 별도, 연 ~650명 배출) 〔2025 자격인정 현황·국시원, A/B〕", { italic: true, color: "667085" }));
children.push(spacer());
children.push(p("결론: 활동 제공인력(TAM) 약 1.2만~1.3만명(2020–21)이며 매년 3천명+ 신규 자격 유입으로 성장(2025 기준 ~1.5만 내외 추정). 자격증은 언어재활 45%가 최다, 미술·놀이심리가 뒤를 잇는다. ⚠️ ‘자격 누적’이 아니라 실제 활동 기준이며, 최신 활동 실수는 SSIS로 갱신 확정 권장(8장).", { bold: true }));

// 3
children.push(h1("3. 고객 세그먼트 & 페인포인트"));
children.push(table(
  ["세그먼트", "특성", "페인포인트", "적합도"],
  [
    ["1인·프리랜서 치료사", "여러 센터 출강·개인 운영, 행정 직접", "일정표·기록지 수기 반복, 한글 양식, 제공내역 대조", "★★★ 핵심"],
    ["소규모 센터(2~5인)", "원장이 치료+행정", "인력별 취합, 점검 대응", "★★"],
    ["대형 센터", "행정 인력·자체 EMR", "—", "★"],
  ],
  [24, 26, 38, 12],
));
children.push(spacer());
children.push(p("공통 페인: ① 반복 작성 ② 한글 양식 ③ 점검·환수 리스크 ④ 아동 민감정보 산재. → 바로일지가 ①②③ 자동화, ④ 격리.", { bold: true }));

// 4
children.push(h1("4. 경쟁 환경"));
children.push(table(
  ["대안", "강점", "약점(기회)"],
  [
    ["엑셀 수기 + 한글 양식(현 주류)", "무료·자유도", "반복·실수·점검 누락"],
    ["전자바우처 단말/포털", "결제·정산 공식", "일지·기록지 작성은 미지원"],
    ["범용 툴(구글·노션)", "범용", "발달바우처 양식·점검 로직 없음"],
    ["센터 관리 프로그램/EMR", "다기능", "센터 단위·고가·1인에 과함"],
  ],
  [34, 26, 40],
));
children.push(spacer());
children.push(p("포지셔닝: 1인 치료사 특화 × 발달바우처 도메인 내장 × 프라이버시.", { bold: true }));

// 5
children.push(h1("5. SWOT"));
children.push(bullet("S: 도메인 특화, 즉각적 시간 절감, 낮은 학습비용, 한글 출력"));
children.push(bullet("W: 니치 시장, 단일 도메인 의존, 결제·정산 미연동(보조 도구)"));
children.push(bullet("O: 인접 바우처(언어발달·심리지원) 확장, 점검·환수 수요, 센터 다인 버전"));
children.push(bullet("T: 제도·단가·양식 변경, 개인정보 규제, 공공 시스템의 기능 흡수"));

// 6
children.push(h1("6. 수익화 & SOM 시나리오"));
children.push(p("가격(확정): 월 15,000원 구독(연 180,000원).", { bold: true }));
children.push(p("모수(SAM) 근거: 활동 제공인력 약 1.2만~1.3만명(2-2, 성장 반영 ~1.5만) 중 행정을 직접 처리하는 1인·프리랜서·소규모 비중."));
children.push(table(
  ["시나리오", "유효 모수(SAM)", "전환율", "유료 사용자", "연 매출(ARR)"],
  [
    ["보수", "6,000명", "5%", "300명", "약 0.54억"],
    ["기본", "9,000명", "10%", "900명", "약 1.62억"],
    ["낙관", "12,000명", "18%", "2,160명", "약 3.89억"],
  ],
  [16, 24, 14, 20, 26],
));
children.push(spacer());
children.push(p("가격 근거: 2026년 단가 인상으로 치료사 1인 월 매출이 커진 가운데, 월 15,000원은 회기 1회 단가(약 35,000원)의 절반 이하 — 행정 절감·점검 방어 대비 지불 부담이 낮음.", { italic: true, color: "667085" }));
children.push(p("인접 바우처(언어발달지원·심리지원)·센터 다인 버전으로 모수 확대 시 상향. 니치이지만 도메인 락인·전환비용이 커 LTV가 높고 이탈이 낮은 구조.", { bold: true }));
children.push(p("전략: ① 무료 베타→커뮤니티/학회 입소문 ② 점검·환수 방어 가치 증명 ③ 인접 바우처 양식 ④ 센터 다인 버전 ⑤ 정산·세무 리포트."));

// 7
children.push(h1("7. 리스크 & 대응"));
children.push(table(
  ["리스크", "대응"],
  [
    ["제도/단가/양식 변경", "단가·양식을 ‘내 설정’ 값으로 분리(구현됨), 단가·공휴일 업데이트"],
    ["개인정보(민감정보)", "격리·암호화, 최소수집, 약관·처리방침(작성됨), 보관·파기"],
    ["공공 흡수", "‘작성·점검 마지막 1마일’·한글 출력에 집중"],
    ["단일 의존", "인접 아동 바우처로 TAM 확대"],
  ],
  [34, 66],
));

// 8
children.push(h1("8. 확정 전 검증 체크리스트"));
children.push(p("다음 1차 수치를 확인해 C/D 등급을 A로 승격할 것:"));
[
  "[해결] 제공기관 1,786 → 2024 품질평가 1,816 = 발달재활 1,786 + 언어발달지원 30 (발달재활 단독)",
  "[해결] 활동 제공인력 → 12,280명(2021)·13,000명(2020) ⇒ 약 1.2만~1.3만",
  "[해결] 영역별 자격 인정(2025) → 교과목 이수 3,085명 영역별 확보",
  "2024–25 최신 활동 제공인력 실수: SSIS 연도별 제공인력 현황으로 갱신",
  "언어재활사 누적·활동 수: 국시원 연도별 합격자(.xls) 합산(정밀화)",
  "연도별 이용 아동·실집행액: e-나라지표/KOSIS, 복지부 사업안내 통계표",
  "발달재활 정부 예산: 복지부 예산서/국회예산정책처",
  "2026 단가 정의: ‘회당 35,000원’인지 ‘월평균 5천원 인상’인지, 형별 금액(2026 사업안내)",
  "본인부담금 형별 정확 금액(가~마): 2026 사업안내 본문",
  "단가 지역 편차: 전자바우처 제공기관 검색의 기관별 단가 분포",
  "인접 바우처 모수: 언어발달지원·심리지원 각 사업안내",
  "경쟁 SaaS 실물 벤치마킹: 치료센터 관리 프로그램의 실제 제품·기능·가격(현재는 ‘유형’만 비교)",
  "SOM 가정 검증: 유효 모수·전환율은 베타 실데이터로 보정(현재는 가정값)",
].forEach((t) => children.push(bullet(t)));

// 9
children.push(h1("9. 결론"));
children.push(p("발달바우처는 안정적 공공 재원 시장이며, 우리 고객인 발달재활 활동 제공인력(약 1.2만~1.3만명, 매년 3천명+ 신규 유입) 중 행정을 직접 하는 1인 치료사의 반복 행정이 명확하고 미해결인 페인포인트다. 바로일지는 이를 도메인 특화+프라이버시+한글 자동화로 정조준한다. 시장은 니치지만 락인이 커 방어 가능하고 인접 영역으로 확장 여지가 있다. 정확도 측면에서 핵심 수치(활동 제공인력 실수)는 8장 체크리스트로 A등급 확정이 필요하다."));

// 출처
children.push(h1("출처"));
[
  "2026년 발달재활서비스 단가 인상 안내 / 보건복지부 2026 예산 확정 보도자료 / 정책브리핑 — 단가 평균 5천원 인상·월 17~25만원(B)",
  "발달재활·언어발달지원 2024년 품질평가 결과 공개 | 보건복지부 보도자료 — 제공기관 1,786개소(A)",
  "사업별소개 > 발달재활서비스 | 사회서비스 전자바우처 — 단가·본인부담(B)",
  "2025년 발달장애인지원 사업안내 | 보건복지부 — 제도값(B)",
  "연도별 서비스 제공기관 및 제공인력 현황 | 한국사회보장정보원(SSIS) — 제공인력 검증용(접근 제한)",
  "보건복지부_발달재활 제공기관 현황(2024.4.30) | 공공데이터포털",
  "장애아동 발달재활서비스 효과성 및 개선방안 연구(보고서) — 활동 제공인력 12,280명(2021)·13,000명(전자바우처 2020), 자격증 분포·이용자 73,195명(A)",
  "2025년도 발달재활서비스 ‘교과목 이수자 자격인정’ 인정자 현황 — 2025 영역별 자격 인정 3,085명(A)",
  "발달재활서비스 제공 인력의 자격 및 인정 절차 기준(고시) | 보건복지부 — 영역·자격 요건(B)",
  "2025 제14회 언어재활사 국가시험 합격자 발표 | 국시원 — 1급 180·2급 473명(B)",
  "장애아동 재활·돌봄 지원 확대 보도자료 | 보건복지부 — 지원인원 7.9만(B)",
  "e-나라지표 지표서비스 — 이용자·예산 추이(접근 제한)",
].forEach((t) => children.push(bullet(t)));

const doc = new Document({
  numbering: { config: [{ reference: "n", levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.START }] }] },
  styles: { default: { document: { run: { font: FONT, size: 21 } } } },
  sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } }, children }],
});

const out = "docs/바로일지_시장분석.docx";
Packer.toBuffer(doc).then((buf) => {
  writeFileSync(out, buf);
  console.log("작성 완료:", out, `(${buf.length} bytes)`);
});
