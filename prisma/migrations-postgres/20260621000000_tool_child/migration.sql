-- CreateTable ToolChild
CREATE TABLE "ToolChild" (
  "id"        SERIAL       NOT NULL,
  "ownerId"   INTEGER      NOT NULL,
  "name"      TEXT         NOT NULL,
  "memo"      TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ToolChild_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ToolChild_ownerId_idx" ON "ToolChild"("ownerId");

ALTER TABLE "ToolChild"
  ADD CONSTRAINT "ToolChild_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ToolSession: make childId nullable
ALTER TABLE "ToolSession" ALTER COLUMN "childId" DROP NOT NULL;

-- ToolSession: add toolChildId column + FK
ALTER TABLE "ToolSession" ADD COLUMN "toolChildId" INTEGER;

ALTER TABLE "ToolSession"
  ADD CONSTRAINT "ToolSession_toolChildId_fkey"
  FOREIGN KEY ("toolChildId") REFERENCES "ToolChild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ToolSession_toolChildId_module_idx" ON "ToolSession"("toolChildId", "module");

-- SupportRecord: add toolChildId column + FK
ALTER TABLE "SupportRecord" ADD COLUMN "toolChildId" INTEGER;

ALTER TABLE "SupportRecord"
  ADD CONSTRAINT "SupportRecord_toolChildId_fkey"
  FOREIGN KEY ("toolChildId") REFERENCES "ToolChild"("id") ON DELETE SET NULL ON UPDATE CASCADE;
