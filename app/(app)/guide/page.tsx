import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ROLE_COLORS = {
  OWNER: { bg: "#FFF5E6", border: "#F5C57E", text: "#A66400", label: "원장" },
  ADMIN: { bg: "#E8F1FC", border: "#7BAEE5", text: "#1F4E91", label: "행정" },
  THERAPIST: { bg: "#E7F4EE", border: "#7CC1A3", text: "#1F7A52", label: "치료사" },
} as const;

type RoleKey = keyof typeof ROLE_COLORS;

function Badge({ role }: { role: RoleKey }) {
  const c = ROLE_COLORS[role];
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 10px",
      borderRadius: 999,
      background: c.bg,
      border: `1px solid ${c.border}`,
      color: c.text,
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: "-0.01em",
      verticalAlign: "middle",
    }}>{c.label}</span>
  );
}

function Section({
  id, num, title, badges, children,
}: {
  id: string; num: string; title: string;
  badges?: RoleKey[]; children: React.ReactNode;
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
        {badges && badges.map((r) => <Badge key={r} role={r} />)}
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
  const myRole = user.role as RoleKey;

  const TOC = [
    { id: "intro",     label: "처음 사용하기",   for: ["OWNER", "ADMIN", "THERAPIST"] },
    { id: "owner",     label: "원장님 가이드",   for: ["OWNER"] },
    { id: "admin",     label: "행정 가이드",     for: ["OWNER", "ADMIN"] },
    { id: "therapist", label: "치료사 가이드",   for: ["OWNER", "ADMIN", "THERAPIST"] },
    { id: "faq",       label: "자주 묻는 질문",  for: ["OWNER", "ADMIN", "THERAPIST"] },
  ].filter((s) => s.for.includes(myRole));

  const PDF_LINKS = [
    { href: "/guides/바로일지_치료사용_설명서.pdf", label: "치료사용 PDF", role: "THERAPIST" as RoleKey },
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
            지금 보시는 사용자: <Badge role={myRole} /> <b>{user.name}</b> 님 · 본인 역할에 맞춰 항목을 표시합니다.
          </div>
        </div>

        {/* PDF 다운로드 */}
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-md)",
          padding: "16px 18px",
          marginBottom: 36,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "var(--text)" }}>
            📄 PDF 매뉴얼 다운로드 — 인쇄·배포용
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PDF_LINKS.map((p) => (
              <a
                key={p.href}
                href={p.href}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost"
                style={{
                  borderColor: ROLE_COLORS[p.role].border,
                  color: ROLE_COLORS[p.role].text,
                  background: ROLE_COLORS[p.role].bg,
                }}
              >
                {p.label}
              </a>
            ))}
          </div>
        </div>

        {/* 1. 처음 사용하기 */}
        <Section id="intro" num="1" title="처음 사용하기" badges={["OWNER", "ADMIN", "THERAPIST"]}>
          <p style={{ marginTop: 0, wordBreak: "keep-all" }}>
            바로일지는 발달재활 센터의 <b>일정표·기록지 작성을 자동화</b>하는 통합관리 도구입니다.
            한 번 입력한 아동 정보로 매월 반복되는 서류를 빠르게 만들 수 있어요.
          </p>

          <Step n={1} title="로그인 · 가입">
            화면에 보이는 안내에 따라 가입하세요.
            <b> 첫 가입자(원장)</b>는 자동으로 원장 권한이 부여되며, 6자리 <b>승인코드</b>가 발급됩니다.
            치료사·행정 선생님들은 그 코드를 받아 가입하세요.
          </Step>

          <Step n={2} title="대시보드 확인">
            로그인 후 첫 화면이 대시보드입니다. 본인 역할에 맞는 정보(이번 주 일정, 미작성 기록 등)가 한 눈에 보입니다.
          </Step>

          <Step n={3} title="왼쪽 메뉴 활용">
            모든 기능은 왼쪽 사이드바에서 접근합니다.
            메뉴는 역할에 따라 다르게 보입니다 (예: 행정 선생님은 일정표·기록지 작성 메뉴가 없음).
          </Step>

          <Callout kind="tip">
            처음 가입 시 받은 <b>6자리 승인코드</b>는 잊지 말고 메모해두세요.
            치료사·행정 선생님 가입 시 매번 필요합니다. 분실 시 [센터 설정] 에서 다시 발급 가능.
          </Callout>
        </Section>

        {/* 2. 원장님 가이드 */}
        {myRole === "OWNER" && (
          <Section id="owner" num="2" title="원장님 가이드" badges={["OWNER"]}>
            <p style={{ marginTop: 0, wordBreak: "keep-all" }}>
              원장님은 모든 기능을 사용할 수 있습니다. 센터 운영 관리 + 본인 회기 작성 둘 다 가능해요.
            </p>

            <Step n={1} title="센터 설정">
              <b>[센터 설정]</b> 메뉴에서 센터 이름·주소·전화번호를 입력하고, 승인코드를 관리합니다.
              승인코드가 외부에 유출됐다 싶으면 <b>재발급</b> 버튼으로 새 코드를 받을 수 있어요.
            </Step>

            <Step n={2} title="치료사·행정 계정 승인">
              치료사가 자가 가입하면 <b>[치료사 관리]</b> 메뉴 상단에 <span style={{ color: "var(--danger)", fontWeight: 700 }}>승인 대기</span> 카드가 나타납니다.
              [승인] 누르면 활성화, [거절] 누르면 가입 취소됩니다.
            </Step>

            <Step n={3} title="아동 등록">
              <b>[아동 관리] → [새 아동 추가]</b> 에서 아동 정보를 입력하세요.
              생년월일·서비스 종류·기본 회기 시간(예: 16:00~16:50)·기본 요일·회당 단가·월 목표 회기 수까지 한번에 입력하면,
              이후 일정표·기록지를 만들 때 자동으로 채워집니다.
            </Step>

            <Step n={4} title="엑셀로 일괄 가져오기">
              아동이 많으면 <b>[엑셀 가져오기]</b> 로 한 번에 등록 가능합니다.
              전자바우처에서 받은 엑셀 그대로 업로드하면 이름·생년월일·관리번호를 자동 인식해요.
            </Step>

            <Step n={5} title="치료사 시간표 확인">
              <b>[치료사 시간표]</b> 에서 선생님별 한 달 스케줄을 표로 볼 수 있고,
              그 화면에서 출석부(엑셀)도 다운로드할 수 있습니다.
              개별 치료사의 <b>차단 시간</b>(=받지 않는 시간)이 사선으로 표시됩니다.
            </Step>

            <Step n={6} title="일정표 · 기록지 작성">
              본인이 담당하는 아동이 있다면 치료사와 동일하게 <b>[일정표]</b>, <b>[기록지]</b> 에서 작성할 수 있어요.
              매월 한 번씩 만들고 한글파일(.hwpx)로 다운로드 → 인쇄·제출.
            </Step>

            <Callout kind="info">
              <b>승인코드 재발급</b>은 이전 코드를 무효화합니다. 재발급 후엔 새 코드로만 가입할 수 있어요.
            </Callout>
          </Section>
        )}

        {/* 3. 행정 가이드 */}
        {(myRole === "OWNER" || myRole === "ADMIN") && (
          <Section id="admin" num={myRole === "OWNER" ? "3" : "2"} title="행정 선생님 가이드" badges={["ADMIN"]}>
            <p style={{ marginTop: 0, wordBreak: "keep-all" }}>
              행정 선생님은 센터 운영·관리 기능에 집중합니다.
              일정표·기록지 작성은 직접 하지 않지만, 모든 치료사의 일정과 기록을 볼 수 있어요.
            </p>

            <Step n={1} title="대시보드">
              센터 전체 통계(활성 아동·치료사·이번주 회기 수·미작성 기록) 가 한 눈에 보입니다.
            </Step>

            <Step n={2} title="아동 관리">
              <b>[아동 관리]</b> 에서 신규 등록·정보 수정·담당 치료사 배정을 합니다.
              담당 미배정 아동만 골라보기, 검색, 치료사별 필터링 가능.
            </Step>

            <Step n={3} title="치료사 시간표">
              <b>[치료사 시간표]</b> 에서 선생님별 월간 스케줄을 보고, 출석부(엑셀)를 다운로드해 출퇴근 관리에 활용하세요.
            </Step>

            <Step n={4} title="엑셀 가져오기">
              매월 전자바우처 엑셀을 받아오면 <b>[엑셀 가져오기]</b> 로 일괄 업로드.
              기존 아동은 자동 매칭, 신규는 새로 등록됩니다.
            </Step>

            <Callout kind="tip">
              행정 선생님 메뉴엔 일정표·기록지 작성이 없습니다.
              치료사들이 직접 작성한 결과만 보고·관리 용도로 표시돼요.
            </Callout>
          </Section>
        )}

        {/* 4. 치료사 가이드 */}
        <Section
          id="therapist"
          num={myRole === "OWNER" ? "4" : myRole === "ADMIN" ? "3" : "2"}
          title="치료사 선생님 가이드"
          badges={["THERAPIST"]}
        >
          <p style={{ marginTop: 0, wordBreak: "keep-all" }}>
            치료사 선생님은 본인이 담당하는 아동의 일정표·기록지만 작성합니다.
            다른 선생님의 데이터는 보이지 않아 사생활이 보호돼요.
          </p>

          <Step n={1} title="가입 · 승인 대기">
            원장님께 받은 <b>6자리 승인코드</b> 로 가입합니다.
            가입 직후엔 <b>승인 대기</b> 상태라 로그인이 안 됩니다. 원장님 승인 후 사용 가능.
          </Step>

          <Step n={2} title="내 차단 시간 설정">
            <b>[내 차단 시간]</b> 에서 본인이 받기 어려운 요일·시간대를 등록하세요.
            (예: 월요일 09:00~12:00 = 본인 진료 / 매주 금요일 종일 = 휴무)
            등록한 시간은 시간표에 사선으로 표시돼 다른 사람도 알 수 있습니다.
          </Step>

          <Step n={3} title="내 아동 확인">
            <b>[내 아동]</b> 에서 본인 담당 아동만 모아 볼 수 있어요.
          </Step>

          <Step n={4} title="일정표 작성">
            <b>[일정표]</b> 에서 아동·연·월을 선택하면, 기본 정보로 자동 채워집니다.
            회기 시간이 다른 날만 수정하면 끝. <b>[한글파일 만들기]</b> 클릭 → .hwpx 다운로드.
          </Step>

          <Step n={5} title="기록지 작성">
            <b>[기록지]</b> 에서 아동·연·월·회차별로 결과(목표·반응)를 입력합니다.
            한 달에 5회기까지는 한 장, 그 이상이면 자동으로 여러 장 묶음 ZIP 으로 다운.
          </Step>

          <Step n={6} title="출석부 다운로드">
            <b>[치료사 시간표]</b> 위쪽 <b>[출석부 엑셀]</b> 버튼으로 본인의 한 달 출석 기록을 엑셀로 받을 수 있어요.
            (※ 원장님이 보시는 메뉴와 동일하지만, 본인 데이터만 보입니다.)
          </Step>

          <Callout kind="warn">
            기록지를 다른 치료사가 동시에 같은 아동에 대해 작성하면 마지막에 저장한 사람의 내용이 남습니다.
            가급적 본인 담당 아동만 작성하세요.
          </Callout>
        </Section>

        {/* 5. FAQ */}
        <Section id="faq" num={myRole === "OWNER" ? "5" : myRole === "ADMIN" ? "4" : "3"} title="자주 묻는 질문">
          <div style={{ display: "grid", gap: 14 }}>
            <details style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "12px 16px" }}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>Q. 한글파일이 안 열려요</summary>
              <div style={{ marginTop: 10, color: "var(--text-soft)", lineHeight: 1.75 }}>
                한컴오피스(아래아한글) 2010 이상에서 .hwpx 형식을 열 수 있습니다.
                무료 뷰어는 한컴 공식 사이트에서 받을 수 있어요.
                LibreOffice 등 다른 프로그램은 일부 서식이 깨질 수 있습니다.
              </div>
            </details>
            <details style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "12px 16px" }}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>Q. 비밀번호를 잊었어요</summary>
              <div style={{ marginTop: 10, color: "var(--text-soft)", lineHeight: 1.75 }}>
                원장님께 말씀하세요. 원장님이 <b>[치료사 관리]</b> 에서 비밀번호 초기화를 도와드릴 수 있습니다.
                (자가 초기화 기능은 추후 추가 예정)
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
                다른 센터의 데이터는 절대 보이지 않으며, 같은 센터 내에서도 권한(원장·행정·치료사) 에 따라 보이는 범위가 달라요.
              </div>
            </details>
            <details style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "12px 16px" }}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>Q. 기능 추가나 수정 요청은 어디서?</summary>
              <div style={{ marginTop: 10, color: "var(--text-soft)", lineHeight: 1.75 }}>
                원장님께 의견을 모아 전달해주세요. 정기적으로 업데이트되며, 사용자가 늘면 더 많은 기능이 추가됩니다.
              </div>
            </details>
          </div>
        </Section>

        {/* 마무리 */}
        <div style={{
          marginTop: 40, padding: "20px 24px",
          background: "var(--surface)",
          border: "1px dashed var(--border)",
          borderRadius: "var(--r-md)",
          textAlign: "center",
          color: "var(--text-soft)",
          fontSize: 13.5,
          lineHeight: 1.7,
        }}>
          이 설명서는 언제든 왼쪽 메뉴의 <b>[도움말]</b> 에서 다시 볼 수 있어요.
        </div>
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
