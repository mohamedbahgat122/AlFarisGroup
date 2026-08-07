"use client";

import type { Dictionary } from "@/i18n/dictionaries";
import type {
  ActiveOrganizationOption,
} from "@/features/user-management/types";
import {
  applyPermissionDependencies,
  organizationPermissionGroups,
  organizationPermissionKeys,
  viewOnlyOrganizationPermissionKeys,
  type OrganizationPermissionKey,
} from "@/features/permissions/registry";

type OrganizationAccessFieldsProps = {
  dictionary: Dictionary["dashboard"]["userManagement"];
  organizations: ActiveOrganizationOption[];
  homeOrganizationId: string;
  includeHomeOrganization?: boolean;
  values: Record<string, OrganizationPermissionKey[]>;
  onChange: (
    organizationId: string,
    permissionKeys: OrganizationPermissionKey[],
  ) => void;
};

export function OrganizationAccessFields({
  dictionary,
  organizations,
  homeOrganizationId,
  includeHomeOrganization = false,
  values,
  onChange,
}: OrganizationAccessFieldsProps) {
  const availableOrganizations = includeHomeOrganization
    ? organizations
    : organizations.filter((organization) => organization.id !== homeOrganizationId);

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-navy">
        {dictionary.additionalAccess}
      </legend>
      <div className="grid gap-4">
        {availableOrganizations.map((organization) => (
          <OrganizationPermissionCard
            key={organization.id}
            dictionary={dictionary}
            organization={organization}
            permissionKeys={values[organization.id] ?? []}
            onChange={(permissionKeys) => onChange(organization.id, permissionKeys)}
          />
        ))}
      </div>
    </fieldset>
  );
}

function OrganizationPermissionCard({
  dictionary,
  organization,
  permissionKeys,
  onChange,
}: {
  dictionary: Dictionary["dashboard"]["userManagement"];
  organization: ActiveOrganizationOption;
  permissionKeys: OrganizationPermissionKey[];
  onChange: (permissionKeys: OrganizationPermissionKey[]) => void;
}) {
  const enabled = permissionKeys.length > 0;
  const selected = new Set(permissionKeys);

  function setEnabled(nextEnabled: boolean) {
    if (!nextEnabled && permissionKeys.length > 0) {
      const confirmed = window.confirm(
        dictionary.permissions.disableOrganizationAccessWarning,
      );
      if (!confirmed) return;
    }

    onChange(nextEnabled ? [...viewOnlyOrganizationPermissionKeys] : []);
  }

  function setPermission(permissionKey: OrganizationPermissionKey, checked: boolean) {
    const next = new Set(permissionKeys);
    if (checked) {
      next.add(permissionKey);
    } else {
      next.delete(permissionKey);
    }
    onChange(applyPermissionDependencies(Array.from(next)));
  }

  return (
    <details open={enabled} className="rounded-2xl border border-border bg-background/60 p-4">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-navy">{organization.name}</p>
            <p className="text-xs text-muted">{organization.code}</p>
          </div>
          <label className="flex items-center gap-2 text-sm font-bold text-navy">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              className="size-4 accent-primary"
            />
            {dictionary.permissions.enableOrganizationAccess}
          </label>
        </div>
      </summary>

      {enabled ? (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <PresetButton onClick={() => onChange([...viewOnlyOrganizationPermissionKeys])}>
              {dictionary.permissions.presets.viewOnly}
            </PresetButton>
            <PresetButton onClick={() => onChange([...organizationPermissionKeys])}>
              {dictionary.permissions.presets.fullManagement}
            </PresetButton>
            <PresetButton onClick={() => undefined}>
              {dictionary.permissions.presets.custom}
            </PresetButton>
            <PresetButton onClick={() => onChange([...organizationPermissionKeys])}>
              {dictionary.permissions.selectAll}
            </PresetButton>
            <PresetButton onClick={() => setEnabled(false)}>
              {dictionary.permissions.clearAll}
            </PresetButton>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {organizationPermissionGroups.map((group) => (
              <div key={group.id} className="rounded-xl border border-border bg-surface p-4">
                <h4 className="text-sm font-bold text-navy">
                  {dictionary.permissions.groups[group.id]}
                </h4>
                <div className="mt-3 grid gap-2">
                  {group.permissions.map((permissionKey) => (
                    <label
                      key={permissionKey}
                      className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-navy"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(permissionKey)}
                        onChange={(event) =>
                          setPermission(permissionKey, event.target.checked)
                        }
                        className="mt-1 size-4 accent-primary"
                      />
                      <span>{dictionary.permissions.labels[permissionKey]}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </details>
  );
}

function PresetButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-bold text-muted transition hover:border-primary/35 hover:text-primary"
    >
      {children}
    </button>
  );
}
