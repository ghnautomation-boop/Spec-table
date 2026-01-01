-- Verifică toate coloanele din tabelul SpecificationTemplate
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'SpecificationTemplate'
AND column_name LIKE '%seeLess%'
ORDER BY ordinal_position;

