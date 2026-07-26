-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "productCode" TEXT,
ADD COLUMN     "seriesName" TEXT;

-- AlterTable
ALTER TABLE "ProductHistory" ADD COLUMN     "productCode" TEXT,
ADD COLUMN     "seriesName" TEXT;
