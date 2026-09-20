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
  "driver_order_reports.view",
  "driver_order_reports.import",
  "driver_order_reports.replace",
  "driver_order_reports.details.view",
  "driver_order_reports.edit",
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
  "app_requests.leave.view",
  "app_requests.leave.review",
  "app_requests.maintenance.view",
  "app_requests.maintenance.review",
  "app_requests.meeting.view",
  "app_requests.meeting.review",
  "app_requests.oil_change.view",
  "app_requests.oil_change.review",
  "app_requests.shift_change.view",
  "app_requests.shift_change.review",
  "odometer.manage",
  "odometer.view",
  "odometer.review",
  "odometer.edit",
  "odometer.approve",
  "odometer.reject",
  "notifications.view",
  "driver_warnings.view",
  "driver_warnings.issue",
  "driver_warnings.revoke",
  "shifts.view",
  "shifts.create",
  "shifts.update",
  "shifts.assign",
  "shifts.archive",
  "maintenance_providers.view",
  "maintenance_providers.manage",
  "maintenance_jobs.view",
  "maintenance_jobs.assign",
  "maintenance_jobs.cancel",
  "maintenance_materials.view",
  "maintenance_materials.manage",
  "order_periods.view",
  "order_periods.manage",
  "order_periods.create",
  "order_periods.update",
  "order_periods.assign",
  "order_periods.open_now",
  "order_periods.requests.review",
  "order_periods.settings",
  "order_periods.archive",
  "order_periods.activity.view",
] as const;

export type OrganizationPermissionKey =
  (typeof organizationPermissionKeys)[number];

