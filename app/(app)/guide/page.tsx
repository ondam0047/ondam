import { requireUser } from "@/lib/auth";
import TourReplay from "./TourReplay";

export const dynamic = "force-dynamic";

const PDF_HREF = "/guides/바로일지_치료사용_설명서.pdf";

function Section({
  id, num, title, children,
}: {
  id: string; num: string; title: string; children: React.ReactNode;
}) {
  return (
    <section id={id} style={{ marginBottom: 48, scrollMarginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{
          display: "inline-grid", placeItems: "center",
          width: 32, height: 32, borderRadius: 8,
          background: "var(--primary-soft)", color: "var(--primary)",
          fontSize: 13, fontWeight: 800,
        }}>{num}</span>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>{title}</h2>
      </div>
      <div style={{ fontSize: 14.5, lineHeight: 1.75, color: "var(--text)" }}>
        {children}
      </div>
    </section>
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

export default async function GuidePage() {
  const user = await requireUser();

  const TOC = [
    { id: "intro",     label: "시작하기" },
    { id: "settings",  label: "내 설정" },
    { id: "children",  label: "내 아동 등록" },
    { id: "schedule",  label: "일정표 작성" },
    { id: "record",    label: "기록지 작성" },
    { id: "handwrite", label: "수기로 작성하는 분" },
    { id: "approval",  label: "승인내역 점검" },
    { id: "timetable", label: "내 시간표" },
    { id: "bulk",      label: "한꺼번에 다운로드" },
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
            <b>{user.name}</b> 선생님의 1인 사물함 사용 안내.
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
          <a
            href={PDF_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost"
          >
            📄 PDF 매뉴얼
          </a>
        </div>

        {/* 1. 시작하기 */}
        <Section id="intro" num="1" title="시작하기">
          <p style={{ marginTop: 0, wordBreak: "keep-all" }}>
            바로일지는 발달재활 치료사 한 분이 본인 작업만 처리하는 <b>1인 사물함</b> 입니다.
            한 번 등록한 아동·치료사 정보로 매월 반복되는 일정표·기록지를 자동 생성하고,
            결제 내역까지 자가 점검할 수 있어요. <b>본인 자료는 본인만 봅니다.</b> 다른 사람에겐 절대 노출되지 않아요.
          </p>

          <Step n={1} title="가입">
            운영자에게 받은 <b>초대코드</b>로 가입 → 이름·치료사 종류·이메일·비밀번호 입력 →
            본인 사물함이 즉시 열려요. 근무 센터명은 선택. (안 적으면 나중에 내 설정에서 추가 가능)
          </Step>
          <Step n={2} title="대시보드">
            로그인 첫 화면. <b>이번 주 회기</b>·이번 달 진행률·미작성 기록지 등 본인 작업 현황을 한 눈에.
            "전체 일정 →" 버튼으로 <b>내 시간표</b> 캘린더로 바로 이동합니다.
          </Step>
          <Step n={3} title="모바일">
            스마트폰 브라우저로 같은 주소(https://baroilji.com)에 접속하면 작은 화면에 맞게 조정됩니다.
            왼쪽 위 햄버거(☰) 로 메뉴 열고 닫기.
          </Step>

          <Callout kind="info">
            한 계정은 한 기기에서만 로그인 유지 — 새 기기에서 로그인하면 이전 기기는 자동 로그아웃돼요.
            다른 사용자 계정으로 바꿔 로그인하면 이전 사용자의 작업 미리보기는 자동으로 비워집니다.
          </Callout>
        </Section>

        {/* 2. 내 설정 */}
        <Section id="settings" num="2" title="내 설정">
          <p style={{ marginTop: 0, wordBreak: "keep-all" }}>
            가입 시 입력한 모든 항목과 작업 환경값을 한 곳에서 수정합니다.
            <b>저장하는 즉시 일정표·기록지에 반영</b>됩니다.
          </p>

          <Step n={1} title="내 이름 · 치료사 종류">
            본인 이름은 일정표·기록지의 <b>담당·치료사명</b> 으로 들어가요.
            치료사 종류를 바꾸면 일정표·기록지의 <b>서비스 종류</b> 도 자동으로 따라옵니다 (예: 감각통합치료사 → 감각통합치료).
          </Step>
          <Step n={2} title="소속 센터명">
            일정표·기록지의 <b>제공기관명</b> 기본값. 프리랜서면 비워둘 수 있고, 근무지가 바뀌면 여기서 수정.
          </Step>
          <Step n={3} title="회당 기본 단가">
            새 아동 등록·일정표 회당 단가에 자동으로 채워져요. 일정표 안에서 회기마다 따로 바꿀 수도 있습니다.
          </Step>
          <Step n={4} title="회기 시간대">
            본인이 실제로 운영하는 슬롯 목록 (예: 09:00~09:50). 일정표 생성·세션 편집의 드롭다운 옵션으로 사용됩니다.
            <b>HH:MM~HH:MM</b> 형식, 콤마 또는 줄바꿈으로 구분.
          </Step>
          <Callout kind="tip">
            결과를 손으로 적는 분은 기록지에서 <b>상태 및 결과 기록만 비워두고</b> 한글파일을 출력하세요.
            위쪽 표(이름·날짜·시간·바우처·승인번호 등)는 자동으로 채워져 인쇄되니, 그 자리에 손글씨와 부모 서명을 받으면 됩니다.
          </Callout>
        </Section>

        {/* 3. 내 아동 등록 */}
        <Section id="children" num="3" title="내 아동 등록">
          <p style={{ marginTop: 0, wordBreak: "keep-all" }}>
            아동을 등록해두면 매월 일정표·기록지에서 클릭 한 번에 정보가 채워져요.
            세 가지 등록 경로가 있습니다.
          </p>

          <Step n={1} title="일정표에서 즉시 등록 (가장 빠름)">
            일정표 페이지 상단 <b>[+ 새 아동]</b> 버튼 → 이름·생년월일·월 본인부담금 입력 → 등록.
            드롭다운에 즉시 추가되고 <b>내 아동 페이지에도 자동 동기화</b>됩니다.
          </Step>
          <Step n={2} title="한 명씩 자세히 등록">
            <b>[내 아동] → [한 명씩 등록]</b> 에서 이름·생년월일·관리번호·메모·서비스 종류·기본 시간대·반복 요일·회당 단가·월 본인부담금·월 목표 회기까지 모두 입력.
            한 아동이 여러 서비스를 받으면 <b>[+ 서비스 추가]</b> 로 두 번째 서비스도 같은 아동에게 등록 가능.
          </Step>
          <Step n={3} title="엑셀로 한 번에 가져오기">
            <b>[내 아동] → [엑셀로 가져오기]</b> → 전자바우처 '서비스제공내역.xls' 그대로 업로드 → 대상자 명단 자동 추출.
          </Step>

          <Callout kind="tip">
            <b>월 본인부담금</b>을 입력해두면 일정표의 '본인부담금' 칸이 자동으로 채워져요.
            지원형(가형·마형 등) 대신 부모님이 매월 내시는 실제 금액으로 등록.
          </Callout>
        </Section>

        {/* 4. 일정표 */}
        <Section id="schedule" num="4" title="일정표 작성">
          <Step n={1} title="아동 · 연·월 선택">
            드롭다운에서 아동 선택 → 이름·생년월일·기관명·치료사·서비스 종류·회당 단가·본인부담금이 자동으로 채워져요.
            연·월도 함께 선택.
          </Step>
          <Step n={2} title="요일 패턴 → 자동 생성">
            반복 요일(예: 월·목)과 기본 시간대를 고른 뒤 <b>[일정표 생성]</b> → 한 달치 회기가 캘린더 모양으로 한 번에 만들어집니다.
            공휴일은 자동으로 제외돼요.
          </Step>
          <Step n={3} title="전월 일정 그대로 복사">
            매월 같은 패턴이면 <b>[📋 전월 일정 복사]</b> 한 번. 새 달의 같은 요일·시간으로 자동 적용됩니다.
          </Step>
          <Step n={4} title="회기 수정">
            특정 날짜의 시간이 다르거나 보강회기면 캘린더 칸을 클릭해 시간 변경·보강 표시·회기 제거.
          </Step>
          <Step n={5} title="저장 · 한글파일 다운로드">
            <b>[현재 내용 저장]</b> 으로 DB 에 보관 (같은 아동·월로 다시 들어오면 자동 로드).
            <b>[한글파일(.hwpx) 다운로드]</b> 로 인쇄·제출용 파일 생성.
          </Step>

          <Callout kind="tip">
            서비스 종류·치료사명·제공기관명은 모두 <b>내 설정</b> 에서 가져와요.
            설정에서 한 번 바꾸면 그 다음부터의 일정표에 자동 반영됩니다.
          </Callout>
        </Section>

        {/* 5. 기록지 */}
        <Section id="record" num="5" title="기록지 작성">
          <p style={{ marginTop: 0, wordBreak: "keep-all" }}>
            두 가지 방식이 있어요. 미리 작성해도 되고, 월말 엑셀 받은 후 일괄로 처리해도 됩니다.
          </p>

          <Step n={1} title="엑셀 없이 직접 시작 — 미리 작성">
            아동·연·월 선택 → <b>[작성 시작]</b>. 일정표가 있으면 회기 날짜·시간이 자동으로 채워져요.
            회기가 끝날 때마다 결과를 입력하고 <b>[현재 내용 저장]</b>.
          </Step>
          <Step n={2} title="엑셀로 자동완성 — 월말 일괄">
            전자바우처 '서비스제공내역.xls' 업로드 → 아동별로 회기·시간·승인번호·결제일이 한꺼번에 채워져요.
            결과·총평만 작성하면 끝.
          </Step>
          <Step n={3} title="제공일자 ≠ 승인일자 매칭">
            일정표 회기일과 엑셀 결제일이 다르면 <b>'⚠ 제공일자≠승인일자'</b> 빨간 표시.
            같은 일자가 있으면 자동으로 짝지어주고, 남은 회기만 보강 매핑하니까 헷갈리지 않아요.
            (예: 일정 1·3·8·13·15 vs 엑셀 3·5·8·13·15 → 3·8·13·15 일치, 남은 5 가 1 로 보강 매핑)
          </Step>
          <Step n={4} title="불일치 사유 입력">
            불일치 회기 카드에 <b>'불일치 사유'</b> 칸이 열려요. 사유 텍스트만 적으면 한글파일에서 자동으로
            앞에 <b>"- "</b> 가 붙어 일지 본문과 구분돼서 별도 줄로 출력됩니다.
          </Step>
          <Step n={5} title="소급결제 알림">
            엑셀에 <b>소급결제</b> 항목이 있으면 업로드 직후 빨간 배너로 "⚠ 소급결제 N건 — 사유서 작성 확인" 알림 표시.
            각 회기 카드에도 빨간 '소급결제' 뱃지가 붙어요.
          </Step>
          <Step n={6} title="전월 기록 복사">
            <b>[📋 전월 기록 가져오기]</b> 로 지난달 결과·총평을 복사 → 수정해서 저장.
          </Step>
          <Step n={7} title="한글파일 다운로드">
            <b>[한글파일(.hwpx) 다운로드]</b>. 회기가 6회 이상이면 자동으로 여러 장 ZIP 으로 묶여 나와요.
          </Step>
        </Section>

        {/* 6. 수기로 작성하는 분 */}
        <Section id="handwrite" num="6" title="수기로 작성하는 분">
          <p style={{ marginTop: 0, wordBreak: "keep-all" }}>
            지자체·센터 운영 방침상 <b>결과 기록과 부모 서명을 회기마다 종이에 직접</b> 받아야 하는 경우가 많아요.
            이럴 때도 우리 도구가 위쪽 표(이름·날짜·시간·바우처·승인번호 등)는 자동으로 채워서 인쇄해주니까,
            <b> 그 종이 한 장에 5회기 결과와 5개 부모 서명을 누적</b>해서 채우시면 됩니다.
          </p>

          <Step n={1} title="월초 — 일정표 만들기">
            평소처럼 일정표를 만들고 저장하세요. 이게 종이에 들어갈 회기 날짜·시간의 기준이 됩니다.
          </Step>
          <Step n={2} title="월초 — 기록지에서 한글파일 다운로드">
            <b>[기록지] → 아동·연·월 선택 → [작성 시작]</b>. 결과 칸은 빈 상태로 두고 바로
            <b> [한글파일(.hwpx) 다운로드]</b>. 위쪽 표는 자동으로 채워져 인쇄돼요.
            한 아동이 12명이라면 <b>[기록지 한꺼번에]</b> 버튼으로 12장을 ZIP 으로 한 번에 받을 수도 있어요.
          </Step>
          <Step n={3} title="회기마다 — 종이에 손글씨 + 서명">
            인쇄한 종이를 학생별 파일에 끼워두고, 회기 끝날 때마다 그날 칸에 결과를 쓰고 부모 서명을 받으세요.
            5회기가 끝나면 5칸이 다 채워집니다.
          </Step>
          <Step n={4} title="월말 — 엑셀 받은 후 (선택)">
            전자바우처 엑셀이 도착하면 <b>[기록지]</b> 에 업로드해서 승인번호·결제일을 확인.
            필요하면 그 정보를 종이에 손으로 추가하거나, 디지털 보관용으로 결과 텍스트도 입력해 다시 한 번 저장할 수 있어요.
          </Step>

          <Callout kind="tip">
            <b>결과 칸을 입력 안 해도 저장·다운로드가 됩니다.</b> 디지털 기록이 필요 없으면 한글파일만 받고 종이로만 관리하시면 돼요.
            나중에 같은 아동·월로 다시 들어와도 위 표는 그대로 자동 재생성됩니다.
          </Callout>
          <Callout kind="info">
            <b>승인내역 점검</b> 메뉴는 수기로 운영하는 분들도 똑같이 유용해요.
            엑셀만 올리면 결제 시간 겹침을 자동 검출하니까 종이 작성 여부와 무관하게 지자체 점검 전에 한 번씩 돌려보세요.
          </Callout>
        </Section>

        {/* 7. 승인내역 점검 */}
        <Section id="approval" num="7" title="승인내역 점검">
          <p style={{ marginTop: 0, wordBreak: "keep-all" }}>
            지자체 점검 전에 본인 결제 내역을 미리 자가 점검합니다.
            가장 흔한 문제 — <b>같은 날 결제 시간이 너무 가까워서 이전 회기와 겹치는 경우</b>를 자동으로 잡아줘요.
          </p>

          <Step n={1} title="엑셀 업로드">
            <b>[승인내역 점검]</b> 메뉴 → 서비스제공내역.xls 그대로 업로드.
          </Step>
          <Step n={2} title="자동 점검">
            결제일·시간 기준으로 정렬한 뒤 직전 결제와의 간격을 계산.
            정상 회기 길이(50분) 기준 <b>±10분 허용 → 40분 이상이면 정상</b>, 40분 미만이면 빨간 행으로 강조.
            점심·블록 전환 같은 긴 휴식은 검사하지 않아요 (겹침만 잡습니다).
          </Step>
          <Step n={3} title="소급결제 표시">
            <b>결제구분</b> 열에 '소급결제' 가 있으면 노란 행으로 표시 + 상단 안내. 별도 사유서 작성 잊지 마세요.
          </Step>

          <Callout kind="tip">
            예: 홍길동 16:01 결제 → 김온담 16:30 결제 = 29분 간격 → <b>김온담 행 빨강</b>
            ("이전 회기와 겹침 — 11분 빠름").
          </Callout>
        </Section>

        {/* 7. 내 시간표 */}
        <Section id="timetable" num="8" title="내 시간표">
          <p style={{ marginTop: 0, wordBreak: "keep-all" }}>
            저장된 일정표를 <b>월간 캘린더</b>로 한 눈에 봅니다. 모든 회기가 날짜별·시간순으로 표시되고,
            공휴일·오늘 날짜는 색으로 구분돼요.
          </p>
          <Step n={1} title="월 변경">상단 드롭다운으로 보고 싶은 월을 선택.</Step>
          <Step n={2} title="대시보드 연동">
            대시보드 "이번 주 회기" 카드의 <b>[전체 일정 →]</b> 버튼이 바로 이 화면으로 연결됩니다.
          </Step>
        </Section>

        {/* 8. 한꺼번에 다운로드 */}
        <Section id="bulk" num="9" title="한꺼번에 다운로드">
          <p style={{ marginTop: 0, wordBreak: "keep-all" }}>
            대시보드 상단의 그라디언트 버튼들로 월말 마감 작업이 빨라져요.
          </p>
          <Step n={1} title="📦 일정표 한꺼번에">
            그 달에 저장된 모든 아동의 일정표 .hwpx 를 ZIP 한 파일로 다운.
          </Step>
          <Step n={2} title="📦 기록지 한꺼번에">
            마찬가지로 그 달의 모든 기록지 .hwpx. 6회기 이상인 아동은 자동 분할되어 들어갑니다.
          </Step>

          <Callout kind="tip">
            12명 담당이면 직접 24번 다운로드 → 이제 <b>2번 클릭</b>이면 끝.
            압축 파일 안의 한글 파일명도 깨지지 않게 처리되어 있어요.
          </Callout>
        </Section>

        {/* 9. 작업 상태 유지 */}
        <Section id="persist" num="10" title="작업 상태 유지">
          <p style={{ marginTop: 0, wordBreak: "keep-all" }}>
            일정표·기록지를 왔다갔다 하며 작업할 때 <b>보고 있던 화면이 그대로 유지</b>됩니다.
            의도하지 않게 처음으로 돌아가지 않아요.
          </p>
          <ul style={{ paddingLeft: 22, margin: "8px 0 0" }}>
            <li>마지막에 선택한 아동·연월이 자동 복원</li>
            <li>일정표는 생성한 캘린더 미리보기 통째로 유지</li>
            <li>기록지는 엑셀로 불러온 명단·선택한 아동 탭 유지</li>
            <li>스크롤 위치까지 그대로</li>
            <li>로그아웃·다른 계정 로그인 시에는 자동으로 비워져 다음 사용자에게 새지 않음</li>
          </ul>
        </Section>

        {/* 10. FAQ */}
        <Section id="faq" num="11" title="자주 묻는 질문">
          <div style={{ display: "grid", gap: 14 }}>
            <details style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "12px 16px" }}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>Q. 가입 후 입력한 내용을 어디서 바꿔요?</summary>
              <div style={{ marginTop: 10, color: "var(--text-soft)", lineHeight: 1.75 }}>
                왼쪽 <b>[내 설정]</b>. 이름·치료사 종류·소속 센터명·주력 치료 영역·회당 단가·시간대 등 회원가입 때 입력한 거 전부 수정 가능.
                저장하는 즉시 일정표·기록지에 반영됩니다.
              </div>
            </details>
            <details style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "12px 16px" }}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>Q. 한글파일이 안 열려요</summary>
              <div style={{ marginTop: 10, color: "var(--text-soft)", lineHeight: 1.75 }}>
                한컴오피스(아래아한글) 2010 이상에서 .hwpx 를 열 수 있어요. 무료 뷰어는 한컴 공식 사이트에서 받을 수 있습니다.
                LibreOffice 등 다른 프로그램은 일부 서식이 깨질 수 있어요.
              </div>
            </details>
            <details style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "12px 16px" }}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>Q. 한 번 작성한 기록지를 다시 수정할 수 있나요?</summary>
              <div style={{ marginTop: 10, color: "var(--text-soft)", lineHeight: 1.75 }}>
                네. 같은 아동·연·월로 다시 들어가면 기존 내용이 그대로 불러와집니다. 수정 후 다시 저장하면 덮어써져요.
              </div>
            </details>
            <details style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "12px 16px" }}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>Q. 압축 파일 풀면 파일명이 깨져요</summary>
              <div style={{ marginTop: 10, color: "var(--text-soft)", lineHeight: 1.75 }}>
                일정표·기록지 한꺼번에 받기는 한글 파일명을 UTF-8 로 저장하고 있어요.
                윈도우 기본 압축해제기에서도 깨지지 않습니다. 그래도 깨지면 반디집·알집 등 한글 인코딩 인식 도구를 사용하세요.
              </div>
            </details>
            <details style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "12px 16px" }}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>Q. 비밀번호를 잊었어요</summary>
              <div style={{ marginTop: 10, color: "var(--text-soft)", lineHeight: 1.75 }}>
                현재 베타 단계에선 운영자에게 직접 요청해주세요. 정식 출시 후 자가 초기화 기능 추가 예정.
              </div>
            </details>
            <details style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "12px 16px" }}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>Q. 데이터가 안전한가요?</summary>
              <div style={{ marginTop: 10, color: "var(--text-soft)", lineHeight: 1.75 }}>
                모든 정보는 국내(춘천) 서버에 저장되고 HTTPS 로 암호화 전송됩니다.
                본인 사물함은 본인만 접근 가능하며 다른 사용자에게 절대 노출되지 않아요.
                한 계정 = 한 기기 로그인 정책으로 계정 공유도 사실상 차단됩니다.
              </div>
            </details>
            <details style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "12px 16px" }}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>Q. 모바일에서도 사용할 수 있나요?</summary>
              <div style={{ marginTop: 10, color: "var(--text-soft)", lineHeight: 1.75 }}>
                네. 스마트폰 브라우저로 https://baroilji.com 에 접속하면 모바일에 맞게 조정된 화면으로 동작합니다.
                좌측 상단 햄버거(☰) 로 메뉴를 열고 닫아요.
              </div>
            </details>
          </div>
        </Section>
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
