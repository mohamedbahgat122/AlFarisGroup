-- Keep the entitlements ledger append-only even for routine service-role access.
-- Historical rows are reversed, never hard-deleted.

revoke delete on public.driver_entitlement_transactions from service_role;
