-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "therapistId" INTEGER,
    CONSTRAINT "User_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "token" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Record" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "childId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "org" TEXT NOT NULL,
    "childName" TEXT NOT NULL,
    "childBirth" TEXT,
    "opinion" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" INTEGER,
    CONSTRAINT "Record_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Record_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecordSession" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "recordId" INTEGER NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "date" TEXT,
    "startTime" TEXT,
    "endTime" TEXT,
    "voucher" TEXT,
    "extra" TEXT,
    "amount" TEXT,
    "useDay" TEXT,
    "payDay" TEXT,
    "apprNumber" TEXT,
    "result" TEXT,
    "resultExtra" TEXT,
    CONSTRAINT "RecordSession_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Schedule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "childId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "therapist" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "target" INTEGER NOT NULL,
    "mgmtNumber" TEXT,
    "pvOrg" TEXT NOT NULL,
    "pvTel" TEXT,
    "pvCharge" TEXT,
    "pvType" TEXT NOT NULL,
    "costUnit" TEXT NOT NULL,
    "costSelf" TEXT NOT NULL,
    "writeDate" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" INTEGER,
    CONSTRAINT "Schedule_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Schedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Schedule" ("childId", "costSelf", "costUnit", "createdAt", "id", "mgmtNumber", "month", "pvCharge", "pvOrg", "pvTel", "pvType", "serviceType", "target", "therapist", "updatedAt", "writeDate", "year") SELECT "childId", "costSelf", "costUnit", "createdAt", "id", "mgmtNumber", "month", "pvCharge", "pvOrg", "pvTel", "pvType", "serviceType", "target", "therapist", "updatedAt", "writeDate", "year" FROM "Schedule";
DROP TABLE "Schedule";
ALTER TABLE "new_Schedule" RENAME TO "Schedule";
CREATE UNIQUE INDEX "Schedule_childId_year_month_key" ON "Schedule"("childId", "year", "month");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_therapistId_key" ON "User"("therapistId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_token_key" ON "AuthSession"("token");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Record_childId_year_month_key" ON "Record"("childId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "RecordSession_recordId_ordinal_key" ON "RecordSession"("recordId", "ordinal");
