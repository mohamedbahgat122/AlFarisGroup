-- Phase 1 of Global Fleet Architecture

-- Add nullable fleet_vehicles.assigned_organization_id referencing organizations(id) ON DELETE SET NULL.
ALTER TABLE public.fleet_vehicles
  ADD COLUMN assigned_organization_id uuid NULL REFERENCES public.organizations(id) ON DELETE SET NULL;

-- Clarifying comments
COMMENT ON COLUMN public.fleet_vehicles.assigned_organization_id IS 'Current operational organization assignment. It is NOT vehicle ownership.';
COMMENT ON COLUMN public.fleet_vehicles.organization_id IS 'Pending migration: currently represents assignment/ownership. Will be preserved for backward compatibility during migration.';

-- Backfill: assigned_organization_id = current organization_id for all existing vehicles.
UPDATE public.fleet_vehicles
  SET assigned_organization_id = organization_id;
