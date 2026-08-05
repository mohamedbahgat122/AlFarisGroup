-- Phase 5B-A: add the driving license document enum value only.
--
-- Keep this isolated from functions that use the new enum value so PostgreSQL
-- can commit the enum change before dependent objects reference it.

alter type public.driver_document_type add value if not exists 'driving_license';
