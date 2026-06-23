-- CreateTable FormMapping (양식 매핑 학습 캐시)
CREATE TABLE "FormMapping" (
  "id"          SERIAL       NOT NULL,
  "fingerprint" TEXT         NOT NULL,
  "spec"        TEXT         NOT NULL,
  "label"       TEXT,
  "uses"        INTEGER      NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FormMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FormMapping_fingerprint_key" ON "FormMapping"("fingerprint");
