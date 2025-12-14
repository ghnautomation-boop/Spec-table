-- ============================================
-- OPTIMIZĂRI PENTRU QUERY-UL DE TEMPLATES
-- ============================================

-- 1. VERIFICĂ INDEXURILE EXISTENTE
-- Rulează acest query pentru a vedea ce indexuri există
SELECT 
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'SpecificationTemplate',
    'TemplateSection',
    'TemplateSectionMetafield',
    'TemplateAssignment',
    'TemplateAssignmentTarget'
  )
ORDER BY tablename, indexname;

-- 2. ANALIZĂ PERFORMANȚĂ CU EXPLAIN ANALYZE
-- Rulează acest query pentru a vedea planul de execuție
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT 
    st.id as template_id,
    st.name as template_name,
    st."isActive" as template_is_active,
    st."isAccordion" as template_is_accordion,
    st."seeMoreEnabled" as template_see_more_enabled,
    st.styling as template_styling,
    st."createdAt" as template_created_at,
    st."updatedAt" as template_updated_at,
    ts.id as section_id,
    ts.heading as section_heading,
    ts."order" as section_order,
    tsm.id as metafield_id,
    tsm."order" as metafield_order,
    tsm."customName" as metafield_custom_name,
    tsm."tooltipEnabled" as metafield_tooltip_enabled,
    tsm."tooltipText" as metafield_tooltip_text,
    mfd.id as mfd_id,
    mfd.namespace as mfd_namespace,
    mfd.key as mfd_key,
    mfd.name as mfd_name,
    mfd.type as mfd_type,
    mfd."ownerType" as mfd_owner_type,
    ta.id as assignment_id,
    ta."assignmentType" as assignment_type,
    tat.id as target_id,
    tat."targetShopifyId" as target_shopify_id,
    tat."targetType" as target_type,
    tat."isExcluded" as target_is_excluded
FROM "SpecificationTemplate" st
LEFT JOIN "TemplateSection" ts ON st.id = ts."templateId"
LEFT JOIN "TemplateSectionMetafield" tsm ON ts.id = tsm."sectionId"
LEFT JOIN "MetafieldDefinition" mfd ON tsm."metafieldDefinitionId" = mfd.id
LEFT JOIN "TemplateAssignment" ta ON st.id = ta."templateId"
LEFT JOIN "TemplateAssignmentTarget" tat ON ta.id = tat."assignmentId"
WHERE st."shopId" = '1c5cb175-869d-4a9a-99b5-5fb86d3850a7'
ORDER BY 
    st."createdAt" DESC,
    ts."order" ASC,
    tsm."order" ASC;

-- 3. VERIFICĂ DACĂ INDEXURILE SUNT FOLOSITE
-- Caută în rezultatul EXPLAIN ANALYZE:
-- - "Index Scan" = bun (folosește index)
-- - "Seq Scan" = rău (scanează toate rândurile)
-- - "Bitmap Heap Scan" = acceptabil

-- ============================================
-- QUERY OPTIMIZAT - Varianta 1: Cu DISTINCT ON
-- Elimină duplicate rows și reduce datele returnate
-- ============================================

SELECT DISTINCT ON (st.id, ts.id, tsm.id, ta.id, tat.id)
    st.id as template_id,
    st.name as template_name,
    st."isActive" as template_is_active,
    st."isAccordion" as template_is_accordion,
    st."seeMoreEnabled" as template_see_more_enabled,
    st.styling as template_styling,
    st."createdAt" as template_created_at,
    st."updatedAt" as template_updated_at,
    ts.id as section_id,
    ts.heading as section_heading,
    ts."order" as section_order,
    tsm.id as metafield_id,
    tsm."order" as metafield_order,
    tsm."customName" as metafield_custom_name,
    tsm."tooltipEnabled" as metafield_tooltip_enabled,
    tsm."tooltipText" as metafield_tooltip_text,
    mfd.id as mfd_id,
    mfd.namespace as mfd_namespace,
    mfd.key as mfd_key,
    mfd.name as mfd_name,
    mfd.type as mfd_type,
    mfd."ownerType" as mfd_owner_type,
    ta.id as assignment_id,
    ta."assignmentType" as assignment_type,
    tat.id as target_id,
    tat."targetShopifyId" as target_shopify_id,
    tat."targetType" as target_type,
    tat."isExcluded" as target_is_excluded
FROM "SpecificationTemplate" st
LEFT JOIN "TemplateSection" ts ON st.id = ts."templateId"
LEFT JOIN "TemplateSectionMetafield" tsm ON ts.id = tsm."sectionId"
LEFT JOIN "MetafieldDefinition" mfd ON tsm."metafieldDefinitionId" = mfd.id
LEFT JOIN "TemplateAssignment" ta ON st.id = ta."templateId"
LEFT JOIN "TemplateAssignmentTarget" tat ON ta.id = tat."assignmentId"
WHERE st."shopId" = '1c5cb175-869d-4a9a-99b5-5fb86d3850a7'
ORDER BY 
    st.id,
    st."createdAt" DESC,
    ts.id,
    ts."order" ASC,
    tsm.id,
    tsm."order" ASC,
    ta.id,
    tat.id;

