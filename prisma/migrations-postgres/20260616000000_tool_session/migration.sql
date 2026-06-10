-- CreateTable
CREATE TABLE "ToolSession" (
    "id" SERIAL NOT NULL,
    "childId" INTEGER NOT NULL,
    "centerId" INTEGER,
    "therapistId" INTEGER,
    "module" TEXT NOT NULL,
    "metrics" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ToolSession_childId_module_idx" ON "ToolSession"("childId", "module");

-- CreateIndex
CREATE INDEX "ToolSession_centerId_idx" ON "ToolSession"("centerId");

-- AddForeignKey
ALTER TABLE "ToolSession" ADD CONSTRAINT "ToolSession_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;
