-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FLAT');

-- AlterTable (order-level discount)
ALTER TABLE "Order" ADD COLUMN     "discountType" "DiscountType",
ADD COLUMN     "discountValue" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable (line-item discount)
ALTER TABLE "Sale" ADD COLUMN     "discountType" "DiscountType",
ADD COLUMN     "discountValue" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable (standing customer discount)
ALTER TABLE "Customer" ADD COLUMN     "defaultDiscountPct" DOUBLE PRECISION;
