-- 치료사 종류 추가 (가입 시 입력)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "therapistType" TEXT;
