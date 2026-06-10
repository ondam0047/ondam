import Link from "next/link";

// 사용자 본인이 로컬에서 확인하는 용도. http://localhost:3000/landing
// 배포·운영 영향 없음. middleware.ts 의 PUBLIC_PATHS 에 "/landing" 추가됨.

export const metadata = {
  title: "바로일지 — 발달재활 치료사를 위한 통합 SaaS",
  description: "회기 끝나고 매일 1시간씩 더 일하셨죠. 바로일지가 그 시간 돌려드립니다. 일정·기록·바우처·음성 분석까지 한 화면에서.",
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] font-[var(--font-body)]">
      {/* ───────── 상단바 ───────── */}
      <header className="sticky top-0 z-50 bg-[var(--bg)]/90 backdrop-blur border-b border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/landing" className="text-xl font-extrabold tracking-tight">
            바로일지 <span className="text-sm font-normal text-[var(--text-mute)]">baroilji</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <a href="#features" className="text-[var(--text-soft)] hover:text-[var(--text)]">기능</a>
            <a href="#pricing" className="text-[var(--text-soft)] hover:text-[var(--text)]">가격</a>
            <a href="#faq" className="text-[var(--text-soft)] hover:text-[var(--text)]">FAQ</a>
            <Link href="/login" className="text-[var(--text-soft)] hover:text-[var(--text)]">로그인</Link>
            <Link
              href="/signup"
              className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white px-4 py-2 rounded-lg font-semibold"
            >
              1개월 무료 시작
            </Link>
          </nav>
        </div>
      </header>

      {/* ───────── ① Hero ───────── */}
      <section className="px-6 pt-20 pb-24">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-block px-3 py-1 rounded-full bg-[var(--primary-soft)] text-[var(--primary)] text-xs font-semibold mb-6">
            KODDI 2021 보고서 1순위 페인 해결
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold leading-tight">
            회기 끝나고 매일 1시간씩<br />
            더 일하셨죠.<br />
            <span className="bg-yellow-200 px-2 inline-block mt-2">
              바로일지가 그 시간 돌려드립니다.
            </span>
          </h1>
          <p className="mt-8 text-lg md:text-xl text-[var(--text-soft)] max-w-3xl mx-auto leading-relaxed">
            기록·일정·바우처 청구에 음성 분석 9종까지.<br />
            발달재활 치료사 한 분께 필요한 모든 도구를 한 화면에서.
          </p>

          {/* CTA */}
          <div className="mt-10 flex flex-col items-center gap-3">
            <Link
              href="/signup"
              className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-lg font-bold px-10 py-4 rounded-2xl shadow-lg transition"
            >
              1개월 무료 시작 →
            </Link>
            <p className="text-sm text-[var(--text-mute)]">카드 등록 불필요 · 약속·해지 자유</p>
          </div>

          {/* 신뢰 카드 3개 */}
          <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-3 max-w-3xl mx-auto text-sm">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl py-3 px-4">
              ✅ 베타 사용자 10명 함께
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl py-3 px-4">
              ✅ 국내 서버 저장 (춘천 NCP)
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl py-3 px-4">
              ✅ 정부 동의 체계 준수
            </div>
          </div>
        </div>
      </section>

      {/* ───────── ② Pain Section ───────── */}
      <section className="px-6 py-20 bg-[var(--surface-2)]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-[var(--accent)] mb-3">YOUR PAIN</p>
            <h2 className="text-3xl md:text-5xl font-extrabold leading-tight">
              매일 1시간, 한 달 20시간,<br />
              <span className="text-[#B8453A]">1년 240시간</span>을 잃고 계세요.
            </h2>
            <p className="mt-4 text-lg text-[var(--text-soft)]">
              회기 후 행정 야근, 바우처 청구, 점검 대비 — 본인 시간이 갉아먹히고 있습니다.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6">
              <div className="text-3xl mb-3">💔</div>
              <h3 className="font-bold text-lg mb-2">회기 후 매일 야근</h3>
              <p className="text-sm text-[var(--text-soft)] leading-relaxed">
                회기일지·평가서 작성에 매일 1~2시간 추가. 무급 노동이 일상이 됐어요.
              </p>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6">
              <div className="text-3xl mb-3">😰</div>
              <h3 className="font-bold text-lg mb-2">바우처 청구 누락</h3>
              <p className="text-sm text-[var(--text-soft)] leading-relaxed">
                결제 시간 겹침 한 줄에 환수·영업정지 리스크. 점검 전날 불안.
              </p>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6">
              <div className="text-3xl mb-3">🚨</div>
              <h3 className="font-bold text-lg mb-2">3년 주기 평가</h3>
              <p className="text-sm text-[var(--text-soft)] leading-relaxed">
                사회복지시설 평가 대비 서류 누적. 한 달 전부터 잠 못 잠.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── ③ KODDI Quote ───────── */}
      <section className="px-6 py-20">
        <div className="max-w-3xl mx-auto bg-[var(--surface)] border-2 border-[var(--primary)] rounded-3xl p-10 text-center shadow-lg">
          <p className="text-sm font-semibold text-[var(--accent)] mb-4">정부 보고서가 증명합니다</p>
          <p className="text-2xl md:text-3xl font-bold leading-tight">
            발달재활 기관 100곳이 꼽은<br />개선 요구 1순위
          </p>
          <div className="my-8">
            <div className="text-7xl md:text-8xl font-extrabold text-[var(--primary)]">4.68</div>
            <div className="text-lg text-[var(--text-soft)]">/ 5점 (행정처리 간소화)</div>
          </div>
          <p className="text-base text-[var(--text-soft)] leading-relaxed">
            서비스 단가 인상(4.65)보다 높은 1순위 요구.<br />
            <span className="font-semibold">&ldquo;수기 작성 시스템을 전산화 해주세요.&rdquo;</span>
          </p>
          <p className="mt-6 text-xs text-[var(--text-mute)]">
            * 한국장애인개발원 「장애아동 발달재활서비스 효과성 및 개선방안 연구」(2021)<br />
            * 김동일·이주영·안예지 / 서울대학교 산학협력단 위탁 · 100개 기관 + 10명 전문가 FGI
          </p>
        </div>
      </section>

      {/* ───────── ④ Features ───────── */}
      <section id="features" className="px-6 py-20 bg-[var(--surface-2)]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-[var(--accent)] mb-3">기능</p>
            <h2 className="text-3xl md:text-5xl font-extrabold">기록부터 음성 분석까지</h2>
            <p className="mt-4 text-lg text-[var(--text-soft)]">
              한 화면에서 발달재활 치료사가 매일 쓰는 모든 도구
            </p>
          </div>

          {/* 기본 5종 */}
          <div className="mb-12">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <span className="bg-[var(--primary)] text-white text-xs px-2 py-1 rounded">기본 · Solo 포함</span>
              회기 관리 5종
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <FeatureCard icon="📅" title="일정표 자동 생성" desc="아동 + 반복 요일 → 한 달치 자동 + 공휴일 제외" />
              <FeatureCard icon="📝" title="회기 기록지" desc="미리 작성 + 월말 엑셀 자동 매칭" />
              <FeatureCard icon="🔍" title="승인내역 점검" desc="결제 간격 위반 자동 검출" />
              <FeatureCard icon="📦" title="한꺼번에 다운로드" desc="월·아동 선택 → ZIP 한 파일" />
              <FeatureCard icon="📄" title="한글파일 출력" desc="별지 양식 그대로 1클릭 다운로드" />
              <FeatureCard icon="📊" title="내 시간표" desc="이번 주 회기 한눈에 + 미작성 알림" />
            </div>
          </div>

          {/* Solo 음성 분석 4종 */}
          <div className="mb-12">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <span className="bg-[var(--accent)] text-white text-xs px-2 py-1 rounded">Solo</span>
              음성 시각화 4종
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <FeatureCard icon="🎙" title="실시간 음도·강도" desc="발성 시각화 (F0 + dB 추적)" />
              <FeatureCard icon="〰️" title="/s/ 스펙트로그램" desc="마찰음 시각화 학습" />
              <FeatureCard icon="⏱" title="MPT 측정" desc="최대발성지속시간 기록" />
              <FeatureCard icon="🎧" title="DAF 훈련 보조" desc="지연 청각 피드백 연습" />
            </div>
          </div>

          {/* Pro 분석·연습 5종 */}
          <div>
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <span className="bg-[#5A6E3D] text-white text-xs px-2 py-1 rounded">Pro</span>
              분석·연습 5종
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <FeatureCard icon="🗣" title="말속도 측정" desc="VAD + ASR 음절 카운트" />
              <FeatureCard icon="📈" title="유창성 자가 모니터링" desc="음향·전사 1차 자동 태깅" />
              <FeatureCard icon="🎯" title="말속도 조절 연습" desc="시각·청각 단서 페이싱" />
              <FeatureCard icon="🔠" title="조음 학습 자료" desc="바로조음 (제작 중)" soon />
              <FeatureCard icon="💬" title="화용 학습 게임" desc="바로화용 (제작 중)" soon />
            </div>
          </div>

          {/* 비의료기기 면책 */}
          <p className="text-xs text-[var(--text-mute)] mt-10 text-center max-w-2xl mx-auto leading-relaxed">
            본 도구는 「의료기기법」의 적용을 받지 않는 학습·연습·시각화 보조 도구이며,
            의료 진단·치료를 제공·대체하지 않습니다.
          </p>
        </div>
      </section>

      {/* ───────── ⑤ Pricing ───────── */}
      <section id="pricing" className="px-6 py-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-[var(--accent)] mb-3">가격</p>
            <h2 className="text-3xl md:text-5xl font-extrabold">발달재활 치료사 한 분께 딱 필요한 만큼만</h2>
            <p className="mt-4 text-lg text-[var(--text-soft)]">1개월 무료 · 카드 등록 불요 · 1인 1계정</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Solo */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-8 flex flex-col">
              <div className="flex items-center gap-3 mb-3">
                <span className="bg-[var(--accent)] text-white text-xs px-2 py-1 rounded font-semibold">Solo</span>
                <span className="text-xs text-[var(--text-mute)]">개인 치료사</span>
              </div>
              <div className="my-3">
                <div className="text-5xl font-extrabold">15,900<span className="text-xl font-normal text-[var(--text-mute)]">원/월</span></div>
                <p className="text-sm text-[var(--text-soft)] mt-1">하루 530원 · 커피 4잔 가격</p>
              </div>
              <ul className="space-y-2 my-6 text-sm">
                <li>✅ 기본 회기 관리 5종</li>
                <li>✅ 음성 시각화 4종 (음도·강도·/s/·MPT·DAF)</li>
                <li>✅ 1개월 무료 (카드 등록 X)</li>
                <li>✅ 한글파일 무제한 출력</li>
              </ul>
              <Link
                href="/signup"
                className="mt-auto bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-center py-3 rounded-xl font-bold"
              >
                1개월 무료 시작 →
              </Link>
            </div>

            {/* Pro */}
            <div className="bg-[var(--surface)] border-2 border-[var(--primary)] rounded-3xl p-8 flex flex-col relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-200 text-[var(--text)] text-xs font-bold px-3 py-1 rounded-full">
                BEST · 임상 도구 풀세트
              </div>
              <div className="flex items-center gap-3 mb-3">
                <span className="bg-[var(--primary)] text-white text-xs px-2 py-1 rounded font-semibold">Pro</span>
                <span className="text-xs text-[var(--text-mute)]">전문 임상가용</span>
              </div>
              <div className="my-3">
                <div className="text-5xl font-extrabold">29,800<span className="text-xl font-normal text-[var(--text-mute)]">원/월</span></div>
                <p className="text-sm text-[var(--text-soft)] mt-1">하루 990원 · Solo 대비 +13,900원</p>
              </div>
              <ul className="space-y-2 my-6 text-sm">
                <li>✅ Solo 전체 포함</li>
                <li>✅ 분석·연습 5종 (말속도·유창성·말속도조절·조음·화용)</li>
                <li>✅ 1개월 무료 (카드 등록 X)</li>
                <li>✅ 신규 기능 우선 체험</li>
              </ul>
              <Link
                href="/signup"
                className="mt-auto bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-center py-3 rounded-xl font-bold"
              >
                1개월 무료 시작 →
              </Link>
            </div>
          </div>

          {/* 베타 락인 안내 */}
          <div className="mt-8 bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-6 text-center">
            <p className="font-bold text-lg mb-2">🎁 베타 참여자 평생 락인 가격</p>
            <p className="text-sm text-[var(--text-soft)]">
              초기 100명 한정 · Solo <span className="font-semibold">15,900원 평생 동일</span> · 출시 후에도 가격 변동 없음
            </p>
          </div>
        </div>
      </section>

      {/* ───────── ⑥ FAQ ───────── */}
      <section id="faq" className="px-6 py-20 bg-[var(--surface-2)]">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-[var(--accent)] mb-3">자주 묻는 질문</p>
            <h2 className="text-3xl md:text-5xl font-extrabold">궁금한 점, 정리했어요</h2>
          </div>
          <div className="space-y-4">
            <FaqItem
              q="보호자에게 따로 동의를 받아야 하나요?"
              a="아니요. 정부 사회서비스 전자바우처 가입 시 동의하신 「개인정보 수집·이용 및 제3자 제공 동의서」(서식 1-4호) 범위 안에서 운영됩니다."
            />
            <FaqItem
              q="1개월 무료 후 자동 결제되나요?"
              a="아니요. 카드 등록 없이 1개월 사용 가능합니다. 1개월 후 결제 안내가 오며, 본인이 직접 결제하셔야 사용 연장됩니다."
            />
            <FaqItem
              q="데이터는 어디 저장되나요?"
              a="모든 데이터는 국내(춘천 NCP) 서버에만 저장됩니다. 국외 이전 없습니다."
            />
            <FaqItem
              q="음성 분석 결과는 의료 기록인가요?"
              a="아니요. 본 도구는 의료기기가 아닌 학습·연습·시각화 보조 도구입니다. 의료 진단·치료를 제공·대체하지 않습니다."
            />
            <FaqItem
              q="한컴 오피스 없어도 되나요?"
              a=".hwpx 파일은 한컴 오피스 또는 무료 한컴 뷰어로 열 수 있습니다."
            />
          </div>
        </div>
      </section>

      {/* ───────── ⑦ Footer ───────── */}
      <footer className="px-6 py-12 bg-[var(--surface-3)] border-t border-[var(--border)]">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="font-extrabold text-lg mb-2">바로일지</div>
              <p className="text-sm text-[var(--text-soft)]">발달재활 치료사를 위한 통합 SaaS</p>
            </div>
            <div className="text-sm">
              <div className="font-bold mb-3">법무</div>
              <ul className="space-y-1 text-[var(--text-soft)]">
                <li><Link href="/legal/terms">이용약관</Link></li>
                <li><Link href="/legal/privacy">개인정보처리방침</Link></li>
                <li><Link href="/legal/refund">환불 정책</Link></li>
              </ul>
            </div>
            <div className="text-sm">
              <div className="font-bold mb-3">사업자 정보</div>
              <ul className="space-y-1 text-[var(--text-soft)]">
                <li>상호: (사업자명 TBD)</li>
                <li>사업자등록번호: (등록 후)</li>
                <li>통신판매업: (신고 후)</li>
                <li>이메일: yj2000102@gmail.com</li>
              </ul>
            </div>
          </div>
          <div className="text-xs text-[var(--text-mute)] text-center pt-8 border-t border-[var(--border)]">
            © 2026 바로일지. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

// ───────── 보조 컴포넌트 ─────────

function FeatureCard({ icon, title, desc, soon }: { icon: string; title: string; desc: string; soon?: boolean }) {
  return (
    <div className={`bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 ${soon ? "opacity-70" : ""}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className="text-2xl">{icon}</div>
        <h4 className="font-bold">{title}</h4>
        {soon && <span className="text-xs bg-[var(--surface-3)] text-[var(--text-mute)] px-2 py-0.5 rounded">제작 중</span>}
      </div>
      <p className="text-sm text-[var(--text-soft)]">{desc}</p>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 group">
      <summary className="font-bold cursor-pointer list-none flex items-center justify-between">
        <span>{q}</span>
        <span className="text-[var(--text-mute)] group-open:rotate-180 transition">▼</span>
      </summary>
      <p className="text-sm text-[var(--text-soft)] mt-3 leading-relaxed">{a}</p>
    </details>
  );
}
