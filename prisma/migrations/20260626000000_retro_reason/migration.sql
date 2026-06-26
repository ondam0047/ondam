-- AddColumn RecordSession.retroReason (소급결제 사유)
ALTER TABLE "RecordSession" ADD COLUMN "retroReason" TEXT;
