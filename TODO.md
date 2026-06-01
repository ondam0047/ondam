# 내일 할 일 (2026-06-01 이후)

베타 영상 8편 녹화 완료 시점 기준.

---

## 운영 배포 대기 (가장 먼저)

소급결제 UI 개선 (`feat/record` 기반, 운영 브랜치 `claude/clever-ritchie-GiZtt` 에 푸시 완료)을 운영(baroilji.com)에 반영.

관련 커밋:
- `2bcde3e` feat(record): 소급결제 알림 클릭 → 해당 회기로 자동 이동
- `e148f81` feat(record): 소급결제 알림 — 아동별로 분리 표시 + 데모 소급 3건으로

배포 절차:
```bash
cd /opt/baroilji
git pull origin claude/clever-ritchie-GiZtt
npm install
npm run build
pm2 restart baroilji
```

---

## 신규 기능 — 초기화 버튼

상태 누적되는 페이지에 "처음부터 다시" 버튼 추가. localStorage 의 baroilji_*_draft 키 삭제 + React state 초기화.

### 우선순위
1. **일정표** (`/schedule`)
   - 위치: 미리보기 카드 헤더 우측 (생성됐을 때만 노출) 또는 상단 작은 버튼
   - 동작: `baroilji_schedule_draft` 삭제 + 모든 form state 초기화
   - 라벨: "처음부터 다시"

2. **기록지** (`/record`)
   - 위치: 엑셀 드롭존 위 작은 버튼 (grouped 있을 때만)
   - 동작: `baroilji_record_draft` 삭제 + grouped/curChild/retroChildren 비움
   - 라벨: "초기화"

3. **승인내역 점검** (`/approval-check`)
   - 위치: 결과 카드 헤더 우측
   - 동작: rows state 비움 (드롭존 다시 보임)
   - 라벨: "다른 파일로 다시"

### 구현 메모
- 클릭 시 confirm() 한 번 ("정말 초기화할까요?")
- ScheduleClient, RecordClient, ApprovalCheckClient 각각 reset 함수 만들고 버튼 바인딩
- localStorage 정리 패턴은 SessionGuard.tsx 참고

---

## 버그 수정 — 내 아동 엑셀 가져오기 옛 UI 노출

증상: `/children` 에서 [엑셀로 가져오기] 클릭 시 "옛날에 있던 엑셀 파일 넣는 창" 이 갑자기 뜸.

추가 정보 필요:
- 정확한 위치 (어느 버튼·메뉴인지)
- "옛 UI" 가 OS 파일 선택 창인지, 앱 안의 옛 모달인지
- 스크린샷 있으면 가장 빠름

조사 시작점: `app/(app)/import/`, `app/(app)/children/` 안의 import 관련 코드.

---

## 신규 기능 — 일정표 요일별 다른 시간

요청: 요일마다 회기 시간이 다를 수 있음 (예: 화 13:30~14:20, 목 16:00~16:50).

현황 파악:
- 저장 구조(`SessionMap = Record<day, {time, makeup}>`)는 이미 날짜별 다른 시간 지원. HWPX 출력·불러오기(`importPattern`)도 요일별 시간 유지됨.
- 막힌 곳은 생성 입력 한 곳뿐: `generate()` 가 `defaultSlot`(시간 1개)를 모든 요일에 동일 적용 (`ScheduleClient.tsx` 463줄).

방안:
- **A안 (일정표 폼)**: 반복 요일 버튼 켜면 옆에 요일별 시간 드롭다운. `pattern: number[]` → `slotByDow: Record<요일,시간>`. 기본 시간대는 요일 켤 때 자동 채움. DB 변경 없음, 매달 다시 입력.
- **D안 (아동별 설정)**: `/children` ChildForm 의 `기본 시간대`(1개)+`기본 반복 요일`을 "요일별 시간"으로 확장 → 아동 고르면 매달 자동. `defaultDays` 직렬화 형식 변경 또는 새 컬럼 → DB 마이그레이션 필요.
- 이상적: D안으로 저장 → 일정표 자동 불러옴 + A안 피커로 일회성 예외 수정.
- 선택지(시간대 후보)는 항상 센터 설정 `slots` 에서 옴.

---

## 개선 — 센터 설정 시간대 입력 UI

현황: `/center` 에서 textarea 에 `13:30~14:20, 16:00~16:50` 직접 타이핑 (콤마/줄바꿈 구분). 저장은 `center.slots` 콤마 문자열, `parseSlots` 로 파싱.

핵심: 저장 형식 그대로면 입력 UI만 바꿔도 됨 (백엔드·DB 변경 0).

방안:
- **① 시간 피커 + 칩** (추천): `시작[09:00] 종료[09:50] [추가]` → 칩으로 쌓고 X 삭제, 숨은 input 에 콤마로 합쳐 제출. 형식 오류 원천 차단.
- **② 자동 생성기**: `시작·회기길이·간격·개수` → 시간대 목록 자동 생성 후 칩 편집.
- **③ 최소 변경**: textarea 유지 + 실시간 칩 미리보기/검증.

---

## 정리 — 안 쓰는 코드 청소

지우기 전 스캔 → 후보 목록 확인 → 삭제 순서 (AGENTS.md: 수정된 Next.js 라 신중히).

검사 항목:
- import 안 되는 파일 / 안 쓰는 export (knip · ts-prune)
- 안 쓰는 npm 의존성 (depcheck)
- 죽은 API 라우트·컴포넌트
- 보류된 `feat/jitu` 흔적

---

## 베타 운영 진행 중

- 베타 사용자에게 영상 8편 + 한국장애인개발원 2021 보고서 인용 공유 예정
- 베타 종료 1주 전 사용자 설문 (서류 시간 단축 비율 등) — 정식 출시 마케팅 자료용
- 운영 환경변수 `BETA_ACCESS_CODE` 확인

---

## 영상 후속 작업

- CapCut 으로 8편 편집 (자막·BGM·TypeCast 더빙)
- 썸네일 8개 제작 (Bing 이미지 만들기 + Canva)
- 인스타·유튜브 쇼츠 업로드
- 풀영상 2:30 합본 제작 (영상 #7 도입부 활용)

TypeCast 더빙 텍스트·자막·게시글 본문은 이전 채팅 참조.