export type OrganizationPermissionGroup = {
    id:
    | "organization"
    | "drivers"
    | "driver_reports"
    | "driver_order_reports"
    | "fleet"
    | "fuel"
    | "app_requests"
    | "shifts"
    | "maintenance"
    | "order_periods"
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
  "driver_order_reports.view",
  "fleet.cars.view",
  "fleet.motorcycles.view",
  "fuel.reports.view",
  "app_requests.leave.view",
  "app_requests.maintenance.view",
  "app_requests.meeting.view",
  "app_requests.oil_change.view",
  "app_requests.shift_change.view",
  "odometer.view",
  "odometer.view",
  "notifications.view",
  "driver_warnings.view",
  "shifts.view",
  "maintenance_providers.view",
  "maintenance_jobs.view",
  "maintenance_materials.view",
  "order_periods.view",
  "order_periods.activity.view",
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
    id: "driver_order_reports",
    permissions: [
      "driver_order_reports.view",
      "driver_order_reports.import",
      "driver_order_reports.replace",
      "driver_order_reports.details.view",
      "driver_order_reports.edit",
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
      "maintenance_materials.view",
      "maintenance_materials.manage",
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
      "app_requests.leave.view",
      "app_requests.leave.review",
      "app_requests.maintenance.view",
      "app_requests.maintenance.review",
      "app_requests.meeting.view",
      "app_requests.meeting.review",
      "app_requests.oil_change.view",
      "app_requests.oil_change.review",
      "app_requests.shift_change.view",
      "app_requests.shift_change.review",
      "odometer.view",
      "odometer.review",
      "odometer.edit",
      "odometer.approve",
      "odometer.reject",
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
    id: "maintenance",
    permissions: [
      "maintenance_providers.view",
      "maintenance_providers.manage",
      "maintenance_jobs.view",
      "maintenance_jobs.assign",
      "maintenance_jobs.cancel",
    ],
  },
  {
    id: "order_periods",
    permissions: [
      "order_periods.view",
      "order_periods.create",
      "order_periods.update",
      "order_periods.assign",
      "order_periods.open_now",
      "order_periods.requests.review",
      "order_periods.settings",
      "order_periods.archive",
      "order_periods.activity.view",
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

export function stripLegacyPermissionKeys(
  values: readonly OrganizationPermissionKey[],
): OrganizationPermissionKey[] {
  return values.filter((permissionKey) => permissionKey !== "order_periods.manage");
}

const appRequestViewPermissionKeys = [
  "app_requests.leave.view",
  "app_requests.maintenance.view",
  "app_requests.meeting.view",
  "app_requests.oil_change.view",
  "app_requests.shift_change.view",
] as const satisfies readonly OrganizationPermissionKey[];

const appRequestReviewPermissionKeys = [
  "app_requests.leave.review",
  "app_requests.maintenance.review",
  "app_requests.meeting.review",
  "app_requests.oil_change.review",
  "app_requests.shift_change.review",
] as const satisfies readonly OrganizationPermissionKey[];

const odometerGranularPermissionKeys = [
  "odometer.view",
  "odometer.review",
  "odometer.edit",
  "odometer.approve",
  "odometer.reject",
] as const satisfies readonly OrganizationPermissionKey[];

/** Expands legacy broad grants for the permission editor, then removes them from editable state. */
export function normalizeLegacyPermissionsForEditor(
  values: readonly OrganizationPermissionKey[],
): OrganizationPermissionKey[] {
  const permissions = new Set(values);

  if (permissions.has("app_requests.view")) {
    appRequestViewPermissionKeys.forEach((key) => permissions.add(key));
  }
  if (permissions.has("app_requests.review")) {
    appRequestReviewPermissionKeys.forEach((key) => permissions.add(key));
  }
  if (permissions.has("odometer.manage")) {
    odometerGranularPermissionKeys.forEach((key) => permissions.add(key));
  }

  permissions.delete("app_requests.view");
  permissions.delete("app_requests.review");
  permissions.delete("odometer.manage");

  return applyPermissionDependencies(Array.from(permissions));
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

  if (
    permissions.has("driver_order_reports.import") ||
    permissions.has("driver_order_reports.replace") ||
    permissions.has("driver_order_reports.details.view") ||
    permissions.has("driver_order_reports.edit")
  ) {
    permissions.add("driver_order_reports.view");
  }

  if (permissions.has("fuel.manage") || permissions.has("fuel.increase.review")) {
    permissions.add("fuel.reports.view");
  }

  if (permissions.has("app_requests.review")) {
    permissions.add("app_requests.view");
  }

  for (const [review, view] of [
    ["app_requests.leave.review", "app_requests.leave.view"],
    ["app_requests.maintenance.review", "app_requests.maintenance.view"],
    ["app_requests.meeting.review", "app_requests.meeting.view"],
    ["app_requests.oil_change.review", "app_requests.oil_change.view"],
    ["app_requests.shift_change.review", "app_requests.shift_change.view"],
    ["odometer.review", "odometer.view"],
    ["odometer.edit", "odometer.view"],
    ["odometer.approve", "odometer.view"],
    ["odometer.reject", "odometer.view"],
  ] as const) {
    if (permissions.has(review as OrganizationPermissionKey)) permissions.add(view as OrganizationPermissionKey);
  }

  if (permissions.has("driver_warnings.issue") || permissions.has("driver_warnings.revoke")) {
    permissions.add("driver_warnings.view");
  }

  if (
    permissions.has("shifts.create") ||
    permissions.has("shifts.update") ||
    permissions.has("shifts.assign") ||
    permissions.has("shifts.archive")
  ) {
    permissions.add("shifts.view");
  }

  if (permissions.has("maintenance_providers.manage")) {
    permissions.add("maintenance_providers.view");
  }

  if (permissions.has("maintenance_jobs.assign") || permissions.has("maintenance_jobs.cancel")) {
    permissions.add("maintenance_jobs.view");
    permissions.add("maintenance_providers.view");
  }

  if (permissions.has("maintenance_materials.manage")) {
    permissions.add("maintenance_materials.view");
    permissions.add("maintenance_jobs.view");
    permissions.add("maintenance_providers.view");
  }

  if (
    permissions.has("order_periods.manage") ||
    permissions.has("order_periods.create") ||
    permissions.has("order_periods.update") ||
    permissions.has("order_periods.assign") ||
    permissions.has("order_periods.open_now") ||
    permissions.has("order_periods.requests.review") ||
    permissions.has("order_periods.settings") ||
    permissions.has("order_periods.archive")
  ) {
    permissions.add("order_periods.view");
  }

  if (permissions.has("order_periods.activity.view")) {
    permissions.add("order_periods.view");
  }

  if (permissions.has("order_periods.manage")) {
    permissions.add("order_periods.create");
    permissions.add("order_periods.update");
    permissions.add("order_periods.assign");
    permissions.add("order_periods.open_now");
    permissions.add("order_periods.requests.review");
    permissions.add("order_periods.settings");
    permissions.add("order_periods.archive");
    permissions.add("order_periods.activity.view");
  }

  return Array.from(permissions).filter(isOrganizationPermissionKey);
}
