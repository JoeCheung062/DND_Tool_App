-- Dropping a material clears the combination slots that pointed at it.
ALTER TABLE "Combination" DROP CONSTRAINT "Combination_mainMaterialId_fkey";
ALTER TABLE "Combination" DROP CONSTRAINT "Combination_zone1MaterialId_fkey";
ALTER TABLE "Combination" DROP CONSTRAINT "Combination_zone2MaterialId_fkey";
ALTER TABLE "Combination" DROP CONSTRAINT "Combination_zone3MaterialId_fkey";
ALTER TABLE "Combination" DROP CONSTRAINT "Combination_zone4MaterialId_fkey";

ALTER TABLE "Combination" ADD CONSTRAINT "Combination_mainMaterialId_fkey" FOREIGN KEY ("mainMaterialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Combination" ADD CONSTRAINT "Combination_zone1MaterialId_fkey" FOREIGN KEY ("zone1MaterialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Combination" ADD CONSTRAINT "Combination_zone2MaterialId_fkey" FOREIGN KEY ("zone2MaterialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Combination" ADD CONSTRAINT "Combination_zone3MaterialId_fkey" FOREIGN KEY ("zone3MaterialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Combination" ADD CONSTRAINT "Combination_zone4MaterialId_fkey" FOREIGN KEY ("zone4MaterialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;
