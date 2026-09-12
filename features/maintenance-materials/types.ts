export const maintenanceMaterialCategories = [
  "oil",
  "spare_part",
  "material",
] as const;

export const maintenanceMaterialUnits = [
  "liter",
  "piece",
  "set",
  "kg",
  "meter",
  "other",
] as const;

export type MaintenanceMaterialCategory =
  (typeof maintenanceMaterialCategories)[number];

export type MaintenanceMaterialUnit =
  (typeof maintenanceMaterialUnits)[number];

export type MaintenanceJobStatus =
  | "ready"
  | "in_progress"
  | "completed"
  | "cancelled";

export type MaintenanceJobMaterial = {
  id: string;
  maintenanceJobId: string;
  organizationId: string;
  providerId: string;
  itemName: string;
  category: MaintenanceMaterialCategory;
  unit: MaintenanceMaterialUnit;
  issuedQuantity: number;
  usedQuantity: number | null;
  returnedQuantity: number | null;
  usageRecordedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MaintenanceMaterialRow = MaintenanceJobMaterial & {
  organizationName: string | null;
  organizationCode: string | null;
  providerName: string | null;
  providerCode: string | null;
  jobType: "maintenance" | "oil_change" | null;
  jobStatus: MaintenanceJobStatus | null;
  vehiclePlate: string | null;
  vehicleType: string | null;
  driverName: string | null;
  requestId: string | null;
};

export type MaintenanceMaterialsSummary = {
  totalRows: number;
  oilRows: number;
  sparePartRows: number;
  materialRows: number;
  returnedRows: number;
};

export type MaintenanceMaterialsFilters = {
  category?: string;
  organizationId?: string;
  status?: string;
  search?: string;
};

export type MaintenanceMaterialActionState = {
  status: "idle" | "success" | "error" | "validation_error";
  code?: string;
};
