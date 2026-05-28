-- CreateTable
CREATE TABLE "Schedule" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Schedule_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_childId_year_month_key" ON "Schedule"("childId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleSession_scheduleId_day_key" ON "ScheduleSession"("scheduleId", "day");
