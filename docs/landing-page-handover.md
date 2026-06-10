# 🎬 바로일지 랜딩페이지 작업 인수인계

> **수신**: 대림대 연구실 cmd Claude Code 세션
> **발신**: 웹 Claude Code 세션 (전략·설계 담당)
> **작성일**: 2026-06-06
> **목적**: 랜딩페이지 작업 컨텍스트 + 현재까지 진행 상황 + 이어받을 방법

---

## 📍 현재 상태

### ✅ 이미 만들어진 것

| 항목 | 위치 | 비고 |
|---|---|---|
| 랜딩페이지 초안 (단일 파일) | `app/landing/page.tsx` | 8개 섹션 전부 들어간 1차 버전 |
| middleware.ts 수정 | `middleware.ts` | `/landing` 공개 경로 추가됨 |
| TODO 문서 | `marketing/landing-page-todo.md` | 작업 가이드 (Day 0~7) |

### 🌐 로컬에서 확인 방법

```bash
cd ~/ondam  # 또는 클론한 위치
git pull origin claude/clever-ritchie-GiZtt
npm install
npm run dev
# 브라우저 → http://localhost:3000/landing
```

→ 로그인 없이 바로 보임. 운영 배포 영향 X (그냥 `/landing` 라우트일 뿐).

---

## 🎨 디자인 결정 사항

### 사용한 디자인 토큰 (기존 `globals.css` 그대로 활용)

```css
--bg: #FAF6EE          /* 베이지 배경 */
--surface: #FFFFFF     /* 카드 */
--surface-2: #F5EDE0   /* 페인 섹션 등 진한 배경 */
--surface-3: #ECE3D2   /* 푸터 */
--border: #E4DAC4
--text: #1F2317        /* 진한 글씨 */
--text-soft: #5A5E4E
--text-mute: #8C8D7B
--primary: #5A6E3D     /* 짙은 녹색 (CTA·강조) */
--primary-hover: #4A5C30
--accent: #B79268      /* 브라운 (보조) */
--danger: #B8453A      /* 빨강 (페인) */
```

추가 강조:
- 노란 하이라이트: Tailwind `bg-yellow-200`
- 베타 락인 카드: `bg-yellow-50 border-yellow-200`

### 폰트
Pretendard (이미 `app/layout.tsx`에 로드됨)

---

## 📐 페이지 구조 (8섹션 + 상단바·푸터)

```
1. 상단바 (sticky) — 로고·메뉴·CTA
2. ① Hero — 메인 카피 + CTA + 신뢰 카드 3개
3. ② Pain Section — 손실 회피 카피 + 페인 카드 3개
4. ③ KODDI Quote — 4.68/5점 인용 박스
5. ④ Features — 기본 5종 + Solo 4종 + Pro 5종
6. ⑤ Pricing — Solo 15,900 / Pro 29,800 + 베타 락인 안내
7. ⑥ FAQ — 5개 질문 (열고 닫기)
8. ⑦ Footer — 사업자 정보 + 약관 링크
```

---

## ✨ 핵심 카피·메시지

### Hero
```
회기 끝나고 매일 1시간씩 더 일하셨죠.
바로일지가 그 시간 돌려드립니다.
```

### Pain
```
매일 1시간, 한 달 20시간, 1년 240시간을 잃고 계세요.
```

### KODDI
```
발달재활 기관 100곳이 꼽은 개선 요구 1순위
4.68 / 5점 · 행정처리 간소화
"수기 작성 시스템을 전산화 해주세요."
```

### Pricing
```
Solo 15,900원 (하루 530원 · 커피 4잔 가격)
Pro 29,800원 (하루 990원)
1개월 무료 · 카드 등록 X
🎁 베타 참여자 평생 락인 가격
```

---

## 🛠 cmd Claude가 이어받을 작업

### Phase 1 — 1차 검토·조정 (1~2시간)

1. **로컬에서 페이지 띄우고 직접 확인**
   ```bash
   npm run dev
   open http://localhost:3000/landing
   ```

2. **사용자(교수님)와 다음 결정**:
   - 카피·톤 OK인가?
   - 색감 OK인가? (베이지 vs 다른 톤)
   - 섹션 순서 OK인가?
   - 추가/삭제할 섹션 있나?

3. **즉시 수정 가능한 것들**:
   - 카피 문구
   - 색상 (`var(--primary)` 등 변수 변경)
   - 섹션 순서 (단일 파일이라 위·아래로 이동)

### Phase 2 — 컴포넌트 분리 (선택)

현재 단일 파일에 모든 섹션이 들어있어요. 유지보수가 어려워지면 분리:

