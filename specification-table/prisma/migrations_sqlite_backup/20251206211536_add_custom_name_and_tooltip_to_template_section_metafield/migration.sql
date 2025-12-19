-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TemplateSectionMetafield" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sectionId" TEXT NOT NULL,
    "metafieldDefinitionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "customName" TEXT,
    "tooltipEnabled" BOOLEAN NOT NULL DEFAULT false,
    "tooltipText" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TemplateSectionMetafield_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "TemplateSection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TemplateSectionMetafield_metafieldDefinitionId_fkey" FOREIGN KEY ("metafieldDefinitionId") REFERENCES "MetafieldDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TemplateSectionMetafield" ("createdAt", "id", "metafieldDefinitionId", "order", "sectionId") SELECT "createdAt", "id", "metafieldDefinitionId", "order", "sectionId" FROM "TemplateSectionMetafield";
DROP TABLE "TemplateSectionMetafield";
ALTER TABLE "new_TemplateSectionMetafield" RENAME TO "TemplateSectionMetafield";
CREATE INDEX "TemplateSectionMetafield_sectionId_idx" ON "TemplateSectionMetafield"("sectionId");
CREATE UNIQUE INDEX "TemplateSectionMetafield_sectionId_metafieldDefinitionId_key" ON "TemplateSectionMetafield"("sectionId", "metafieldDefinitionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
