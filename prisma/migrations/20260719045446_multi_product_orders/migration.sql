/*
  Warnings:

  - You are about to drop the column `channel` on the `Sale` table. All the data in the column will be lost.
  - You are about to drop the column `customerId` on the `Sale` table. All the data in the column will be lost.
  - You are about to drop the column `soldAt` on the `Sale` table. All the data in the column will be lost.
  - Added the required column `orderId` to the `Sale` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Sale" DROP CONSTRAINT "Sale_customerId_fkey";

-- DropIndex
DROP INDEX "Sale_companyId_productId_idx";

-- DropIndex
DROP INDEX "Sale_companyId_soldAt_idx";

-- DropIndex
DROP INDEX "Sale_customerId_idx";

-- AlterTable
ALTER TABLE "Sale" DROP COLUMN "channel",
DROP COLUMN "customerId",
DROP COLUMN "soldAt",
ADD COLUMN     "orderId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT,
    "soldAt" TIMESTAMP(3) NOT NULL,
    "channel" "SalesChannel",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Order_companyId_soldAt_idx" ON "Order"("companyId", "soldAt");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE INDEX "Sale_companyId_idx" ON "Sale"("companyId");

-- CreateIndex
CREATE INDEX "Sale_orderId_idx" ON "Sale"("orderId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
