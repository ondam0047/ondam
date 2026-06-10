# 내일 할 일 (2026-06-01 이후)

베타 영상 8편 녹화 완료 시점 기준.

---

## ✅ 운영 배포 완료 (2026-06-02)

소급결제 + UI 개선(초기화 버튼·엑셀 드롭존·요일별 시간·시간대 입력) 전부 운영(baroilji.com) 반영 완료.
서버 `baroilji-prod`(NCP, /opt/baroilji)는 **TLBiq 브랜치**로 전환됨 (소급결제 커밋 포함된 상위 버전).

### ⚠️ 운영 배포 메모 — 다음에 꼭 지킬 것

운영은 **PostgreSQL**(`@prisma/adapter-pg`), 로컬은 SQLite. 함정 2개:

1. **`npm install` 하면 postinstall(`prisma generate`)이 SQLite 클라이언트로 되돌림** → 빌드가
   `Driver Adapter @prisma/adapter-pg is not compatible with provider sqlite` 로 실패.
   → `npm install` 했으면 **반드시 바로 뒤에 `npm run db:gen:postgres`** 실행.
2. 빌드가 중간 실패하면 `.next` 가 비어 앱이 `Could not find a production build` 로 **크래시 루프**(사이트 다운).
   → 빌드는 **라우트 표가 출력되고 에러 없이 끝나는 것**까지 확인 후 `pm2 restart`.

### 표준 배포 절차 (PostgreSQL 운영)

```bash
cd /opt/baroilji
git fetch origin
git checkout <브랜치>            # 예: claude/retroactive-payment-video-launch-TLBiq
git pull origin <브랜치>
npm install                      # 새 의존성 있을 때만. 했으면 ↓ 필수
npm run db:gen:postgres          # ← postgres 클라이언트 재생성 (안 하면 빌드 실패)
npm run build                    # 라우트 표 나오고 에러 없이 끝나는지 확인
pm2 restart baroilji
```
- 의존성 변경이 없으면 `npm install` 생략 → `db:gen:postgres` 도 불필요 (이번 2단계가 그랬음).
- 확인: `curl -I http://localhost:3000` 가 200/307, `pm2 list` 의 `↺`(restart) 가 안 오르면 정상.
- 운영 turbopack 빌드는 정상 동작(네이티브 바인딩 있음). 혹시 실패 시 `npx next build --webpack`.

### 배포된 변경 요약

- **초기화 버튼**: 일정표("처음부터 다시")·기록지("초기화")·승인내역 점검("다른 파일로 다시"). confirm 1회 + `baroilji_*_draft` 삭제 + state 초기화.
- **엑셀 가져오기 옛 UI 수정**: `/import` 의 밋밋한 `<input type=file>` → 기록지와 동일한 드롭존(드래그&드롭/클릭)으로 교체.
- **일정표 요일별 다른 시간 (A안)**: 반복 요일 선택 시 요일별 시간 드롭다운 노출. `slotByDow` 오버라이드, 비우면 기본 시간대 적용. DB 변경 없음.
- **센터 설정 시간대 입력 UI**: textarea 직접 타이핑 → 시작·종료 시각 피커 + 칩 추가/삭제(`SlotsEditor.tsx`). 저장 형식(콤마 문자열) 동일, 백엔드 무변경.

### 남은 후속 (선택)
- 일정표 요일별 시간 **D안**: 아동별 설정(`기본 시간대`+`기본 반복 요일`)을 "요일별 시간"으로 확장 → 매달 자동. `defaultDays` 직렬화 변경 또는 새 컬럼 + DB 마이그레이션 필요. (A안으로 당장은 충분)
- 센터 시간대 입력 **② 자동 생성기**(시작·길이·간격·개수) 는 추후.

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
