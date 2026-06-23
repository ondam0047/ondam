import { requireUser } from "@/lib/auth";
import TourReplay from "./TourReplay";
import GuideVideo from "./GuideVideo";

export const dynamic = "force-dynamic";

const PDF_HREF = "/guides/바로일지_치료사용_설명서.pdf";

// 한 주제 = 하나의 칸(카드). 평소엔 번호+제목+요약만, 누르면 영상·단계가 펼쳐짐.
function Section({
  id, num, title, summary, children,
}: {
  id: string; num: string; title: string; summary?: string; children: React.ReactNode;
}) {
  return (
    <details id={id} className="guide-card" style={{ scrollMarginTop: 24 }}>
      <summary className="guide-card-head">
        <span className="gc-num">{num}</span>
        <span className="gc-main">
          <span className="gc-title">{title}</span>
          {summary && <span className="gc-sum">{summary}</span>}
        </span>
        <span className="gc-chev" aria-hidden>▾</span>
      </summary>
      <div className="guide-card-body" style={{ fontSize: 14.5, lineHeight: 1.75, color: "var(--text)" }}>
        {children}
      </div>
    </details>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "36px 1fr",
      gap: 14,
      padding: "14px 16px",
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--r-md)",
      marginBottom: 10,
    }}>
      <div style={{
        display: "grid", placeItems: "center",
        width: 28, height: 28, borderRadius: "50%",
        background: "var(--primary)", color: "#fff",
        fontSize: 12, fontWeight: 800,
        marginTop: 2,
      }}>{n}</div>
      <div>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 13.5, color: "var(--text-soft)", lineHeight: 1.7, wordBreak: "keep-all" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function Callout({ kind, children }: { kind: "tip" | "warn" | "info"; children: React.ReactNode }) {
  const styles = {
    tip:  { bg: "#FFF8E1", border: "#F0CD5A", icon: "💡" },
    warn: { bg: "#FDECEC", border: "#E8919A", icon: "⚠️" },
    info: { bg: "#E8F1FC", border: "#7BAEE5", icon: "ℹ️" },
  }[kind];
  return (
    <div style={{
      background: styles.bg,
      border: `1px solid ${styles.border}`,
      borderRadius: "var(--r-md)",
      padding: "12px 14px",
      margin: "10px 0",
      fontSize: 13.5,
      lineHeight: 1.7,
      wordBreak: "keep-all",
    }}>
      <span style={{ marginRight: 6 }}>{styles.icon}</span>
      {children}
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "12px 16px" }}>
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>{q}</summary>
      <div style={{ marginTop: 10, color: "var(--text-soft)", lineHeight: 1.75 }}>{children}</div>
    </details>
  );
}

