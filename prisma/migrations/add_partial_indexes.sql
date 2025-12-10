-- Partial indexes pentru TemplateLookup
-- Aceste indexuri exclud rândurile cu NULL, făcând indexurile mai mici și mai rapide

-- Index pentru productId (exclude NULL)
CREATE INDEX IF NOT EXISTS "idx_lookup_product_partial" 
ON "TemplateLookup"("shopId", "productId", "priority", "templateId") 
WHERE "productId" IS NOT NULL;

-- Index pentru collectionId (exclude NULL)
CREATE INDEX IF NOT EXISTS "idx_lookup_collection_partial" 
ON "TemplateLookup"("shopId", "collectionId", "priority", "templateId") 
WHERE "collectionId" IS NOT NULL;

-- Index pentru isDefault (doar pentru DEFAULT assignments)
CREATE INDEX IF NOT EXISTS "idx_lookup_default_partial" 
ON "TemplateLookup"("shopId", "priority", "templateId") 
WHERE "isDefault" = true;

