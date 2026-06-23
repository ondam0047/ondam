-- CreateTable FormMapping (양식 매핑 학습 캐시)
CREATE TABLE "FormMapping" (
  "id"          INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
  "fingerprint" TEXT     NOT NULL,
  "spec"        TEXT     NOT NULL,
  "label"       TEXT,
  "uses"        INTEGER  NOT NULL DEFAULT 0,
  "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   DATETIME NOT NULL
);

CREATE UNIQUE INDEX "FormMapping_fingerprint_key" ON "FormMapping"("fingerprint");
