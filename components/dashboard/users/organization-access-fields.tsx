"use client";

import type { Dictionary } from "@/i18n/dictionaries";
import type {
  ActiveOrganizationOption,
} from "@/features/user-management/types";
import {
  applyPermissionDependencies,
  normalizeLegacyPermissionsForEditor,
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
  homePermissionKeys?: OrganizationPermissionKey[];
  onHomeChange?: (permissionKeys: OrganizationPermissionKey[]) => void;
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
  includeHomeOrganization = true,
  homePermissionKeys,
  onHomeChange,
  values,
  onChange,
}: OrganizationAccessFieldsProps) {
  const availableOrganizations = includeHomeOrganization && !onHomeChange
    ? organizations
    : organizations.filter((organization) => organization.id !== homeOrganizationId);

  return (
    <div className="space-y-5">
      {onHomeChange && homeOrganizationId ? (
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-navy">
            {dictionary.homeOrganization}
          </legend>
          {(() => {
            const organization = organizations.find(
              (candidate) => candidate.id === homeOrganizationId,
            );
            return organization ? (
              <OrganizationPermissionCard
                dictionary={dictionary}
                organization={organization}
                permissionKeys={normalizeLegacyPermissionsForEditor(homePermissionKeys ?? [])}
                onChange={onHomeChange}
              />
            ) : null;
          })()}
        </fieldset>
      ) : null}
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
                permissionKeys={normalizeLegacyPermissionsForEditor(values[organization.id] ?? [])}
              onChange={(permissionKeys) => onChange(organization.id, permissionKeys)}
            />
          ))}
        </div>
      </fieldset>
    </div>
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
  const editablePermissionKeys = normalizeLegacyPermissionsForEditor(permissionKeys);
  const enabled = editablePermissionKeys.length > 0;
  const selected = new Set(editablePermissionKeys);

  function setEnabled(nextEnabled: boolean) {
    if (!nextEnabled && editablePermissionKeys.length > 0) {
      const confirmed = window.confirm(
        dictionary.permissions.disableOrganizationAccessWarning,
      );
      if (!confirmed) return;
    }

    onChange(nextEnabled ? [...viewOnlyOrganizationPermissionKeys] : []);
  }

  function setPermission(permissionKey: OrganizationPermissionKey, checked: boolean) {
    const next = new Set(normalizeLegacyPermissionsForEditor(permissionKeys));
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
                {group.id === "app_requests" ? (
                  <AppRequestsPermissionMatrix
                    dictionary={dictionary}
                    selected={selected}
                    onChange={setPermission}
                  />
                ) : (
                  <div className="mt-3 grid gap-2">
                    {group.permissions.map((permissionKey) => (
                      <PermissionCheckbox
                        key={permissionKey}
                        permissionKey={permissionKey}
                        label={dictionary.permissions.labels[permissionKey]}
                        checked={selected.has(permissionKey)}
                        onChange={setPermission}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </details>
  );
}

function PermissionCheckbox({
  permissionKey,
  label,
  checked,
  onChange,
}: {
  permissionKey: OrganizationPermissionKey;
  label: string;
  checked: boolean;
  onChange: (permissionKey: OrganizationPermissionKey, checked: boolean) => void;
}) {
  return (
    <label className="flex min-w-0 items-start gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-navy">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(permissionKey, event.target.checked)}
        className="mt-1 size-4 shrink-0 accent-primary"
      />
      <span>{label}</span>
    </label>
  );
}

function AppRequestsPermissionMatrix({
  dictionary,
  selected,
  onChange,
}: {
  dictionary: Dictionary["dashboard"]["userManagement"];
  selected: Set<OrganizationPermissionKey>;
  onChange: (permissionKey: OrganizationPermissionKey, checked: boolean) => void;
}) {
  const requestRows: readonly [string, OrganizationPermissionKey, OrganizationPermissionKey][] = [
    ["leave", "app_requests.leave.view", "app_requests.leave.review"],
    ["maintenance", "app_requests.maintenance.view", "app_requests.maintenance.review"],
    ["meeting", "app_requests.meeting.view", "app_requests.meeting.review"],
    ["oilChange", "app_requests.oil_change.view", "app_requests.oil_change.review"],
    ["shiftChange", "app_requests.shift_change.view", "app_requests.shift_change.review"],
  ];
  return (
    <div className="mt-3 space-y-4">
      <PermissionMatrixTable
        title={dictionary.permissions.groups.app_requests}
        columns={[dictionary.permissions.matrix.view, dictionary.permissions.matrix.review]}
        rows={requestRows.map(([labelKey, viewKey, reviewKey]) => ({
          label: dictionary.permissions.matrix.requestTypes[labelKey as keyof typeof dictionary.permissions.matrix.requestTypes],
          cells: [viewKey, reviewKey],
        }))}
        selected={selected}
        onChange={onChange}
      />
      <PermissionMatrixTable
        title={dictionary.permissions.matrix.odometer.title}
        columns={[
          dictionary.permissions.matrix.view,
          dictionary.permissions.matrix.review,
          dictionary.permissions.matrix.edit,
          dictionary.permissions.matrix.approve,
          dictionary.permissions.matrix.reject,
        ]}
        rows={[{
          label: dictionary.permissions.matrix.odometer.title,
          cells: [
            "odometer.view",
            "odometer.review",
            "odometer.edit",
            "odometer.approve",
            "odometer.reject",
          ],
        }]}
        selected={selected}
        onChange={onChange}
      />
    </div>
  );
}

function PermissionMatrixTable({
  title,
  columns,
  rows,
  selected,
  onChange,
}: {
  title: string;
  columns: string[];
  rows: { label: string; cells: OrganizationPermissionKey[] }[];
  selected: Set<OrganizationPermissionKey>;
  onChange: (permissionKey: OrganizationPermissionKey, checked: boolean) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <div className="min-w-[32rem]">
        <div className="grid grid-cols-[minmax(10rem,1fr)_repeat(5,minmax(4.75rem,auto))] items-center gap-2 bg-background px-3 py-2 text-xs font-bold text-muted">
          <span>{title}</span>
          {columns.map((column) => <span key={column} className="text-center">{column}</span>)}
        </div>
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[minmax(10rem,1fr)_repeat(5,minmax(4.75rem,auto))] items-center gap-2 border-t border-border px-3 py-2">
            <span className="min-w-0 text-sm font-semibold text-navy">{row.label}</span>
            {row.cells.map((permissionKey) => (
              <span key={permissionKey} className="flex justify-center">
                <input
                  type="checkbox"
                  aria-label={permissionKey}
                  checked={selected.has(permissionKey)}
                  onChange={(event) => onChange(permissionKey, event.target.checked)}
                  className="size-4 accent-primary"
                />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
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
