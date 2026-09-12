export const maintenanceStockCategories = [
  "oil",
  "spare_part",
  "material",
] as const;

export const maintenanceStockUnits = [
  "liter",
  "piece",
  "set",
  "kg",
  "meter",
  "other",
] as const;

export const maintenanceStockMovementTypes = [
  "opening_balance",
  "stock_in",
  "consume",
  "return",
  "adjustment_in",
  "adjustment_out",
] as const;

export const adminMaintenanceStockMovementTypes = [
  "opening_balance",
  "stock_in",
  "adjustment_in",
  "adjustment_out",
] as const;

export type MaintenanceStockCategory =
  (typeof maintenanceStockCategories)[number];

export type MaintenanceStockUnit = (typeof maintenanceStockUnits)[number];

export type MaintenanceStockMovementType =
  (typeof maintenanceStockMovementTypes)[number];

export type AdminMaintenanceStockMovementType =
  (typeof adminMaintenanceStockMovementTypes)[number];

export type MaintenanceStockItem = {
  id: string;
  organizationId: string;
  providerId: string;
  itemName: string;
  category: MaintenanceStockCategory;
  unit: MaintenanceStockUnit;
  sku: string | null;
  minimumQuantity: number | null;
  currentQuantity: number;
  isActive: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MaintenanceStockRow = MaintenanceStockItem & {
  organizationName: string | null;
  organizationCode: string | null;
  providerName: string | null;
  providerCode: string | null;
  allocatedQuantity: number;
  unallocatedQuantity: number;
  totalAdded: number;
  totalConsumed: number;
  totalReturned: number;
  totalAdjustedOut: number;
  lastMovementAt: string | null;
  movementCount: number;
  canManage: boolean;
};

export type MaintenanceStockMovement = {
  id: string;
  stockItemId: string;
  organizationId: string;
  providerId: string;
  maintenanceJobId: string | null;
  movementType: MaintenanceStockMovementType;
  quantity: number;
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  note: string | null;
  createdAt: string;
  createdBy: string;
  actorName: string | null;
  jobLabel: string | null;
};

export type MaintenanceStockAllocation = {
  id: string;
  stockItemId: string;
  organizationId: string;
  providerId: string;
  availableQuantity: number;
  organizationName: string | null;
  organizationCode: string | null;
};

export type MaintenanceStockAllocationMovementType =
  | "allocate"
  | "release"
  | "consume";

export type MaintenanceStockAllocationMovement = {
  id: string;
  allocationId: string;
  stockItemId: string;
  organizationId: string;
  providerId: string;
  movementType: MaintenanceStockAllocationMovementType;
  quantity: number;
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  note: string | null;
  maintenanceJobId: string | null;
  maintenanceJobMaterialId: string | null;
  createdAt: string;
  createdBy: string;
  actorName: string | null;
  jobLabel: string | null;
  organizationName: string | null;
  organizationCode: string | null;
};

export type MaintenanceStockAllocationOrganizationOption = {
  id: string;
  stockItemId: string;
  name: string;
  code: string;
};

export type MaintenanceStockOrganizationOption = {
  id: string;
  name: string;
  code: string;
  canManage: boolean;
};

export type MaintenanceStockProviderOption = {
  id: string;
  organizationId: string;
  name: string;
  code: string;
};

export type MaintenanceStockSummary = {
  totalItems: number;
  physicalQuantity: number;
  allocatedQuantity: number;
  unallocatedQuantity: number;
  lowOrOutItems: number;
  archivedItems: number;
};

export type MaintenanceStockFilters = {
  category?: string;
  organizationId?: string;
  providerId?: string;
  search?: string;
  status?: string;
  page?: string;
};

export type MaintenanceStockActionState = {
  status: "idle" | "success" | "error" | "validation_error";
  code?: string;
};
