export const globalPermissionKeys = [
  "fleet.view",
  "fleet.create",
  "fleet.update",
  "fleet.technical_status",
  "fleet.operational_status",
  "fleet.archive",
  "fleet.operating_card.download",
  "fleet.activity.view",
  "housing.view",
  "housing.create",
  "housing.update",
  "housing.archive",
  "housing.assign_organizations",
  "housing.assign_drivers",
  "housing.activity.view",
] as const;

export type GlobalPermissionKey = (typeof globalPermissionKeys)[number];

export const globalPermissionSet = new Set<string>(globalPermissionKeys);

export function isGlobalPermissionKey(
  value: string,
): value is GlobalPermissionKey {
  return globalPermissionSet.has(value);
}

export function normalizeGlobalPermissionKeys(
  values: readonly string[],
): GlobalPermissionKey[] {
  return Array.from(new Set(values)).filter(isGlobalPermissionKey);
}

export function applyGlobalPermissionDependencies(
  values: readonly GlobalPermissionKey[],
) {
  const permissions = new Set(values);

  // Explicitly do NOT imply module view permissions from action permissions.
  // Users must be explicitly granted fleet.view / housing.view to see global modules.

  return Array.from(permissions).filter(isGlobalPermissionKey);
}