```
app/landing/
├── page.tsx
└── _components/
    ├── Hero.tsx
    ├── Pain.tsx
    ├── KoddiQuote.tsx
    ├── Features.tsx
    ├── Pricing.tsx
    ├── Faq.tsx
    └── Footer.tsx
```

→ 베타·정식 출시 전까지는 단일 파일도 충분.

### Phase 3 — 추가 작업 (출시 전)

- [ ] 실제 스크린샷 추가 (현재는 카드만)
- [ ] 데모 GIF 추가 (Hero 우측, 30초)
- [ ] 베타 사용자 후기 섹션 (인터뷰 후)
- [ ] Why Us 섹션 (본인 사진 + 창업 스토리)
- [ ] OG 이미지 (Canva 1200×630)
- [ ] sitemap.ts / robots.txt
- [ ] Hotjar 무료 설치

→ 상세 가이드: `marketing/landing-page-todo.md` 참고

---

## 🔗 운영 페이지로 옮기는 방법 (출시 시점)

지금은 `/landing` 별도 경로에 있고, baroilji.com 메인은 `/dashboard`로 자동 리다이렉트되는 구조.

출시 시점에 다음 결정 필요:

### 옵션 A — `/landing` → `/`로 옮기기 (강추)

```
1. app/(app)/page.tsx 의 redirect 로직을:
   - 로그인 안 한 사용자 → /landing 보여줌
   - 로그인 한 사용자 → /dashboard
   
2. 또는 app/landing/page.tsx 내용을 app/page.tsx로 이동
   + middleware에서 / 도 PUBLIC_PATHS에 추가
```

### 옵션 B — 그대로 두기

```
baroilji.com → 로그인 (또는 대시보드)
baroilji.com/landing → 마케팅 페이지 (별도 도메인처럼)
```

→ **옵션 A 추천** (SEO·UX 모두 우위).

---

## 📋 현재 작업 중인 다른 사항 (참고)

웹 Claude 세션이 동시에 진행 중인 사항:
- 사업자등록 재신청 (집 주소로)
- 뉴로이어 변호사 자문 (165만원, 계약 대기 중)
- K-Startup 심화 상담 (담당자 보완 요청 처리 중)
- 베타 10명 운영 중

cmd Claude는 이런 사업 결정에 관여하지 않고, **랜딩페이지 코드 작업에만 집중**하면 됩니다.

---

## 📚 cmd Claude가 처음 봐야 할 파일

```
1. docs/voicelab-baroilji-handover.md  
   → VoiceLab과의 관계, 9개 모듈 통합 가이드

2. marketing/landing-page-todo.md  
   → 랜딩페이지 작업 TODO (Day 0~7)

3. app/landing/page.tsx  
   → 현재 만든 1차 버전

4. app/globals.css  
   → 디자인 토큰 (이미 정의됨)

5. middleware.ts  
   → /landing 공개 경로 추가됨

6. LAUNCH.md  
   → 출시 전체 체크리스트
```

---

## 🚀 cmd Claude에게 처음 보낼 메시지 예시

```
나는 대림대 교수고, 바로일지 SaaS 만들고 있어.
랜딩페이지를 만들고 있고, 1차 초안이 app/landing/page.tsx 에 있어.

먼저 다음 문서들 읽고 컨텍스트 잡아줘:
1. docs/landing-page-handover.md (이 문서)
2. marketing/landing-page-todo.md
3. app/landing/page.tsx (현재 초안)

읽고 나서:
- 로컬에서 npm run dev로 띄워서 페이지 확인
- 어떤 부분을 먼저 다듬을지 제안해줘
```

---

## ⚠️ cmd Claude 주의사항

1. **운영 배포 금지** — 사용자가 본인만 볼 수 있도록 로컬에서만 작업
2. **`claude/clever-ritchie-GiZtt` 브랜치에 푸시 OK** — 양쪽 세션이 같은 브랜치 공유 중
3. **사업 결정 사항 변경 X** — 가격·법무·VoiceLab 통합 등은 사용자 + 웹 Claude 결정 사항
4. **9개 모듈 표현 정비 매핑 준수** — `docs/voicelab-baroilji-handover.md` 참고

---

## 💬 양쪽 세션 동기화 방법

```
[웹 Claude] (전략·법무·비즈니스)
   ↓ 사업 결정 → 문서 업데이트
[GitHub repo: ondam0047/ondam, branch claude/clever-ritchie-GiZtt]
   ↓ git pull
[cmd Claude] (랜딩페이지·코드 작업)
   ↓ 코드 변경 → git push
[GitHub] → 웹 Claude도 확인
```

---

> 📌 이 문서로 cmd Claude 세션이 컨텍스트 잡고 바로 작업 가능.
> 막히는 부분 있으면 사용자가 양쪽 세션 다 활용해서 결정.