export default async function GuidePage() {
  const user = await requireUser();

  const TOC = [
    { id: "intro",     label: "시작하기" },
    { id: "settings",  label: "내 설정" },
    { id: "myforms",   label: "우리 센터 양식" },
    { id: "children",  label: "내 아동" },
    { id: "schedule",  label: "일정표 (월간 보기)" },
    { id: "record",    label: "기록지" },
    { id: "month",     label: "이번 달 (월 마감)" },
    { id: "approval",  label: "결제 겹침 찾기" },
    { id: "tools",     label: "바로툴" },
    { id: "support",   label: "기타지원사업" },
    { id: "handwrite", label: "수기로 작성하는 분" },
    { id: "persist",   label: "작업 상태 유지" },
    { id: "faq",       label: "자주 묻는 질문" },
  ];

  return (
    <div className="guide-wrap">
      <div>
        {/* 머리말 */}
        <div style={{
          background: "linear-gradient(135deg, var(--primary-soft), #F8FBFE)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
          padding: "28px 30px",
          marginBottom: 24,
        }}>
          <div style={{ fontSize: 13, color: "var(--text-mute)", fontWeight: 600, marginBottom: 6 }}>
            사용 설명서
          </div>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em" }}>
            바로일지 가이드
          </h1>
          <div style={{ marginTop: 10, fontSize: 14, color: "var(--text-soft)", lineHeight: 1.7 }}>
            <b>{user.name}</b> 선생님의 1인 사물함 사용 안내. 아래 <b>칸을 누르면</b> 그 기능의
            <b> 사용법 영상과 단계</b>가 펼쳐져요. 필요한 것만 골라 보세요. 급할 땐 대시보드 위쪽 <b>검색창</b>에
            키워드(예: 본인부담금)를 넣으면 바로 그 화면으로 갈 수 있어요.
          </div>
        </div>

        {/* 도움 버튼들 */}
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-md)",
          padding: "16px 18px",
          marginBottom: 36,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginRight: 8 }}>
            빠른 시작
          </div>
          <TourReplay userId={user.id} />
          <a href={PDF_HREF} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
            📄 PDF 매뉴얼
          </a>
        </div>

        <div className="guide-grid">
        {/* 1. 시작하기 */}
        <Section id="intro" num="1" title="시작하기" summary="가입하면 본인 사물함이 즉시 열려요. 대시보드의 ‘시작 가이드’만 따라가면 첫 기록지까지 끝납니다.">
          <>
            <GuideVideo slug="guide-03-start" title="계정·시작" />
            <p style={{ marginTop: 0, wordBreak: "keep-all" }}>
              바로일지는 발달재활 치료사 한 분이 본인 작업만 처리하는 <b>1인 사물함</b> 입니다.
              한 번 등록한 아동·치료사 정보로 매월 반복되는 일정표·기록지를 자동 생성하고,
              결제 내역까지 자가 점검해요. <b>본인 자료는 본인만 봅니다.</b>
            </p>

            <Step n={1} title="가입">
              운영자에게 받은 <b>초대코드</b>로 가입 → 이름·치료사 종류·이메일·비밀번호 입력 → 사물함이 즉시 열려요.
              근무 센터명은 선택(나중에 내 설정에서 추가 가능).
            </Step>
            <Step n={2} title="시작 가이드 (첫 기록지까지 3분)">
              대시보드 위쪽에 <b>시작 가이드</b>가 떠요: ① 우리 센터 양식 올리기(선택) → ② 첫 아동 등록 →
              ③ 이번 달 일정 → ④ 첫 기록지. 다음 할 단계만 강조되고, 다 끝나면 카드가 사라집니다.
            </Step>
            <Step n={3} title="검색창으로 빠르게 이동">
              대시보드 검색창에 <b>키워드</b>(일정, 기록지, 양식, 결제, 본인부담금, 이번 달…)를 넣으면
              해당 탭이 떠요. Enter·클릭으로 바로 이동.
            </Step>
            <Step n={4} title="대시보드 · 모바일">
              대시보드엔 <b>이번 주 회기</b>·이번 달 할 일이 보여요. 스마트폰 브라우저로 같은 주소(https://baroilji.com)에
              접속하면 모바일 화면으로 동작(왼쪽 위 햄버거 ☰).
            </Step>

            <Callout kind="info">
              한 계정은 한 기기에서만 로그인 유지 — 새 기기에서 로그인하면 이전 기기는 자동 로그아웃돼요.
            </Callout>
          </>
        </Section>

        {/* 2. 내 설정 */}
        <Section id="settings" num="2" title="내 설정" summary="한 번 저장하면 일정표·기록지에 자동으로 반영돼요. 센터 양식도 여기서 올립니다.">
          <>
            <GuideVideo slug="guide-02-settings" title="내 설정" />
            <p style={{ marginTop: 0, wordBreak: "keep-all" }}>
              가입 시 입력한 모든 항목과 작업 환경값을 한 곳에서 수정합니다. <b>저장하는 즉시 일정표·기록지에 반영</b>돼요.
            </p>
            <Step n={1} title="내 이름 · 치료사 종류">
              이름은 일정표·기록지의 <b>담당·치료사명</b>으로 들어가요. 치료사 종류를 바꾸면 <b>서비스 종류</b>도 자동으로 따라옵니다.
            </Step>
            <Step n={2} title="소속 센터명">
              일정표·기록지의 <b>제공기관명</b> 기본값. 프리랜서면 비워둘 수 있어요.
            </Step>
            <Step n={3} title="회당 기본 단가">
              새 아동 등록·일정표 회당 단가에 자동으로 채워져요(회기마다 따로 변경 가능).
            </Step>
            <Step n={4} title="회기 시간대">
              실제 운영 슬롯 목록(예: 09:00~09:50). 일정표·세션 편집 드롭다운에 쓰여요. <b>HH:MM~HH:MM</b>, 콤마/줄바꿈 구분.
            </Step>
            <Step n={5} title="우리 센터 양식 저장하기">
              내 설정 아래 <b>[우리 센터 양식 저장하기]</b>(또는 왼쪽 메뉴 <b>[우리 센터 양식]</b>)에서 센터 양식을 올려두면
              출력이 그 양식으로 나옵니다. 자세한 건 아래 <b>‘우리 센터 양식’</b> 항목 참고.
            </Step>
          </>
        </Section>

        {/* 3. 우리 센터 양식 */}
        <Section id="myforms" num="3" title="우리 센터 양식" summary="우리 센터 기록지·일정표(.hwpx)를 올려두면, 그 양식 그대로 채워서 출력돼요.">
          {/* 영상 준비 중: <GuideVideo slug="guide-09-myforms" title="우리 센터 양식 저장" /> */}
          <>
            <p style={{ marginTop: 0, wordBreak: "keep-all" }}>
              지자체·기관마다 양식이 제각각이에요. 우리 센터 양식(.hwpx)을 한 번 올리면 표의 칸을 <b>자동 인식</b>해서,
              그 다음부터 일정표·기록지 출력과 ‘이번 달’ 일괄 받기가 <b>우리 센터 양식 그대로</b> 나옵니다.
            </p>
            <Step n={1} title="양식 파일(.hwpx) 올리기">
              우리 센터 빈 기록지/일정표 한글파일을 올려요. 스캔본·PDF·.hwp(구버전)는 안 되고 <b>편집 가능한 .hwpx</b>만 돼요.
            </Step>
            <Step n={2} title="자동 매핑 확인 · 샘플">
              올리면 칸(이름·생년월일·날짜·시간·금액·결과 등)을 색으로 표시해요. <b>[샘플로 채워보기]</b>로 예시가 든 한글파일을
              받아 실제로 맞는지 먼저 확인하세요.
            </Step>
            <Step n={3} title="틀린 칸은 직접 보정">
              어긋난 칸은 <b>클릭해서 역할을 지정</b>(예: ‘대상자이름’)하거나 비울 수 있어요. 같은 값을 여러 칸에 넣어도 됩니다.
            </Step>
            <Step n={4} title="기록지 / 일정표 구분 저장">
              종류를 고르고 이름을 붙여 저장. 통합 양식(한 장에 일정표+기록지)은 기록지로 저장하면 돼요.
              센터마다 다르면 <b>여러 개</b> 저장해 골라 씁니다.
            </Step>
            <Step n={5} title="출력할 때 양식 선택">
              일정표·기록지 화면의 <b>‘출력 양식’</b>에서 저장한 양식을 고르면 그 양식으로 다운로드. 저장해두면 다음에도, 일괄 받기도 같은 양식.
            </Step>
            <Callout kind="tip">
              기록지는 <b>한 장에 5회기(5칸) 기준</b>이에요. 회기 칸·결과표 행이 5개보다 많은 양식을 올려도
              <b> 저장할 때 자동으로 5칸으로 정리</b>돼 저장됩니다. 그래서 한 달 회기가 <b>6회 이상이면 출력이 자동으로 두 장</b>으로 나뉘어요(ZIP).
              우리 센터 양식도 <b>5칸 기준</b>으로 생각하시면 됩니다.
            </Callout>
            <Callout kind="info">올린 양식·저장 내용은 <b>본인만</b> 볼 수 있어요.</Callout>
          </>
        </Section>

        {/* 4. 내 아동 */}
        <Section id="children" num="4" title="내 아동" summary="한 번 등록하면 매월 클릭 한 번에 정보가 채워져요. 목록에서 아동을 누르면 바로 수정.">
          <>
            <GuideVideo slug="guide-04-child-register" title="내 아동 한 명씩 등록" />
            <p style={{ marginTop: 0, wordBreak: "keep-all" }}>
              아동을 등록해두면 매월 일정표·기록지에서 클릭 한 번에 정보가 채워져요. 세 가지 등록 경로가 있습니다.
            </p>
            <Step n={1} title="일정표에서 즉시 등록 (가장 빠름)">
              일정표 상단 <b>[+ 새 아동]</b> → 이름·생년월일·월 본인부담금 입력 → 등록. 내 아동에도 자동 동기화.
            </Step>
            <Step n={2} title="한 명씩 자세히 등록">
              <b>[내 아동] → [한 명씩 등록]</b>에서 이름·생년월일·관리번호·메모·기본 시간대·반복 요일·회당 단가·월 본인부담금·월 목표 회기 입력.
              서비스 종류·담당 치료사는 내 설정 기준 본인으로 자동 고정.
            </Step>
            <Step n={3} title="엑셀로 한꺼번에 가져오기">
              <b>[내 아동] → [엑셀로 가져오기]</b> → 명단이나 전자바우처 ‘서비스제공내역.xls’ 업로드 → 컬럼 자동 인식 미리보기 → <b>[이대로 저장]</b>.
            </Step>
            <div style={{ marginTop: 14, marginBottom: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-soft)", marginBottom: 8 }}>📹 엑셀로 한꺼번에 등록하기</div>
              <GuideVideo slug="guide-01-children-excel" title="아동 엑셀 일괄등록" />
            </div>
            <Callout kind="tip">
              아동 목록에서 <b>이름·상세 칸을 누르면 바로 수정</b> 화면으로 가요. 상세 칸엔 서비스 종류·기본 시간대·월 목표·본인부담금이 보입니다.
            </Callout>
            <Callout kind="info">
              <b>월 본인부담금</b>을 넣어두면 일정표의 본인부담금 칸이 자동으로 채워져요(부모님이 매월 내는 실제 금액).
            </Callout>
          </>
        </Section>

        {/* 5. 일정표 (+ 월간 보기) */}
        <Section id="schedule" num="5" title="일정표 (월간 보기)" summary="반복 요일만 고르면 한 달치 회기가 자동 생성돼요(공휴일 자동 제외). ‘월간 보기’ 탭으로 달력도.">
          <>
            <GuideVideo slug="guide-05-schedule" title="일정표 작성" />
            <Step n={1} title="아동 · 연·월 선택">
              아동을 고르면 이름·생년월일·기관명·치료사·서비스 종류·회당 단가·본인부담금이 자동으로 채워져요.
            </Step>
            <Step n={2} title="요일 패턴 → 자동 생성">
              반복 요일(예: 월·목)과 시간대를 고른 뒤 <b>[일정표 생성]</b> → 한 달치 회기가 만들어집니다(공휴일 제외).
            </Step>
            <Step n={3} title="전월 일정 복사 · 회기 수정">
              <b>[전월 일정 복사]</b>로 같은 패턴을 새 달에 적용. 특정 날짜는 캘린더 칸을 눌러 시간 변경·보강 표시·제거.
            </Step>
            <Step n={4} title="저장 · 한글파일 다운로드">
              <b>[현재 내용 저장]</b>(같은 아동·월로 다시 오면 자동 로드), <b>[한글파일(.hwpx) 다운로드]</b>로 출력.
              ‘출력 양식’에서 우리 센터 일정표 양식을 고를 수 있어요.
            </Step>
            <Step n={5} title="월간 보기 탭">
              상단 <b>[월간 보기]</b> 탭을 누르면 저장된 일정이 <b>월간 캘린더</b>로 한눈에 보여요(공휴일·오늘 색 구분).
            </Step>
            <Callout kind="tip">서비스 종류·치료사명·제공기관명은 모두 <b>내 설정</b>에서 가져와요.</Callout>
          </>
        </Section>

        {/* 6. 기록지 */}
        <Section id="record" num="6" title="기록지" summary="직접 작성하거나, 월말 엑셀로 한 번에 자동완성하거나 — 두 가지 방식.">
          <>
            <GuideVideo slug="guide-06-record" title="기록지 작성" />
            <Step n={1} title="엑셀 없이 직접 — 미리 작성">
              아동·연·월 → <b>[작성 시작]</b>. 일정표가 있으면 회기 날짜·시간이 자동으로 채워져요. 결과 입력 후 <b>[현재 내용 저장]</b>.
            </Step>
            <Step n={2} title="엑셀로 자동완성 — 월말 일괄">
              ‘서비스제공내역.xls’ 업로드 → 회기·시간·승인번호·결제일이 한꺼번에 채워져요. 결과·총평만 작성하면 끝.
            </Step>
            <Step n={3} title="제공일자 ≠ 승인일자 매칭">
              일정 회기일과 엑셀 결제일이 다르면 <b>‘⚠ 제공일자≠승인일자’</b> 표시. 같은 일자는 자동 짝짓고 남은 회기만 보강 매핑.
            </Step>
            <Step n={4} title="불일치 사유 · 소급결제 알림">
              불일치 회기엔 ‘불일치 사유’ 칸. 엑셀에 <b>소급결제</b>가 있으면 빨간 배너+뱃지로 사유서 작성을 알려줘요.
            </Step>
            <Step n={5} title="전월 기록 복사 · 한글파일 다운로드">
              <b>[전월 기록 가져오기]</b>로 지난달 결과·총평 복사. <b>[한글파일(.hwpx) 다운로드]</b>(6회 이상이면 자동 ZIP 분할).
            </Step>
            <Callout kind="tip">상단 <b>[여러 명 한꺼번에 받기 →]</b>로 ‘이번 달’ 화면에서 일괄 받기로 갈 수 있어요.</Callout>
          </>
        </Section>

        {/* 7. 이번 달 (월 마감) */}
        <Section id="month" num="7" title="이번 달 (월 마감)" summary="월을 고르면 전 아동의 일정·기록지 상태가 한 화면에. 칸을 누르면 그 아동 작성으로 바로 가요.">
          <>
            <GuideVideo slug="guide-08-dashboard" title="대시보드·이번 달·월간 보기" />
            <p style={{ marginTop: 0, wordBreak: "keep-all" }}>
              월말 마감을 메뉴 넘나들지 않고 <b>한 화면</b>에서. 왼쪽 메뉴 <b>[이번 달]</b> 또는 대시보드 <b>[이번 달 마감]</b> 버튼으로 들어가요.
            </p>
            <Step n={1} title="월 이동 · 현황">
              ◀ ▶ 로 월을 바꿔요. 담당 아동마다 <b>일정(✓N회/미생성)·기록지(✓N회/미작성)</b> 상태가 표로 보입니다.
            </Step>
            <Step n={2} title="칸을 눌러 바로 작성">
              아동 줄의 <b>일정·기록지 칸을 누르면</b> 그 아동·그 달이 자동 선택된 작성 화면으로 바로 이동해요(다시 고를 필요 없음).
            </Step>
            <Step n={3} title="전체 한꺼번에 받기">
              위쪽 <b>[전체 일정 ZIP]·[전체 기록지 ZIP]</b>로 그 달 전부를 한 파일로. 특정 아동만 고를 땐 <b>[특정 아동만 골라 받기 →]</b>.
            </Step>
            <Step n={4} title="일정이 없을 때">
              그 달 일정이 없으면 <b>[일정 일괄 생성 →]</b> 안내가 떠요(아동마다 등록된 반복 요일·시간대로 한 번에 생성).
            </Step>
            <Callout kind="tip">출력 양식은 각 아동의 일정표·기록지에서 저장해둔 ‘출력 양식’을 그대로 따라가요(우리 센터 양식).</Callout>
          </>
        </Section>

        {/* 8. 결제 겹침 찾기 */}
        <Section id="approval" num="8" title="결제 겹침 찾기" summary="엑셀만 올리면 결제 시간이 겹치는 회기를 자동으로 잡아줘요.">
          <>
            <GuideVideo slug="guide-07-approval" title="결제 겹침 찾기" />
            <p style={{ marginTop: 0, wordBreak: "keep-all" }}>
              지자체 점검 전에 결제 내역을 미리 자가 점검. 가장 흔한 <b>같은 날 결제 시간이 너무 가까워 이전 회기와 겹치는 경우</b>를 잡아줘요.
            </p>
            <Step n={1} title="엑셀 업로드">
              <b>[결제 겹침 찾기]</b>(도구 메뉴) → 서비스제공내역.xls 그대로 업로드.
            </Step>
            <Step n={2} title="자동 점검">
              직전 결제와의 간격 계산. 50분 회기 기준 <b>40분 미만이면 빨간 행</b>으로 강조(±10분 허용). 긴 휴식은 검사 안 함.
            </Step>
            <Step n={3} title="소급결제 표시">
              ‘소급결제’가 있으면 노란 행+안내. 별도 사유서 작성을 잊지 마세요.
            </Step>
            <Callout kind="tip">예: 16:01 결제 → 16:30 결제 = 29분 간격 → 빨강(“이전 회기와 겹침 — 11분 빠름”).</Callout>
          </>
        </Section>

        {/* 9. 바로툴 */}
        <Section id="tools" num="9" title="바로툴" summary="치료에 쓰는 음성·말 측정 모듈. 대상자별로 측정·기록하고 추이를 봐요.">
          <>
            <p style={{ marginTop: 0, wordBreak: "keep-all" }}>
              왼쪽 <b>[바로툴]</b>(도구 메뉴)에서 음성·말 관련 측정 모듈을 사용해요. 측정값은 대상자별로 저장돼 추이를 볼 수 있어요.
            </p>
            <Step n={1} title="모듈">
              음도·강도(실시간 그래프), /s/ 스펙트로그램, 최대발성지속시간(MPT, 3회 평균), 지연청각피드백(DAF),
              말속도, 유창성 등.
            </Step>
            <Step n={2} title="대상자 모니터링·보고서">
              아동을 선택해 측정하면 세션이 저장돼요. 보고서에 대상자·치료사·측정일과 최근 추이 그래프가 들어갑니다.
            </Step>
            <Callout kind="warn">
              바로툴은 <b>비의료기기</b>로, 임상 참고용 보조 도구입니다. 진단·치료의 최종 판단은 치료사가 합니다.
            </Callout>
          </>
        </Section>

        {/* 10. 기타지원사업 */}
        <Section id="support" num="10" title="기타지원사업" summary="발달재활 바우처 외 지원사업 일지·계획서를 바로일지에서 작성해 한글로 출력.">
          <>
            <p style={{ marginTop: 0, wordBreak: "keep-all" }}>
              왼쪽 <b>[기타지원사업]</b>(운영 메뉴)에서 지원사업별 서식을 작성해요. 현재 <b>교육청 치료지원(마음모아)</b> 월별 치료지원 일지를 지원합니다.
            </p>
            <Step n={1} title="작성 · 저장">
              학생·치료사·영역·일시·내용 등을 입력하고 저장하면, 다음에 <b>이름을 눌러 불러와</b> 이어서 수정할 수 있어요.
            </Step>
            <Step n={2} title="한글파일 출력">
              <b>한글(.hwpx)</b>로 출력해 제출하세요.
            </Step>
            <Callout kind="info">새 지원사업 서식이 필요하면 운영자에게 요청하세요(양식 확보 후 추가).</Callout>
          </>
        </Section>

        {/* 11. 수기로 작성하는 분 */}
        <Section id="handwrite" num="11" title="수기로 작성하는 분" summary="수기로 받는 분도 위쪽 표는 자동 인쇄 — 종이엔 결과·서명만 받으면 돼요.">
          <>
            <p style={{ marginTop: 0, wordBreak: "keep-all" }}>
              결과·부모 서명을 회기마다 종이에 직접 받아야 하는 경우, 위쪽 표(이름·날짜·시간·바우처·승인번호 등)는 자동으로 채워서 인쇄되니
              <b> 그 종이에 5회기 결과와 서명을 누적</b>해 채우면 됩니다.
            </p>
            <Step n={1} title="월초 — 일정표 만들기">평소처럼 일정표를 만들고 저장(종이에 들어갈 날짜·시간 기준).</Step>
            <Step n={2} title="월초 — 기록지 한글파일 받기">
              <b>[기록지] → 작성 시작</b> → 결과 칸은 비운 채 <b>[한글파일 다운로드]</b>. ‘이번 달’에서 여러 명 ZIP으로 한 번에도 가능.
            </Step>
            <Step n={3} title="회기마다 — 손글씨 + 서명">인쇄본에 그날 결과를 쓰고 부모 서명을 받으세요.</Step>
            <Callout kind="tip"><b>결과 칸을 비워도 저장·다운로드가 됩니다.</b> 디지털 기록이 필요 없으면 종이로만 관리하셔도 돼요.</Callout>
            <Callout kind="info"><b>결제 겹침 찾기</b>는 수기 운영자에게도 유용해요. 엑셀만 올려 점검 전 한 번씩 돌려보세요.</Callout>
          </>
        </Section>

        {/* 12. 작업 상태 유지 */}
        <Section id="persist" num="12" title="작업 상태 유지" summary="화면을 옮겨다녀도 보던 상태가 그대로 유지돼요.">
          <>
            <ul style={{ paddingLeft: 22, margin: "8px 0 0" }}>
              <li>마지막에 선택한 아동·연월이 자동 복원</li>
              <li>일정표는 생성한 캘린더 미리보기 통째로 유지</li>
              <li>기록지는 엑셀로 불러온 명단·선택한 아동 탭 유지</li>
              <li>스크롤 위치까지 그대로</li>
              <li>로그아웃·다른 계정 로그인 시에는 자동으로 비워져 다음 사용자에게 새지 않음</li>
            </ul>
          </>
        </Section>

        {/* 13. FAQ */}
        <Section id="faq" num="13" title="자주 묻는 질문" summary="궁금한 점을 빠르게 찾아보세요.">
          <div style={{ display: "grid", gap: 14 }}>
            <Faq q="Q. 가입 후 입력한 내용을 어디서 바꿔요?">
              왼쪽 <b>[내 설정]</b>. 이름·치료사 종류·센터명·회당 단가·시간대 등 전부 수정 가능. 저장 즉시 일정표·기록지에 반영돼요.
            </Faq>
            <Faq q="Q. 우리 센터 양식으로 출력하려면?">
              <b>[우리 센터 양식]</b>에서 양식(.hwpx)을 올려 저장한 뒤, 일정표·기록지 화면의 <b>‘출력 양식’</b>에서 고르면 돼요.
            </Faq>
            <Faq q="Q. 여러 명 기록지를 한 번에 받고 싶어요">
              <b>[이번 달]</b> 화면에서 <b>[전체 기록지 ZIP]</b>. 특정 아동만이면 <b>[골라 받기]</b>로 선택해 받으세요.
            </Faq>
            <Faq q="Q. 한글파일이 안 열려요">
              한컴오피스(아래아한글) 2010 이상에서 .hwpx 를 열 수 있어요(무료 뷰어는 한컴 공식 사이트). LibreOffice 등은 서식이 깨질 수 있어요.
            </Faq>
            <Faq q="Q. 한 번 작성한 기록지를 다시 수정할 수 있나요?">
              네. 같은 아동·연·월로 다시 들어가면 기존 내용이 그대로 불러와집니다. 수정 후 저장하면 덮어써져요.
            </Faq>
            <Faq q="Q. 압축 파일 풀면 파일명이 깨져요">
              한글 파일명을 UTF-8로 저장해 윈도우 기본 압축해제기에서도 안 깨져요. 그래도 깨지면 반디집·알집을 사용하세요.
            </Faq>
            <Faq q="Q. 비밀번호를 잊었어요">
              현재 베타 단계에선 운영자에게 직접 요청해주세요(정식 출시 후 자가 초기화 추가 예정).
            </Faq>
            <Faq q="Q. 데이터가 안전한가요?">
              국내(춘천) 서버 저장 + HTTPS 암호화. 본인 사물함은 본인만 접근 가능하며, 한 계정 = 한 기기 정책으로 공유도 사실상 차단됩니다.
            </Faq>
            <Faq q="Q. 모바일에서도 되나요?">
              네. 스마트폰 브라우저로 https://baroilji.com 접속 시 모바일 화면으로 동작(좌측 상단 햄버거 ☰).
            </Faq>
          </div>
        </Section>
        </div>
      </div>

      {/* 우측 TOC — 모바일에선 자동으로 상단으로 접힘 */}
      <aside className="guide-toc" style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        padding: "16px 18px",
        fontSize: 13,
      }}>
        <div style={{ fontWeight: 800, marginBottom: 10, fontSize: 12, color: "var(--text-mute)", letterSpacing: "0.05em" }}>
          목차
        </div>
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
          {TOC.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} style={{
                color: "var(--text)",
                textDecoration: "none",
                display: "block",
                padding: "4px 0",
                borderLeft: "2px solid transparent",
                paddingLeft: 8,
              }}>
                {s.label}
              </a>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
