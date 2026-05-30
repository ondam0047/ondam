import { requireUser } from "@/lib/auth";

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
    { id: "intro",     label: "처음 사용하기" },
    { id: "settings",  label: "내 설정" },
    { id: "children",  label: "내 아동 등록" },
    { id: "schedule",  label: "일정표 작성" },
    { id: "record",    label: "기록지 작성" },
    { id: "bulk",      label: "한꺼번에 다운로드" },
    { id: "faq",       label: "자주 묻는 질문" },
  ];

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) 220px",
      gap: 32,
      maxWidth: 1100,
      margin: "0 auto",
    }}>
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

        {/* PDF */}
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-md)",
          padding: "16px 18px",
          marginBottom: 36,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "var(--text)" }}>
            📄 PDF 매뉴얼 다운로드 — 인쇄·보관용
          </div>
          <a
            href={PDF_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
          >
            치료사용 설명서 PDF
          </a>
        </div>

        {/* 1. 처음 사용하기 */}
        <Section id="intro" num="1" title="처음 사용하기">
          <p style={{ marginTop: 0, wordBreak: "keep-all" }}>
            바로일지는 발달재활 치료사의 <b>일정표·기록지 작성을 자동화</b>하는 1인용 도구입니다.
            한 번 입력한 아동 정보로 매월 반복되는 서류를 빠르게 만들 수 있어요.
            <b> 내 사물함은 본인만 보입니다.</b> 다른 사람에게 절대 노출되지 않아요.
          </p>

          <Step n={1} title="가입 · 로그인">
            받으신 <b>초대코드</b>로 가입하세요. 본인 이름·치료사 종류·이메일·비밀번호만 입력하면
            본인 사물함이 자동으로 만들어집니다.
          </Step>

          <Step n={2} title="대시보드 둘러보기">
            로그인 후 첫 화면이 대시보드입니다. 오늘 회기·이번 달 진행률·미작성 기록지 등 본인 작업 현황을 한 눈에 봅니다.
            상단의 <b>[이번 달 출석부]</b>, <b>[일정표 한꺼번에]</b>, <b>[기록지 한꺼번에]</b> 버튼으로 월말 마감 작업이 빨라져요.
          </Step>

          <Step n={3} title="왼쪽 메뉴 활용">
            모든 기능은 왼쪽 사이드바에서 접근합니다. 모바일에서는 좌측 상단 햄버거(☰) 버튼으로 메뉴를 열고 닫아요.
          </Step>

          <Callout kind="tip">
            한 계정은 <b>한 기기</b>에서만 로그인 유지됩니다. 새 기기에서 로그인하면 기존 기기는 자동 로그아웃돼요.
          </Callout>
        </Section>

        {/* 2. 내 설정 */}
        <Section id="settings" num="2" title="내 설정">
          <Step n={1} title="이름 · 소속 센터명">
            일정표·기록지의 <b>제공기관명</b> 으로 자동 채워져요. 근무 센터가 바뀌면 여기서 수정하세요.
          </Step>
          <Step n={2} title="주력 치료 영역">
            가입 시 선택한 본인 치료사 종류에 맞춰 기본값으로 자동 설정됩니다.
            <b> 일정표·기록지 작성 시</b> 회기마다 다른 종류로 바꿀 수 있어요.
          </Step>
        </Section>

        {/* 3. 내 아동 등록 */}
        <Section id="children" num="3" title="내 아동 등록">
          <p style={{ marginTop: 0, wordBreak: "keep-all" }}>
            아동을 미리 등록해두면 매월 일정표·기록지 작성 시 정보가 자동으로 채워져요.
          </p>

          <Step n={1} title="엑셀로 한 번에 가져오기 (추천)">
            <b>[내 아동] → [엑셀로 가져오기]</b> → 전자바우처 '서비스제공내역.xls' 그대로 업로드.
            대상자 명단이 자동으로 추출됩니다. 또는 기본 양식을 받아 본인이 채워서 올릴 수도 있어요.
          </Step>
          <Step n={2} title="한 명씩 등록">
            <b>[내 아동] → [한 명씩 등록]</b> 에서 이름·생년월일·서비스 종류·기본 시간대·요일·단가·월 목표 회기 등을 입력.
            한 아동이 여러 서비스를 받으면 <b>[서비스 추가]</b> 로 같은 사람의 두 번째 서비스를 등록할 수 있어요.
          </Step>
        </Section>

        {/* 4. 일정표 */}
        <Section id="schedule" num="4" title="일정표 작성">
          <Step n={1} title="아동·연·월 선택">
            <b>[일정표]</b> 에서 작성할 아동과 월을 선택하면, 기본 정보(이름·생년월일·치료사·기관명)가 자동으로 채워져요.
          </Step>
          <Step n={2} title="요일 패턴으로 자동 생성">
            반복 요일과 기본 시간대를 고른 뒤 <b>[자동 생성]</b> → 한 달치 회기가 한 번에 만들어집니다.
            공휴일은 자동으로 제외돼요.
          </Step>
          <Step n={3} title="전월 일정 그대로 복사">
            매월 같은 패턴이면 <b>[📋 전월 일정 복사]</b> 한 번이면 끝.
            새 달의 같은 요일·시간으로 자동 적용됩니다.
          </Step>
          <Step n={4} title="회기 수정">
            특정 날짜의 시간이 다르거나 보강회기면 그 칸을 클릭해 개별 수정.
          </Step>
          <Step n={5} title="한글파일 다운로드">
            <b>[한글파일 만들기]</b> 클릭 → .hwpx 다운로드 → 인쇄·제출.
          </Step>
        </Section>

        {/* 5. 기록지 */}
        <Section id="record" num="5" title="기록지 작성">
          <p style={{ marginTop: 0, wordBreak: "keep-all" }}>
            두 가지 방식이 있어요. 미리 작성해도 되고, 월말에 한 번에 작성해도 돼요.
          </p>

          <Step n={1} title="엑셀 없이 직접 시작 — 미리 작성">
            <b>[기록지] → 아동·연·월 선택 → [작성 시작]</b> 으로 빈 5칸이 열려요. 회기가 끝날 때마다 결과를 입력 후 저장.
            일정표를 먼저 만들어 두면 회기 날짜·시간이 자동으로 채워집니다.
          </Step>
          <Step n={2} title="엑셀로 자동완성 — 월말 일괄">
            전자바우처 '서비스제공내역.xls' 업로드 → 아동별로 회기 자동 추출. 결과·총평만 입력하면 끝.
          </Step>
          <Step n={3} title="전월 기록 가져오기">
            <b>[📋 전월 기록 가져오기]</b> 버튼으로 지난달 결과·총평 복사 → 수정해서 저장.
          </Step>
          <Step n={4} title="한글파일 다운로드">
            <b>[한글파일 만들기]</b> → .hwpx. 회기가 6회 이상이면 자동으로 여러 장 ZIP 으로 묶여 나와요.
          </Step>
        </Section>

        {/* 6. 일괄 다운로드 */}
        <Section id="bulk" num="6" title="한꺼번에 다운로드">
          <Step n={1} title="이번 달 출석부">
            <b>[대시보드] → [📊 이번 달 출석부]</b> 클릭 → 본인 한 달치 회기를 엑셀로 다운.
          </Step>
          <Step n={2} title="일정표 한꺼번에">
            저장된 일정표 전부를 한 번에 ZIP 으로 받아요. 각 아동별 .hwpx 파일로 들어 있음.
          </Step>
          <Step n={3} title="기록지 한꺼번에">
            마찬가지로 저장된 기록지 전부를 ZIP 으로. 6회기 이상은 자동 분할돼서 들어가요.
          </Step>

          <Callout kind="tip">
            매월 마감 시 12명 담당이면 직접 24번 다운로드 → 이제 <b>2번 클릭</b>이면 끝.
          </Callout>
        </Section>

        {/* 7. FAQ */}
        <Section id="faq" num="7" title="자주 묻는 질문">
          <div style={{ display: "grid", gap: 14 }}>
            <details style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "12px 16px" }}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>Q. 한글파일이 안 열려요</summary>
              <div style={{ marginTop: 10, color: "var(--text-soft)", lineHeight: 1.75 }}>
                한컴오피스(아래아한글) 2010 이상에서 .hwpx 형식을 열 수 있어요.
                무료 뷰어는 한컴 공식 사이트에서 받을 수 있습니다.
                LibreOffice 등 다른 프로그램은 일부 서식이 깨질 수 있어요.
              </div>
            </details>
            <details style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "12px 16px" }}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>Q. 비밀번호를 잊었어요</summary>
              <div style={{ marginTop: 10, color: "var(--text-soft)", lineHeight: 1.75 }}>
                현재 베타 단계에선 운영자에게 직접 요청해주세요. 정식 출시 후 자가 초기화 기능 추가 예정.
              </div>
            </details>
            <details style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "12px 16px" }}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>Q. 한 번 작성한 기록지를 다시 수정할 수 있나요?</summary>
              <div style={{ marginTop: 10, color: "var(--text-soft)", lineHeight: 1.75 }}>
                네. 같은 아동·연·월로 다시 들어가면 기존 내용이 그대로 불러와집니다. 수정 후 다시 저장하세요.
              </div>
            </details>
            <details style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "12px 16px" }}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>Q. 데이터가 안전한가요?</summary>
              <div style={{ marginTop: 10, color: "var(--text-soft)", lineHeight: 1.75 }}>
                모든 정보는 국내(춘천) 서버에 저장되고 HTTPS 로 암호화 전송됩니다.
                본인 사물함은 본인만 접근 가능하며, 다른 사용자에겐 절대 노출되지 않아요.
                한 계정 = 한 기기 로그인 정책으로 계정 공유도 사실상 차단됩니다.
              </div>
            </details>
            <details style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "12px 16px" }}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>Q. 모바일에서도 사용할 수 있나요?</summary>
              <div style={{ marginTop: 10, color: "var(--text-soft)", lineHeight: 1.75 }}>
                네. 스마트폰 브라우저로 https://baroilji.com 에 접속하면 모바일에 맞게 조정된 화면으로 동작합니다.
                좌측 상단의 햄버거(☰) 버튼으로 메뉴를 열고 닫을 수 있어요.
              </div>
            </details>
          </div>
        </Section>
      </div>

      {/* 우측 TOC */}
      <aside style={{
        position: "sticky",
        top: 24,
        alignSelf: "start",
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
