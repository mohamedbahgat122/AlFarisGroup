export const organizationPermissionKeys = [
  "organization.dashboard.view",
  "drivers.view",
  "drivers.create",
  "drivers.update",
  "drivers.status",
  "drivers.archive",
  "drivers.documents.view",
  "drivers.documents.download",
  "drivers.activity.view",
  "drivers.account.manage",
  "driver_reports.view",
  "driver_reports.import",
  "driver_reports.replace",
  "driver_reports.details.view",
  "fleet.cars.view",
  "fleet.motorcycles.view",
  "fleet.create",
  "fleet.update",
  "fleet.technical_status",
  "fleet.operational_status",
  "fleet.archive",
  "fleet.operating_card.download",
  "fleet.activity.view",
  "fuel.manage",
  "fuel.reports.view",
  "fuel.increase.review",
  "app_requests.view",
  "app_requests.review",
  "odometer.manage",
  "notifications.view",
  "driver_warnings.view",
  "driver_warnings.issue",
  "driver_warnings.revoke",
  "entitlements.view",
  "entitlements.create_transaction",
  "entitlements.view_transactions",
  "entitlements.reverse_transaction",
  "entitlements.publish",
  "shifts.view",
  "shifts.create",
  "shifts.update",
  "shifts.assign",
  "shifts.archive",
] as const;

export type OrganizationPermissionKey =
  (typeof organizationPermissionKeys)[number];

export type OrganizationPermissionGroup = {
  id:
    | "organization"
    | "drivers"
    | "driver_reports"
    | "fleet"
    | "fuel"
    | "app_requests"
    | "entitlements"
    | "shifts"
    | "driver_warnings"
    | "notifications";
  permissions: OrganizationPermissionKey[];
};

export const organizationPermissionSet = new Set<string>(
  organizationPermissionKeys,
);

export const viewOnlyOrganizationPermissionKeys = [
  "organization.dashboard.view",
  "drivers.view",
  "driver_reports.view",
  "fleet.cars.view",
  "fleet.motorcycles.view",
  "fuel.reports.view",
  "app_requests.view",
  "odometer.manage",
  "notifications.view",
  "driver_warnings.view",
  "entitlements.view",
  "entitlements.view_transactions",
  "shifts.view",
] as const satisfies readonly OrganizationPermissionKey[];

export const organizationPermissionGroups: OrganizationPermissionGroup[] = [
  {
    id: "organization",
    permissions: ["organization.dashboard.view"],
  },
  {
    id: "drivers",
    permissions: [
      "drivers.view",
      "drivers.create",
      "drivers.update",
      "drivers.status",
      "drivers.archive",
      "drivers.documents.view",
      "drivers.documents.download",
      "drivers.activity.view",
      "drivers.account.manage",
    ],
  },
  {
    id: "driver_reports",
    permissions: [
      "driver_reports.view",
      "driver_reports.import",
      "driver_reports.replace",
      "driver_reports.details.view",
    ],
  },
  {
    id: "fleet",
    permissions: [
      "fleet.cars.view",
      "fleet.motorcycles.view",
      "fleet.create",
      "fleet.update",
      "fleet.technical_status",
      "fleet.operational_status",
      "fleet.archive",
      "fleet.operating_card.download",
      "fleet.activity.view",
    ],
  },
  {
    id: "fuel",
    permissions: [
      "fuel.manage",
      "fuel.reports.view",
      "fuel.increase.review",
    ],
  },
  {
    id: "app_requests",
    permissions: [
      "odometer.manage",
      "app_requests.view",
      "app_requests.review",
    ],
  },
  {
    id: "driver_warnings",
    permissions: [
      "driver_warnings.view",
      "driver_warnings.issue",
      "driver_warnings.revoke",
    ],
  },
  {
    id: "entitlements",
    permissions: [
      "entitlements.view",
      "entitlements.create_transaction",
      "entitlements.view_transactions",
      "entitlements.reverse_transaction",
      "entitlements.publish",
    ],
  },
  {
    id: "shifts",
    permissions: [
      "shifts.view",
      "shifts.create",
      "shifts.update",
      "shifts.assign",
      "shifts.archive",
    ],
  },
  {
    id: "notifications",
    permissions: ["notifications.view"],
  },
];

export function isOrganizationPermissionKey(
  value: string,
): value is OrganizationPermissionKey {
  return organizationPermissionSet.has(value);
}

export function normalizePermissionKeys(
  values: readonly string[],
): OrganizationPermissionKey[] {
  return Array.from(new Set(values)).filter(isOrganizationPermissionKey);
}

export function applyPermissionDependencies(
  values: readonly OrganizationPermissionKey[],
) {
  const permissions = new Set(values);

  if (!permissions.has("drivers.view")) {
    for (const key of organizationPermissionGroups[1].permissions) {
      if (key !== "drivers.view") permissions.delete(key);
    }
  }

  if (!permissions.has("driver_reports.view")) {
    for (const key of organizationPermissionGroups[2].permissions) {
      if (key !== "driver_reports.view") permissions.delete(key);
    }
  }

  if (
    permissions.has("drivers.create") ||
    permissions.has("drivers.update") ||
    permissions.has("drivers.status") ||
    permissions.has("drivers.archive") ||
    permissions.has("drivers.documents.view") ||
    permissions.has("drivers.documents.download") ||
    permissions.has("drivers.activity.view") ||
    permissions.has("drivers.account.manage")
  ) {
    permissions.add("drivers.view");
  }

  if (
    permissions.has("driver_reports.import") ||
    permissions.has("driver_reports.replace") ||
    permissions.has("driver_reports.details.view")
  ) {
    permissions.add("driver_reports.view");
  }

  if (permissions.has("fuel.manage") || permissions.has("fuel.increase.review")) {
    permissions.add("fuel.reports.view");
  }

  if (permissions.has("app_requests.review")) {
    permissions.add("app_requests.view");
  }

  if (permissions.has("driver_warnings.issue") || permissions.has("driver_warnings.revoke")) {
    permissions.add("driver_warnings.view");
  }

  if (
    permissions.has("entitlements.create_transaction") ||
    permissions.has("entitlements.view_transactions") ||
    permissions.has("entitlements.reverse_transaction") ||
    permissions.has("entitlements.publish")
  ) {
    permissions.add("entitlements.view");
  }

  if (
    permissions.has("shifts.create") ||
    permissions.has("shifts.update") ||
    permissions.has("shifts.assign") ||
    permissions.has("shifts.archive")
  ) {
    permissions.add("shifts.view");
  }

  return Array.from(permissions).filter(isOrganizationPermissionKey);
}
