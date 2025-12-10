-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopifyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT,
    "shopId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopifyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT,
    "shopId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Collection_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MetafieldDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "namespace" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT,
    "type" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MetafieldDefinition_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SpecificationTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "styling" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isAccordion" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SpecificationTemplate_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TemplateSection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "heading" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TemplateSection_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SpecificationTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TemplateSectionMetafield" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sectionId" TEXT NOT NULL,
    "metafieldDefinitionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TemplateSectionMetafield_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "TemplateSection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TemplateSectionMetafield_metafieldDefinitionId_fkey" FOREIGN KEY ("metafieldDefinitionId") REFERENCES "MetafieldDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TemplateAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "assignmentType" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TemplateAssignment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SpecificationTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TemplateAssignment_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TemplateAssignmentTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assignmentId" TEXT NOT NULL,
    "targetShopifyId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "isExcluded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TemplateAssignmentTarget_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "TemplateAssignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shopDomain_key" ON "Shop"("shopDomain");

-- CreateIndex
CREATE INDEX "Product_shopId_idx" ON "Product"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_shopifyId_shopId_key" ON "Product"("shopifyId", "shopId");

-- CreateIndex
CREATE INDEX "Collection_shopId_idx" ON "Collection"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_shopifyId_shopId_key" ON "Collection"("shopifyId", "shopId");

-- CreateIndex
CREATE INDEX "MetafieldDefinition_shopId_idx" ON "MetafieldDefinition"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "MetafieldDefinition_namespace_key_ownerType_shopId_key" ON "MetafieldDefinition"("namespace", "key", "ownerType", "shopId");

-- CreateIndex
CREATE INDEX "SpecificationTemplate_shopId_idx" ON "SpecificationTemplate"("shopId");

-- CreateIndex
CREATE INDEX "TemplateSection_templateId_idx" ON "TemplateSection"("templateId");

-- CreateIndex
CREATE INDEX "TemplateSectionMetafield_sectionId_idx" ON "TemplateSectionMetafield"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateSectionMetafield_sectionId_metafieldDefinitionId_key" ON "TemplateSectionMetafield"("sectionId", "metafieldDefinitionId");

-- CreateIndex
CREATE INDEX "TemplateAssignment_shopId_idx" ON "TemplateAssignment"("shopId");

-- CreateIndex
CREATE INDEX "TemplateAssignment_templateId_idx" ON "TemplateAssignment"("templateId");

-- CreateIndex
CREATE INDEX "TemplateAssignmentTarget_assignmentId_idx" ON "TemplateAssignmentTarget"("assignmentId");

-- CreateIndex
CREATE INDEX "TemplateAssignmentTarget_targetShopifyId_idx" ON "TemplateAssignmentTarget"("targetShopifyId");
