-- AlterTable
ALTER TABLE "Room" ADD COLUMN "campaignId" TEXT;

-- CreateIndex
CREATE INDEX "Room_campaignId_idx" ON "Room"("campaignId");

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
