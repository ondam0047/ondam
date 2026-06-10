-- CreateTable (sqlite 로컬 개발용)
CREATE TABLE "ToolSession" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "childId" INTEGER NOT NULL,
    "centerId" INTEGER,
    "therapistId" INTEGER,
    "module" TEXT NOT NULL,
    "metrics" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ToolSession_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ToolSession_childId_module_idx" ON "ToolSession"("childId", "module");

-- CreateIndex
CREATE INDEX "ToolSession_centerId_idx" ON "ToolSession"("centerId");
