"use client";

import type { Dictionary } from "@/i18n/dictionaries";
import type { GlobalPermissionKey } from "@/features/permissions/global-registry";
import { globalPermissionKeys } from "@/features/permissions/global-registry";

type GlobalAccessFieldsProps = {
  dictionary: Dictionary["dashboard"]["userManagement"];
  values: GlobalPermissionKey[];
  onChange: (permissions: GlobalPermissionKey[]) => void;
};

export function GlobalAccessFields({
  dictionary,
  values,
  onChange,
}: GlobalAccessFieldsProps) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-navy">{dictionary.globalPermissions?.title ?? "Global Permissions"}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {globalPermissionKeys.map((permissionKey) => {
          const isSelected = values.includes(permissionKey);
          const label = dictionary.globalPermissions?.keys?.[permissionKey as keyof typeof dictionary.globalPermissions.keys] ?? permissionKey;

          return (
            <label
              key={permissionKey}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                isSelected
                  ? "border-primary bg-primary-soft/50"
                  : "border-border bg-background hover:border-primary/35 hover:bg-surface"
              }`}
            >
              <div className="flex h-5 items-center">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    if (checked) {
                      onChange([...values, permissionKey]);
                    } else {
                      onChange(values.filter((k) => k !== permissionKey));
                    }
                  }}
                  className="mt-1 size-4 accent-primary"
                />
              </div>
              <div className="flex-1 space-y-1">
                <p
                  className={`text-sm font-medium leading-none ${
                    isSelected ? "text-primary" : "text-navy"
                  }`}
                >
                  {label}
                </p>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