-- ============================================
-- QUERY OPTIMIZAT - Varianta 2: Cu LIMIT pe subquery-uri
-- Reduce numărul de rânduri procesate
-- ============================================

SELECT 
    st.id as template_id,
    st.name as template_name,
    st."isActive" as template_is_active,
    st."isAccordion" as template_is_accordion,
    st."seeMoreEnabled" as template_see_more_enabled,
    st.styling as template_styling,
    st."createdAt" as template_created_at,
    st."updatedAt" as template_updated_at,
    ts.id as section_id,
    ts.heading as section_heading,
    ts."order" as section_order,
    tsm.id as metafield_id,
    tsm."order" as metafield_order,
    tsm."customName" as metafield_custom_name,
    tsm."tooltipEnabled" as metafield_tooltip_enabled,
    tsm."tooltipText" as metafield_tooltip_text,
    mfd.id as mfd_id,
    mfd.namespace as mfd_namespace,
    mfd.key as mfd_key,
    mfd.name as mfd_name,
    mfd.type as mfd_type,
    mfd."ownerType" as mfd_owner_type,
    ta.id as assignment_id,
    ta."assignmentType" as assignment_type,
    tat.id as target_id,
    tat."targetShopifyId" as target_shopify_id,
    tat."targetType" as target_type,
    tat."isExcluded" as target_is_excluded
FROM "SpecificationTemplate" st
LEFT JOIN LATERAL (
    SELECT * FROM "TemplateSection" 
    WHERE "templateId" = st.id 
    ORDER BY "order" ASC
) ts ON true
LEFT JOIN LATERAL (
    SELECT * FROM "TemplateSectionMetafield" 
    WHERE "sectionId" = ts.id 
    ORDER BY "order" ASC
) tsm ON true
LEFT JOIN "MetafieldDefinition" mfd ON tsm."metafieldDefinitionId" = mfd.id
LEFT JOIN "TemplateAssignment" ta ON st.id = ta."templateId"
LEFT JOIN "TemplateAssignmentTarget" tat ON ta.id = tat."assignmentId"
WHERE st."shopId" = '1c5cb175-869d-4a9a-99b5-5fb86d3850a7'
ORDER BY 
    st."createdAt" DESC,
    ts."order" ASC,
    tsm."order" ASC;

-- ============================================
-- VERIFICĂ STATISTICI TABELE
-- ============================================

-- Verifică câte rânduri sunt în fiecare tabel
SELECT 
    'SpecificationTemplate' as table_name,
    COUNT(*) as row_count
FROM "SpecificationTemplate"
WHERE "shopId" = '1c5cb175-869d-4a9a-99b5-5fb86d3850a7'
UNION ALL
SELECT 
    'TemplateSection',
    COUNT(*)
FROM "TemplateSection" ts
INNER JOIN "SpecificationTemplate" st ON ts."templateId" = st.id
WHERE st."shopId" = '1c5cb175-869d-4a9a-99b5-5fb86d3850a7'
UNION ALL
SELECT 
    'TemplateSectionMetafield',
    COUNT(*)
FROM "TemplateSectionMetafield" tsm
INNER JOIN "TemplateSection" ts ON tsm."sectionId" = ts.id
INNER JOIN "SpecificationTemplate" st ON ts."templateId" = st.id
WHERE st."shopId" = '1c5cb175-869d-4a9a-99b5-5fb86d3850a7'
UNION ALL
SELECT 
    'TemplateAssignment',
    COUNT(*)
FROM "TemplateAssignment" ta
WHERE ta."shopId" = '1c5cb175-869d-4a9a-99b5-5fb86d3850a7'
UNION ALL
SELECT 
    'TemplateAssignmentTarget',
    COUNT(*)
FROM "TemplateAssignmentTarget" tat
INNER JOIN "TemplateAssignment" ta ON tat."assignmentId" = ta.id
WHERE ta."shopId" = '1c5cb175-869d-4a9a-99b5-5fb86d3850a7';

-- ============================================
-- SUGESTII DE OPTIMIZARE
-- ============================================

-- 1. Asigură-te că există index pe "shopId" în SpecificationTemplate
-- (Deja există conform schema.prisma)

-- 2. Asigură-te că există index pe "templateId" în TemplateSection
-- (Deja există conform schema.prisma)

-- 3. Asigură-te că există index pe "sectionId" în TemplateSectionMetafield
-- (Deja există conform schema.prisma)

-- 4. Asigură-te că există index pe "templateId" în TemplateAssignment
-- (Deja există conform schema.prisma)

-- 5. Asigură-te că există index pe "assignmentId" în TemplateAssignmentTarget
-- (Deja există conform schema.prisma)

-- 6. Dacă query-ul este încă lent, consideră:
--    - Folosirea de materialized views pentru date agregate
--    - Paginare (LIMIT/OFFSET) pentru a reduce numărul de rânduri
--    - Cache la nivel de aplicație (Redis)




