-- CreateEnum
CREATE TYPE "ProductHistoryKind" AS ENUM ('CREATED', 'METADATA', 'COST_REPRICED', 'COST_ARCHIVED', 'COST_RESTORED');

-- CreateTable
CREATE TABLE "ProductHistory" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "kind" "ProductHistoryKind" NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "status" "ProductStatus" NOT NULL,
    "sellingPrice" DOUBLE PRECISION NOT NULL,
    "comps" JSONB,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "grossMarginPct" DOUBLE PRECISION NOT NULL,
    "changedById" TEXT,
    "triggerMasterCostId" TEXT,
    "costHistoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductHistory_productId_createdAt_idx" ON "ProductHistory"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductHistory_triggerMasterCostId_idx" ON "ProductHistory"("triggerMasterCostId");

-- AddForeignKey
ALTER TABLE "ProductHistory" ADD CONSTRAINT "ProductHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductHistory" ADD CONSTRAINT "ProductHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductHistory" ADD CONSTRAINT "ProductHistory_triggerMasterCostId_fkey" FOREIGN KEY ("triggerMasterCostId") REFERENCES "MasterCost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductHistory" ADD CONSTRAINT "ProductHistory_costHistoryId_fkey" FOREIGN KEY ("costHistoryId") REFERENCES "CostHistory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
