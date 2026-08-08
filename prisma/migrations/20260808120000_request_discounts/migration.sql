-- AlterTable: invoice-wide discount carried by an order request (seeded from the
-- customer's standing agreement at submit, adjustable by staff at approval).
ALTER TABLE "OrderRequest" ADD COLUMN     "discountType" "DiscountType",
ADD COLUMN     "discountValue" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable: per-line discount staff applied at approval.
ALTER TABLE "OrderRequestItem" ADD COLUMN     "approvedDiscountType" "DiscountType",
ADD COLUMN     "approvedDiscountValue" DOUBLE PRECISION NOT NULL DEFAULT 0;
