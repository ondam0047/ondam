-- AddColumn RecordSession.timeFixed (임상가가 시작·종료시간을 직접 고쳤는지 = 출처 표식)
-- true = 확정값(엑셀 결제시간·일정표 재시드에서 잠금) / false = 시드값(자동 교정 대상)
-- 파괴적 변경 없음: 기본값 있는 컬럼 추가 + 지난 달 이전 행 동결(UPDATE)
ALTER TABLE "RecordSession" ADD COLUMN "timeFixed" BOOLEAN NOT NULL DEFAULT false;

-- 지난 달 이전(2026-07 이전) 기록은 이미 제출된 서류다. 전부 false 로 두면 확인차 열어보기만 해도
-- 새 시드(결제시간·일정표)가 화면 시간을 덮고 자동저장이 DB 를 바꿔 제출본과 어긋난다 → 동결.
-- 이번 달(2026-07)은 아직 작성 중이므로 자동 교정 대상으로 남긴다.
UPDATE "RecordSession" SET "timeFixed" = true
WHERE "recordId" IN (
  SELECT "id" FROM "Record" WHERE "year" < 2026 OR ("year" = 2026 AND "month" < 7)
);
