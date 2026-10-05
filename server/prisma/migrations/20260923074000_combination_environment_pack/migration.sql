-- CreateEnum
CREATE TYPE "CombinationCategory" AS ENUM ('STANDARD', 'ENVIRONMENT_PACK');

-- AlterTable
ALTER TABLE "Combination" ADD COLUMN "category" "CombinationCategory" NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "Combination" ADD COLUMN "zone1MaterialId" TEXT;
ALTER TABLE "Combination" ADD COLUMN "zone2MaterialId" TEXT;
ALTER TABLE "Combination" ADD COLUMN "zone3MaterialId" TEXT;
ALTER TABLE "Combination" ADD COLUMN "zone4MaterialId" TEXT;
ALTER TABLE "Combination" ALTER COLUMN "mainMaterialId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Combination_zone1MaterialId_idx" ON "Combination"("zone1MaterialId");
CREATE INDEX "Combination_zone2MaterialId_idx" ON "Combination"("zone2MaterialId");
CREATE INDEX "Combination_zone3MaterialId_idx" ON "Combination"("zone3MaterialId");
CREATE INDEX "Combination_zone4MaterialId_idx" ON "Combination"("zone4MaterialId");

-- AddForeignKey
ALTER TABLE "Combination" ADD CONSTRAINT "Combination_zone1MaterialId_fkey" FOREIGN KEY ("zone1MaterialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Combination" ADD CONSTRAINT "Combination_zone2MaterialId_fkey" FOREIGN KEY ("zone2MaterialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Combination" ADD CONSTRAINT "Combination_zone3MaterialId_fkey" FOREIGN KEY ("zone3MaterialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Combination" ADD CONSTRAINT "Combination_zone4MaterialId_fkey" FOREIGN KEY ("zone4MaterialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
