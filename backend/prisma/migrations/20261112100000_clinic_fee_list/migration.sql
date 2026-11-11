-- CreateEnum
CREATE TYPE "ClinicBillType" AS ENUM ('FIRST_CONSULTATION', 'REVIEW', 'PROCEDURE');

-- CreateTable
CREATE TABLE "clinic_fees" (
    "branchId" TEXT NOT NULL,
    "billType" "ClinicBillType" NOT NULL,
    "amount" DOUBLE PRECISION,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "clinic_fees_pkey" PRIMARY KEY ("branchId","billType")
);

-- AddForeignKey
ALTER TABLE "clinic_fees" ADD CONSTRAINT "clinic_fees_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

