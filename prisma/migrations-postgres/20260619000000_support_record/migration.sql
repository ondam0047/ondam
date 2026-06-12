-- CreateTable
CREATE TABLE "SupportRecord" (
    "id" SERIAL NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "program" TEXT NOT NULL,
    "student" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportRecord_ownerUserId_program_idx" ON "SupportRecord"("ownerUserId", "program");

-- AddForeignKey
ALTER TABLE "SupportRecord" ADD CONSTRAINT "SupportRecord_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
