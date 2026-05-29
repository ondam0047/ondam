-- CreateTable
CREATE TABLE "TherapistBlock" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "therapistId" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TherapistBlock_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TherapistBlock_therapistId_idx" ON "TherapistBlock"("therapistId");
