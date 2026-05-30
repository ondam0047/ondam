-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Center" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "approvalCode" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "serviceTypes" TEXT NOT NULL DEFAULT '언어재활,놀이치료,감각통합치료',
    "slots" TEXT NOT NULL DEFAULT '09:00~09:50,09:50~10:40,10:40~11:30,11:30~12:20,13:30~14:20,14:20~15:10,15:10~16:00,16:00~16:50,16:50~17:40,17:40~18:30,18:30~19:20',
    "defaultUnit" INTEGER NOT NULL DEFAULT 60000,
    "manualMode" BOOLEAN NOT NULL DEFAULT false,
    "printUseDay" BOOLEAN NOT NULL DEFAULT true,
    "printPayDay" BOOLEAN NOT NULL DEFAULT true,
    "printApprNo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Center" ("address", "approvalCode", "createdAt", "defaultUnit", "id", "name", "phone", "serviceTypes", "slots", "updatedAt") SELECT "address", "approvalCode", "createdAt", "defaultUnit", "id", "name", "phone", "serviceTypes", "slots", "updatedAt" FROM "Center";
DROP TABLE "Center";
ALTER TABLE "new_Center" RENAME TO "Center";
CREATE UNIQUE INDEX "Center_approvalCode_key" ON "Center"("approvalCode");
CREATE TABLE "new_ChildService" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "childId" INTEGER NOT NULL,
    "therapistId" INTEGER,
    "serviceType" TEXT NOT NULL,
    "programType" TEXT NOT NULL DEFAULT 'DEVREHAB',
    "programAlias" TEXT,
    "defaultSlot" TEXT,
    "defaultDays" TEXT,
    "defaultUnit" INTEGER NOT NULL DEFAULT 65000,
    "defaultTarget" INTEGER NOT NULL DEFAULT 5,
    "monthlyCopay" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChildService_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChildService_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ChildService" ("active", "childId", "createdAt", "defaultDays", "defaultSlot", "defaultTarget", "defaultUnit", "id", "monthlyCopay", "serviceType", "therapistId", "updatedAt") SELECT "active", "childId", "createdAt", "defaultDays", "defaultSlot", "defaultTarget", "defaultUnit", "id", "monthlyCopay", "serviceType", "therapistId", "updatedAt" FROM "ChildService";
DROP TABLE "ChildService";
ALTER TABLE "new_ChildService" RENAME TO "ChildService";
CREATE INDEX "ChildService_childId_idx" ON "ChildService"("childId");
CREATE INDEX "ChildService_therapistId_idx" ON "ChildService"("therapistId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
