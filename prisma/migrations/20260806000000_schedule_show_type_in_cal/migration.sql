-- 달력 회기 칸에 서비스 종류(언어·놀이·감통) 표기 옵션 (치료사별 선택)
ALTER TABLE "Schedule" ADD COLUMN "showTypeInCal" BOOLEAN NOT NULL DEFAULT false;
