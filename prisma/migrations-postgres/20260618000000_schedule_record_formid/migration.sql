-- 저장 시 선택한 업로드 양식(RecordForm.id) 기억 — 일괄 출력에 사용
ALTER TABLE "Schedule" ADD COLUMN "formId" INTEGER;
ALTER TABLE "Record" ADD COLUMN "formId" INTEGER;
