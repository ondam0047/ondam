-- CreateTable ToolChild
CREATE TABLE "ToolChild" (
  "id"        INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
  "ownerId"   INTEGER  NOT NULL,
  "name"      TEXT     NOT NULL,
  "memo"      TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ToolChild_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ToolChild_ownerId_idx" ON "ToolChild"("ownerId");

-- ToolSession: make childId nullable, add toolChildId
-- SQLite cannot ALTER COLUMN — recreate the table
PRAGMA foreign_keys=OFF;

CREATE TABLE "ToolSession_new" (
  "id"          INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
  "childId"     INTEGER,
  "toolChildId" INTEGER,
  "centerId"    INTEGER,
  "therapistId" INTEGER,
  "module"      TEXT     NOT NULL,
  "metrics"     TEXT     NOT NULL,
  "note"        TEXT,
  "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ToolSession_childId_fkey"    FOREIGN KEY ("childId")    REFERENCES "Child"    ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ToolSession_toolChildId_fkey" FOREIGN KEY ("toolChildId") REFERENCES "ToolChild" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "ToolSession_new"
  ("id","childId","centerId","therapistId","module","metrics","note","createdAt")
  SELECT "id","childId","centerId","therapistId","module","metrics","note","createdAt"
  FROM "ToolSession";

DROP TABLE "ToolSession";
ALTER TABLE "ToolSession_new" RENAME TO "ToolSession";

CREATE INDEX "ToolSession_childId_module_idx"    ON "ToolSession"("childId", "module");
CREATE INDEX "ToolSession_toolChildId_module_idx" ON "ToolSession"("toolChildId", "module");
CREATE INDEX "ToolSession_centerId_idx"          ON "ToolSession"("centerId");

PRAGMA foreign_keys=ON;

-- SupportRecord: add toolChildId column
ALTER TABLE "SupportRecord" ADD COLUMN "toolChildId" INTEGER
  REFERENCES "ToolChild"("id") ON DELETE SET NULL ON UPDATE CASCADE;
