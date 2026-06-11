-- CreateTable
CREATE TABLE "RecordForm" (
    "id" SERIAL NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "template" BYTEA NOT NULL,
    "spec" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordForm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecordForm_ownerUserId_kind_idx" ON "RecordForm"("ownerUserId", "kind");

-- AddForeignKey
ALTER TABLE "RecordForm" ADD CONSTRAINT "RecordForm_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
