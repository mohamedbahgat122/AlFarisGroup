-- Insert the six approved initial organizations only.
-- This migration does not assign users, does not create organization access rows,
-- and does not modify profiles.home_organization_id.

insert into public.organizations (
  name,
  code,
  is_active
)
values
  ('مؤسسة زمن الفرسان', 'zaman_al_fursan', true),
  ('شركة زمان الفارس', 'zaman_al_faris', true),
  ('شركة سوفا الفارس', 'sofa_al_faris', true),
  ('شركة يزيد', 'yazeed', true),
  ('شركة أروى', 'arwa', true),
  ('شركة مركب الفارس', 'markab_al_faris', true)
on conflict (code)
do update set
  name = excluded.name,
  is_active = excluded.is_active,
  updated_at = now();

do $$
begin
  if exists (
    with expected_organizations(name, code) as (
      values
        ('مؤسسة زمن الفرسان', 'zaman_al_fursan'),
        ('شركة زمان الفارس', 'zaman_al_faris'),
        ('شركة سوفا الفارس', 'sofa_al_faris'),
        ('شركة يزيد', 'yazeed'),
        ('شركة أروى', 'arwa'),
        ('شركة مركب الفارس', 'markab_al_faris')
    )
    select 1
    from expected_organizations expected
    left join public.organizations actual
      on actual.code = expected.code
     and actual.name = expected.name
     and actual.is_active = true
    where actual.id is null
  ) then
    raise exception 'Initial organizations verification failed: one or more approved organizations are missing or inactive.';
  end if;
end
$$;
