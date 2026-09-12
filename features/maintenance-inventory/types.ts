export const maintenanceInventoryCategories = [
  "oil",
  "spare_part",
  "material",
] as const;

export const maintenanceInventoryRecordTypes = ["leftover", "returned"] as const;

export const maintenanceInventoryUnits = [
  "liter",
  "piece",
  "set",
  "kg",
  "meter",
  "other",
] as const;

export type MaintenanceInventoryCategory =
  (typeof maintenanceInventoryCategories)[number];

export type MaintenanceInventoryRecordType =
  (typeof maintenanceInventoryRecordTypes)[number];

export type MaintenanceInventoryUnit = (typeof maintenanceInventoryUnits)[number];

export type MaintenanceInventoryJobStatus =
  | "ready"
  | "in_progress"
  | "completed"
  | "cancelled";

export type MaintenanceInventoryRecord = {
  id: string;
  organizationId: string;
  providerId: string;
  maintenanceJobId: string | null;
  itemName: string;
  category: MaintenanceInventoryCategory;
  recordType: MaintenanceInventoryRecordType;
  quantity: number;
  unit: MaintenanceInventoryUnit;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MaintenanceInventoryRow = MaintenanceInventoryRecord & {
  organizationName: string | null;
  organizationCode: string | null;
  providerName: string | null;
  providerCode: string | null;
  jobLabel: string | null;
  jobStatus: MaintenanceInventoryJobStatus | null;
};

export type MaintenanceInventoryOrganizationOption = {
  id: string;
  name: string;
  code: string;
  canManage: boolean;
};

export type MaintenanceInventoryProviderOption = {
  id: string;
  organizationId: string;
  name: string;
  code: string;
};

export type MaintenanceInventoryJobOption = {
  id: string;
  organizationId: string;
  providerId: string;
  label: string;
  status: MaintenanceInventoryJobStatus;
};

export type MaintenanceInventorySummary = {
  totalRows: number;
  oilRows: number;
  sparePartRows: number;
  materialRows: number;
  returnedRows: number;
};

export type MaintenanceInventoryFilters = {
  category?: string;
  organizationId?: string;
  providerId?: string;
  recordType?: string;
  search?: string;
  page?: string;
};

export type MaintenanceInventoryActionState = {
  status: "idle" | "success" | "error" | "validation_error";
  code?: string;
};
