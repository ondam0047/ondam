import Link from "next/link";
import type { ReactNode } from "react";
import Reveal from "./_components/Reveal";
import CountUp from "./_components/CountUp";

// 사용자 본인이 로컬에서 확인하는 용도. http://localhost:3000/landing
// 디자인 컨셉: "따뜻한 벤토(Warm Bento)" — 벤토 그리드 + 대형 타이포 + 실제 스크린샷 + 절제된 모션.
// ⚠️ 후기·창업스토리는 더미 — 베타 후 실제 자산으로 교체.

export const metadata = {
  title: "바로일지 — 발달재활 치료사를 위한 통합 SaaS",
  description: "회기 끝나고 매일 1시간씩 더 일하셨죠. 바로일지가 그 시간 돌려드립니다. 일정·기록·바우처·음성 분석까지 한 화면에서.",
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] font-[var(--font-body)] break-keep">
      {/* ───────── 상단 띠 (KODDI) ───────── */}
      <div className="bg-[var(--primary)] text-white">
        <p
          className="max-w-6xl mx-auto px-4 py-3 text-center font-bold whitespace-nowrap overflow-hidden"
          style={{ fontSize: "clamp(0.85rem, 3.4vw, 1.5rem)" }}
        >
          KODDI 2021 · 현장 1순위 고민 ={" "}
          <span className="underline decoration-yellow-300 decoration-2 underline-offset-2">행정 부담</span>
        </p>
      </div>

      {/* ───────── 상단바 ───────── */}
      <header className="sticky top-0 z-50 bg-[var(--bg)]/85 backdrop-blur-md border-b border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <Link href="/landing" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/logo.png" alt="바로일지" className="h-9 w-auto" />
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm">
            <a href="#features" className="text-[var(--text-soft)] hover:text-[var(--text)] transition">기능</a>
            <a href="#pricing" className="text-[var(--text-soft)] hover:text-[var(--text)] transition">가격</a>
            <a href="#faq" className="text-[var(--text-soft)] hover:text-[var(--text)] transition">FAQ</a>
            <Link href="/login" className="text-[var(--text-soft)] hover:text-[var(--text)] transition">로그인</Link>
            <Link
              href="/signup"
              className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white px-4 py-2 rounded-full font-semibold transition"
            >
              1개월 무료 시작
            </Link>
          </nav>
        </div>
      </header>

      {/* ───────── ① Hero ───────── */}
      <section className="px-6 pt-16 md:pt-24 pb-16">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-10 items-center">
          {/* 좌: 대형 타이포 */}
          <Reveal className="text-center lg:text-left bi-reveal">
            <h1 className="text-4xl leading-[1.12] md:text-5xl lg:text-[3.4rem] lg:leading-[1.12] font-extrabold tracking-[-0.03em] text-balance">
              회기 끝나고 매일<br className="hidden sm:block" /> 1시간씩 더 일하셨죠.
              <span className="block mt-3">
                <span className="bg-yellow-200 px-2 box-decoration-clone leading-relaxed">그 시간, 돌려드립니다.</span>
              </span>
            </h1>
            <p className="mt-8 text-xl md:text-2xl text-[var(--text-soft)] max-w-xl mx-auto lg:mx-0 leading-relaxed">
              일정표·기록지·바우처 서류, <b className="text-[var(--text)] font-bold">클릭 몇 번이면 한꺼번에 출력</b>.<br />
              수기 센터든 타이핑 센터든, 쌓인 행정 부담을 바로 덜어드립니다.
            </p>
            <div className="mt-9 flex flex-col sm:flex-row items-center lg:items-start sm:justify-center lg:justify-start gap-3">
              <Link
                href="/signup"
                className="w-full sm:w-auto text-center bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-lg font-bold px-9 py-4 rounded-2xl shadow-lg shadow-[var(--primary)]/20 transition hover:-translate-y-0.5"
              >
                1개월 무료 시작 →
              </Link>
              <span className="text-sm text-[var(--text-mute)]">카드 등록 불필요 · 약정·해지 자유</span>
            </div>
            <p className="mt-5 text-center lg:text-left">
              <span className="inline-block bg-[var(--primary-soft)] text-[var(--primary)] font-bold text-base px-3.5 py-1.5 rounded-full">☕ 하루 530원 · 한 달 커피 4잔 값</span>
            </p>
          </Reveal>

          {/* 우: 실제 대시보드 */}
          <Reveal className="relative bi-reveal" style={{ transitionDelay: "120ms" }}>
            <div className="absolute -inset-6 bg-[var(--primary)]/10 rounded-[2.5rem] blur-2xl -z-10 bi-glow-pulse" />
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-hidden rotate-[0.4deg] hover:rotate-0 transition-transform duration-500">
              <div className="flex items-center gap-1.5 px-4 py-3 bg-[var(--surface-2)] border-b border-[var(--border)]">
                <span className="w-3 h-3 rounded-full bg-[#E5705F]" />
                <span className="w-3 h-3 rounded-full bg-[#E8C15A]" />
                <span className="w-3 h-3 rounded-full bg-[#7FA85A]" />
                <span className="ml-3 text-xs text-[var(--text-mute)]">baroilji.com/dashboard</span>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/landing/dashboard.png" alt="바로일지 대시보드 화면" className="w-full block" />
            </div>
          </Reveal>
        </div>

        {/* 신뢰 바 */}
        <Reveal className="max-w-4xl mx-auto mt-14 flex flex-wrap justify-center gap-2.5 text-sm bi-reveal" style={{ transitionDelay: "220ms" }}>
          <TrustChip>✅ 베타 사용자 10명 함께</TrustChip>
          <TrustChip>✅ 국내 서버 저장 (춘천 NCP)</TrustChip>
          <TrustChip>✅ 정부 동의 체계 준수</TrustChip>
        </Reveal>
      </section>

      {/* ───────── ② Pain (강조·다크) ───────── */}
      <section className="px-6 py-24 md:py-28 bg-[#211e16] text-white relative overflow-hidden">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[40rem] h-[40rem] bg-[#B8453A]/15 blur-[130px] rounded-full pointer-events-none" />
        <div className="max-w-5xl mx-auto relative">
          <Reveal className="text-center mb-14 bi-reveal">
            <p className="text-sm font-bold tracking-[0.2em] text-[#E0857B] mb-5">YOUR PAIN</p>
            <h2 className="text-5xl md:text-7xl font-extrabold leading-[1.08] tracking-[-0.02em]">
              회기는 끝났는데,<br />일은 끝나지 않습니다.
            </h2>
          </Reveal>

          {/* 거대한 손실 카운터 */}
          <Reveal className="bi-reveal mb-16">
            <div className="flex items-end justify-center gap-2.5 md:gap-8">
              <div className="text-center">
                <div className="text-2xl md:text-5xl font-extrabold text-white/75 leading-none">1시간</div>
                <div className="mt-2 text-xs md:text-base text-white/45">매일</div>
              </div>
              <span className="text-xl md:text-4xl text-white/25 pb-1.5 md:pb-4">→</span>
              <div className="text-center">
                <div className="text-2xl md:text-5xl font-extrabold text-white/75 leading-none">20시간</div>
                <div className="mt-2 text-xs md:text-base text-white/45">한 달</div>
              </div>
              <span className="text-xl md:text-4xl text-white/25 pb-1.5 md:pb-4">→</span>
              <div className="text-center">
                <div className="text-6xl md:text-9xl font-extrabold text-[#E5705F] leading-none tracking-[-0.03em]">
                  <CountUp end={240} />
                </div>
                <div className="mt-2 text-sm md:text-lg text-white/60">1년에 잃는 시간</div>
              </div>
            </div>
            <p className="mt-12 text-lg md:text-xl text-white/70 text-center max-w-2xl mx-auto leading-relaxed">
              회기 후 행정 야근, 바우처 청구, 점검 대비 — 본인 시간이 갉아먹히고 있습니다.
            </p>
          </Reveal>

          {/* 페인 카드 (다크) */}
          <Reveal className="grid grid-cols-1 md:grid-cols-3 gap-5 bi-stagger">
            <DarkPainCard icon="💔" title="회기 후 매일 야근">
              회기일지·평가서 작성에 매일 1~2시간 추가. 무급 노동이 일상이 됐어요.
            </DarkPainCard>
            <DarkPainCard icon="😰" title="바우처 청구 누락">
              결제 시간 겹침 한 줄에 환수·영업정지 리스크. 점검 전날 불안.
            </DarkPainCard>
            <DarkPainCard icon="🚨" title="매년 바우처 점검">
              매년 돌아오는 바우처 점검 시즌. 사용·청구 서류 챙기느라 몇 주씩 야근.
            </DarkPainCard>
          </Reveal>
        </div>
      </section>

      {/* ───────── ③ 벤토 그리드 (핵심) ───────── */}
      <section id="features" className="px-6 py-20 md:py-24">
        <div className="max-w-6xl mx-auto">
          <Reveal className="text-center mb-12 bi-reveal">
            <p className="text-sm font-semibold text-[var(--accent)] mb-3">ALL-IN-ONE</p>
            <h2 className="text-3xl md:text-5xl font-extrabold tracking-[-0.02em]">치료사의 하루, 한 판에 정리</h2>
            <p className="mt-4 text-lg text-[var(--text-soft)]">기록·일정·바우처부터 음성 분석까지 — 흩어진 도구를 한 화면으로</p>
          </Reveal>

          <Reveal className="grid grid-cols-2 md:grid-cols-4 auto-rows-[150px] gap-3 md:gap-4 grid-flow-dense bi-stagger">
            {/* 음성 분석 — 대형 타일 */}
            <div className="col-span-2 row-span-2 group rounded-3xl border border-[var(--primary)]/25 bg-gradient-to-br from-[var(--primary)]/8 to-[var(--accent)]/5 p-7 flex flex-col justify-between overflow-hidden">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="bg-[var(--primary)] text-white text-xs px-2.5 py-1 rounded-full font-semibold">Solo · Pro</span>
                  <span className="text-xs text-[var(--text-mute)]">대림보이스랩</span>
                </div>
                <h3 className="text-2xl md:text-3xl font-extrabold leading-tight">실시간 음성 분석 9종</h3>
                <p className="mt-2 text-[var(--text-soft)] leading-relaxed max-w-md">
                  음도·강도, /s/ 스펙트로그램, MPT, DAF부터 말속도·유창성·말속도조절까지.
                  치료실에서 바로 보여주는 시각화.
                </p>
              </div>
              {/* 실시간 웨이브폼 (애니메이션) */}
              <div className="flex items-end gap-1 md:gap-1.5 h-16 mt-4">
                {WAVE.map((h, i) => (
                  <div
                    key={i}
                    className="bi-wave-bar flex-1 rounded-full bg-gradient-to-t from-[var(--primary)] to-[var(--accent)] opacity-80 group-hover:opacity-100"
                    style={{ height: `${h}%`, animationDelay: `${(i * 0.06).toFixed(2)}s` }}
                  />
                ))}
              </div>
            </div>

            {/* 240시간 — 강조 스탯 (초록) */}
            <div className="col-span-2 md:col-span-1 row-span-2 rounded-3xl bg-[var(--primary)] text-white p-6 flex flex-col justify-center">
              <div className="text-5xl md:text-6xl font-extrabold leading-none">
                <CountUp end={240} /><span className="text-2xl font-bold">시간</span>
              </div>
              <div className="mt-3 text-white/85 leading-snug">1년에 돌려받는<br />당신의 저녁 시간</div>
              <div className="mt-4 text-xs text-white/60">하루 1시간 × 연 240일 기준</div>
            </div>

            {/* KODDI 스탯 */}
            <div className="col-span-2 md:col-span-1 row-span-1 rounded-3xl border border-[var(--accent)]/35 bg-[var(--accent)]/8 p-6 flex flex-col justify-center">
              <div className="text-3xl font-extrabold text-[var(--accent)]">4.68<span className="text-base text-[var(--text-mute)]">/5</span></div>
              <div className="mt-1 text-sm text-[var(--text-soft)] leading-snug">KODDI 2021 현장 1순위 고민<br /><b>행정 부담</b> (바로일지가 덜어드려요)</div>
            </div>

            {/* 기능 타일 4종 */}
            <BentoFeature icon="📅" title="일정표 자동 생성" desc="반복 요일 → 한 달치 자동" />
            <BentoFeature icon="📝" title="회기 기록지" desc="미리 작성 + 엑셀 자동 매칭" />
            <BentoFeature icon="🔍" title="바우처 점검" desc="결제 간격 위반 자동 검출" />
            <BentoFeature icon="📄" title="한글파일 출력" desc="별지 양식 1클릭 다운로드" />

            {/* 후기 타일 (더미) */}
            <div className="col-span-2 row-span-1 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 flex flex-col justify-center">
              <div className="text-[var(--accent)] text-sm mb-1.5">★★★★★</div>
              <p className="text-[15px] font-medium leading-relaxed">&ldquo;퇴근이 한 시간 빨라졌어요. 회기 끝나면 기록이 거의 정리돼 있어 야근이 사라졌습니다.&rdquo;</p>
              <div className="mt-2 text-xs text-[var(--text-mute)]">박○○ · 언어재활사 5년차 <span className="opacity-60">(예시 후기)</span></div>
            </div>

            {/* 일괄 다운로드 */}
            <BentoFeature icon="📦" title="일괄 다운로드" desc="월·아동 선택 → ZIP 한 파일" />
          </Reveal>

          <p className="text-xs text-[var(--text-mute)] mt-8 text-center max-w-2xl mx-auto leading-relaxed">
            음성 분석은 「의료기기법」의 적용을 받지 않는 학습·연습·시각화 보조 도구이며, 의료 진단·치료를 제공·대체하지 않습니다.
          </p>
        </div>
      </section>

      {/* ───────── ④ Why Us (더미) ───────── */}
      <section className="px-6 py-20 bg-[var(--surface-2)]">
        <Reveal className="max-w-5xl mx-auto grid md:grid-cols-5 gap-10 items-center bi-reveal">
          <div className="md:col-span-2">
            <div className="aspect-square rounded-3xl bg-[var(--surface-3)] border border-[var(--border)] flex flex-col items-center justify-center text-[var(--text-mute)]">
              <span className="text-6xl">👤</span>
              <span className="text-xs mt-3">대표 사진 (교체 예정)</span>
            </div>
          </div>
          <div className="md:col-span-3">
            <p className="text-sm font-semibold text-[var(--accent)] mb-3">왜 만들었나</p>
            <h2 className="text-2xl md:text-4xl font-extrabold leading-tight tracking-[-0.02em] mb-5">
              치료는 사람이, 행정은 바로일지가.
            </h2>
            <p className="text-[var(--text-soft)] leading-relaxed mb-4">
              발달재활 현장을 곁에서 지켜보며, 선생님들이 정작 아이가 아니라 서류에 시간을 빼앗기는
              모습을 매일 봤습니다. KODDI 보고서가 1순위로 꼽은 그 페인을, 직접 풀어보기로 했습니다.
            </p>
            <p className="text-[var(--text-soft)] leading-relaxed">
              바로일지는 &ldquo;선생님의 저녁을 돌려드린다&rdquo;는 한 가지 목표로 만들어졌습니다.
            </p>
            <p className="text-xs text-[var(--text-mute)] mt-6">* 예시 문구 — 베타 후 실제 창업 스토리·사진으로 교체 예정</p>
          </div>
        </Reveal>
      </section>

      {/* ───────── ⑤ Pricing ───────── */}
      <section id="pricing" className="px-6 py-20 md:py-24">
        <div className="max-w-5xl mx-auto">
          <Reveal className="text-center mb-14 bi-reveal">
            <p className="text-sm font-semibold text-[var(--accent)] mb-3">가격</p>
            <h2 className="text-3xl md:text-5xl font-extrabold tracking-[-0.02em]">딱 필요한 만큼만</h2>
            <p className="mt-4 text-lg text-[var(--text-soft)]">1개월 무료 · 카드 등록 불요 · 1인 1계정</p>
          </Reveal>

          <Reveal className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch bi-stagger">
            {/* Solo */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-8 flex flex-col">
              <div className="flex items-center gap-3 mb-3">
                <span className="bg-[var(--accent)] text-white text-xs px-2 py-1 rounded font-semibold">Solo</span>
                <span className="text-xs text-[var(--text-mute)]">개인 치료사</span>
              </div>
              <div className="my-3">
                <div className="text-5xl font-extrabold">15,900<span className="text-xl font-normal text-[var(--text-mute)]">원/월</span></div>
                <p className="mt-2.5 inline-block bg-[var(--primary-soft)] text-[var(--primary)] font-bold text-base px-3.5 py-1.5 rounded-full">☕ 하루 530원 · 한 달 커피 4잔 값</p>
              </div>
              <ul className="space-y-2 my-6 text-sm">
                <li>✅ 기본 회기 관리 5종</li>
                <li>✅ 음성 시각화 4종 (음도강도·/s/·MPT·DAF)</li>
                <li>✅ 1개월 무료 (카드 등록 X)</li>
                <li>✅ 한글파일 무제한 출력</li>
              </ul>
              <Link href="/signup" className="mt-auto bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-center py-3 rounded-xl font-bold transition">
                1개월 무료 시작 →
              </Link>
            </div>

            {/* Pro */}
            <div className="bg-[var(--surface)] border-2 border-[var(--primary)] rounded-3xl p-8 flex flex-col relative shadow-lg">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-200 text-[var(--text)] text-xs font-bold px-3 py-1 rounded-full">
                BEST · 임상 도구 풀세트
              </div>
              <div className="flex items-center gap-3 mb-3">
                <span className="bg-[var(--primary)] text-white text-xs px-2 py-1 rounded font-semibold">Pro</span>
                <span className="text-xs text-[var(--text-mute)]">전문 임상가용</span>
              </div>
              <div className="my-3">
                <div className="text-5xl font-extrabold">29,800<span className="text-xl font-normal text-[var(--text-mute)]">원/월</span></div>
                <p className="mt-2.5 inline-block bg-[var(--primary-soft)] text-[var(--primary)] font-bold text-base px-3.5 py-1.5 rounded-full">☕ 하루 990원 · 한 달 커피 7잔 값</p>
              </div>
              <ul className="space-y-2 my-6 text-sm">
                <li>✅ Solo 전체 포함</li>
                <li>✅ 분석·연습 5종 (말속도·유창성·말속도조절·조음·화용)</li>
                <li>✅ 1개월 무료 (카드 등록 X)</li>
                <li>✅ 신규 기능 우선 체험</li>
              </ul>
              <Link href="/signup" className="mt-auto bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-center py-3 rounded-xl font-bold transition">
                1개월 무료 시작 →
              </Link>
            </div>
          </Reveal>

          <Reveal className="mt-8 bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-6 text-center bi-reveal">
            <p className="font-bold text-lg mb-2">🎁 베타 참여자 평생 락인 가격</p>
            <p className="text-sm text-[var(--text-soft)]">
              초기 100명 한정 · Solo <span className="font-semibold">15,900원 평생 동일</span> · 출시 후에도 가격 변동 없음
            </p>
          </Reveal>
        </div>
      </section>

      {/* ───────── ⑥ FAQ ───────── */}
      <section id="faq" className="px-6 py-20 bg-[var(--surface-2)]">
        <div className="max-w-3xl mx-auto">
          <Reveal className="text-center mb-14 bi-reveal">
            <p className="text-sm font-semibold text-[var(--accent)] mb-3">자주 묻는 질문</p>
            <h2 className="text-3xl md:text-5xl font-extrabold tracking-[-0.02em]">궁금한 점, 정리했어요</h2>
          </Reveal>
          <Reveal className="space-y-4 bi-stagger">
            <FaqItem q="보호자에게 따로 동의를 받아야 하나요?" a="아니요. 정부 사회서비스 전자바우처 가입 시 동의하신 「개인정보 수집·이용 및 제3자 제공 동의서」(서식 1-4호) 범위 안에서 운영됩니다." />
            <FaqItem q="1개월 무료 후 자동 결제되나요?" a="아니요. 카드 등록 없이 1개월 사용 가능합니다. 1개월 후 결제 안내가 오며, 본인이 직접 결제하셔야 사용 연장됩니다." />
            <FaqItem q="데이터는 어디 저장되나요?" a="모든 데이터는 국내(춘천 NCP) 서버에만 저장됩니다. 국외 이전 없습니다." />
            <FaqItem q="음성 분석 결과는 의료 기록인가요?" a="아니요. 본 도구는 의료기기가 아닌 학습·연습·시각화 보조 도구입니다. 의료 진단·치료를 제공·대체하지 않습니다." />
            <FaqItem q="한컴 오피스 없어도 되나요?" a=".hwpx 파일은 한컴 오피스 또는 무료 한컴 뷰어로 열 수 있습니다." />
            <FaqItem q="환불은 어떻게 되나요?" a="결제 후 7일 이내·미사용 시 전액 환불됩니다. (예시 안내 — 정식 환불 정책은 출시 시 확정)" />
          </Reveal>
        </div>
      </section>

      {/* ───────── ⑦ 마지막 CTA ───────── */}
      <section className="px-6 py-20 md:py-24 bg-[var(--primary)] text-white">
        <Reveal className="max-w-3xl mx-auto text-center bi-reveal">
          <h2 className="text-3xl md:text-5xl font-extrabold leading-tight tracking-[-0.02em]">
            오늘 저녁부터,<br className="sm:hidden" /> 야근 없이 퇴근하세요.
          </h2>
          <p className="mt-4 text-white/80 text-lg">1개월 무료 · 카드 등록 없이 바로 시작</p>
          <Link href="/signup" className="inline-block mt-8 bg-white text-[var(--primary)] hover:bg-yellow-100 text-lg font-bold px-10 py-4 rounded-2xl shadow-lg transition hover:-translate-y-0.5">
            1개월 무료 시작 →
          </Link>
        </Reveal>
      </section>

      {/* ───────── ⑧ Footer ───────── */}
      <footer className="px-6 py-12 bg-[var(--surface-3)] border-t border-[var(--border)]">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/landing/logo.png" alt="바로일지" className="h-8 w-auto mb-3" />
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

// ───────── 보조 ─────────

// 웨이브폼 막대 높이 (고정값)
const WAVE = [30, 55, 40, 70, 50, 85, 60, 45, 75, 35, 65, 50, 90, 55, 40, 70, 48, 80, 38, 60];

function TrustChip({ children }: { children: ReactNode }) {
  return (
    <span className="bg-[var(--surface)] border border-[var(--border)] rounded-full py-2 px-4">{children}</span>
  );
}

function BentoFeature({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="col-span-1 row-span-1 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 flex flex-col justify-center transition-shadow hover:shadow-md">
      <div className="text-2xl mb-2">{icon}</div>
      <h4 className="font-bold leading-tight">{title}</h4>
      <p className="text-xs text-[var(--text-soft)] mt-1 leading-snug">{desc}</p>
    </div>
  );
}

function DarkPainCard({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 transition-colors hover:bg-white/[0.07]">
      <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-2xl mb-4">{icon}</div>
      <h3 className="font-bold text-lg mb-2 text-white">{title}</h3>
      <p className="text-sm text-white/65 leading-relaxed">{children}</p>
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
