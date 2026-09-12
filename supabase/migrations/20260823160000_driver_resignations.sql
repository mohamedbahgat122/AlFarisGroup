-- 20260823160000_driver_resignations.sql
-- Create driver resignations table

CREATE TABLE IF NOT EXISTS public.driver_resignations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
    keeta_driver_id text,
    resignation_date date NOT NULL,
    orders_count integer NOT NULL CHECK (orders_count >= 0),
    rating numeric(3,2) CHECK (rating >= 0 AND rating <= 5),
    notes text,
    created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.driver_resignations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.driver_resignations FROM anon;
GRANT SELECT, INSERT ON public.driver_resignations TO authenticated;

-- Organization read policy
DROP POLICY IF EXISTS driver_resignations_select_viewable_organization ON public.driver_resignations;
CREATE POLICY driver_resignations_select_viewable_organization
  ON public.driver_resignations
  FOR SELECT
  TO authenticated
  USING (public.can_view_organization(organization_id));

-- Organization insert policy
DROP POLICY IF EXISTS driver_resignations_insert_manage_organization ON public.driver_resignations;
CREATE POLICY driver_resignations_insert_manage_organization
  ON public.driver_resignations
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_organization(organization_id));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_driver_resignations_organization_id ON public.driver_resignations(organization_id);
CREATE INDEX IF NOT EXISTS idx_driver_resignations_driver_id ON public.driver_resignations(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_resignations_resignation_date ON public.driver_resignations(resignation_date);
