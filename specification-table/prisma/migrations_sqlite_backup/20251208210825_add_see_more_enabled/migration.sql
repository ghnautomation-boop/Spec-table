-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SpecificationTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "styling" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isAccordion" BOOLEAN NOT NULL DEFAULT false,
    "seeMoreEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SpecificationTemplate_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SpecificationTemplate" ("createdAt", "id", "isAccordion", "isActive", "name", "shopId", "styling", "updatedAt") SELECT "createdAt", "id", "isAccordion", "isActive", "name", "shopId", "styling", "updatedAt" FROM "SpecificationTemplate";
DROP TABLE "SpecificationTemplate";
ALTER TABLE "new_SpecificationTemplate" RENAME TO "SpecificationTemplate";
CREATE INDEX "SpecificationTemplate_shopId_idx" ON "SpecificationTemplate"("shopId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
