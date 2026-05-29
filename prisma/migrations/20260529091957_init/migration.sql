-- CreateTable
CREATE TABLE "Center" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "approvalCode" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "serviceTypes" TEXT NOT NULL DEFAULT '언어재활,놀이치료,감각통합치료',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "token" TEXT NOT NULL,
    "centerId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "usedAt" DATETIME,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,
    CONSTRAINT "Invitation_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "centerId" INTEGER,
    "therapistId" INTEGER,
    CONSTRAINT "User_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
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
CREATE TABLE "Therapist" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "centerId" INTEGER,
    CONSTRAINT "Therapist_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

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

-- CreateTable
CREATE TABLE "Child" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "birthDate" TEXT,
    "mgmtNumber" TEXT,
    "memo" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "waiting" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "centerId" INTEGER,
    CONSTRAINT "Child_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChildService" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "childId" INTEGER NOT NULL,
    "therapistId" INTEGER,
    "serviceType" TEXT NOT NULL,
    "defaultSlot" TEXT,
    "defaultDays" TEXT,
    "defaultUnit" INTEGER NOT NULL DEFAULT 65000,
    "defaultTarget" INTEGER NOT NULL DEFAULT 5,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChildService_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChildService_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "childServiceId" INTEGER NOT NULL,
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
    CONSTRAINT "Schedule_childServiceId_fkey" FOREIGN KEY ("childServiceId") REFERENCES "ChildService" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Schedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScheduleSession" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "scheduleId" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "time" TEXT NOT NULL,
    "makeup" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ScheduleSession_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Record" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "childServiceId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "org" TEXT NOT NULL,
    "childName" TEXT NOT NULL,
    "childBirth" TEXT,
    "opinion" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" INTEGER,
    CONSTRAINT "Record_childServiceId_fkey" FOREIGN KEY ("childServiceId") REFERENCES "ChildService" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
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

-- CreateIndex
CREATE UNIQUE INDEX "Center_approvalCode_key" ON "Center"("approvalCode");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");

-- CreateIndex
CREATE INDEX "Invitation_centerId_idx" ON "Invitation"("centerId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_therapistId_key" ON "User"("therapistId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_token_key" ON "AuthSession"("token");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- CreateIndex
CREATE INDEX "TherapistBlock_therapistId_idx" ON "TherapistBlock"("therapistId");

-- CreateIndex
CREATE INDEX "ChildService_childId_idx" ON "ChildService"("childId");

-- CreateIndex
CREATE INDEX "ChildService_therapistId_idx" ON "ChildService"("therapistId");

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_childServiceId_year_month_key" ON "Schedule"("childServiceId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleSession_scheduleId_day_key" ON "ScheduleSession"("scheduleId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "Record_childServiceId_year_month_key" ON "Record"("childServiceId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "RecordSession_recordId_ordinal_key" ON "RecordSession"("recordId", "ordinal");
