import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { getAccessibleOrganizationsForProfile } from "@/features/organizations/queries";
import type {
  MaintenanceStockCategory,
  MaintenanceStockFilters,
  MaintenanceStockAllocation,
  MaintenanceStockAllocationMovement,
  MaintenanceStockAllocationMovementType,
  MaintenanceStockAllocationOrganizationOption,
  MaintenanceStockMovement,
  MaintenanceStockMovementType,
  MaintenanceStockOrganizationOption,
  MaintenanceStockProviderOption,
  MaintenanceStockRow,
  MaintenanceStockSummary,
  MaintenanceStockUnit,
} from "@/features/maintenance-stock/types";
import type { Database } from "@/types/database";

type StockItemRecord = {
  id: string;
  organization_id: string;
  provider_id: string;
  item_name: string;
  category: MaintenanceStockCategory;
  unit: MaintenanceStockUnit;
  sku: string | null;
  minimum_quantity: number | null;
  current_quantity: number;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  is_out_of_stock: boolean;
  is_low_stock: boolean;
};

type StockSummaryRecord = {
  stock_item_id: string;
  total_added: number;
  total_consumed: number;
  total_returned: number;
  total_adjusted_out: number;
  last_movement_at: string | null;
  movement_count: number;
};

type AllocationSummaryRecord = {
  stock_item_id: string;
  allocated_quantity: number;
  unallocated_quantity: number;
};

type AllocationRecord = {
  id: string;
  stock_item_id: string;
  organization_id: string;
  provider_id: string;
  available_quantity: number;
  is_active: boolean;
  archived_at: string | null;
};

type AllocationMovementRecord = {
  id: string;
  allocation_id: string;
  stock_item_id: string;
  organization_id: string;
  provider_id: string;
  movement_type: MaintenanceStockAllocationMovementType;
  quantity: number;
  quantity_delta: number;
  quantity_before: number;
  quantity_after: number;
  note: string | null;
  maintenance_job_id: string | null;
  maintenance_job_material_id: string | null;
  created_at: string;
  created_by: string;
};

type StockMovementRecord = {
  id: string;
  stock_item_id: string;
  organization_id: string;
  provider_id: string;
  maintenance_job_id: string | null;
  movement_type: MaintenanceStockMovementType;
  quantity: number;
  quantity_delta: number;
  quantity_before: number;
  quantity_after: number;
  note: string | null;
  created_at: string;
  created_by: string;
};

type ProviderOrganizationRecord = {
  provider_id: string;
  organization_id: string;
  is_active: boolean;
};

type ProviderRecord = {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
};

type ProfileRecord = {
  id: string;
  full_name: string | null;
};

type JobRecord = {
  id: string;
  job_type: "maintenance" | "oil_change";
  driver_name_snapshot: string | null;
  vehicle_plate_snapshot: string | null;
};

type MaintenanceStockDatabase = Database & {
  public: Database["public"] & {
    Tables: Database["public"]["Tables"] & {
      maintenance_stock_items: {
        Row: StockItemRecord;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      maintenance_stock_movements: {
        Row: StockMovementRecord;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      maintenance_stock_allocations: {
        Row: AllocationRecord;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      maintenance_stock_allocation_movements: {
        Row: AllocationMovementRecord;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      maintenance_provider_organizations: {
        Row: ProviderOrganizationRecord;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      maintenance_providers: {
        Row: ProviderRecord;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRecord;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      maintenance_jobs: {
        Row: JobRecord;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Database["public"]["Views"] & {
      maintenance_stock_items_overview: {
        Row: StockItemRecord;
        Relationships: [];
      };
      maintenance_stock_item_summaries: {
        Row: StockSummaryRecord;
        Relationships: [];
      };
      maintenance_stock_allocation_summaries: {
        Row: AllocationSummaryRecord;
        Relationships: [];
      };
    };
  };
};

const pageSize = 25;
const movementHistoryLimit = 300;

export async function getMaintenanceStockPage({
  filters,
}: {
  filters: MaintenanceStockFilters;
}): Promise<
  | {
      status: "success";
      rows: MaintenanceStockRow[];
      movements: MaintenanceStockMovement[];
      allocations: MaintenanceStockAllocation[];
      allocationMovements: MaintenanceStockAllocationMovement[];
      allocationOrganizationOptions: MaintenanceStockAllocationOrganizationOption[];
      summary: MaintenanceStockSummary;
      organizations: MaintenanceStockOrganizationOption[];
      providers: MaintenanceStockProviderOption[];
      page: number;
      totalPages: number;
      totalRows: number;
      selectedCategory: "all" | MaintenanceStockCategory;
      selectedStatus: "active" | "archived" | "low_stock" | "out_of_stock";
    }
  | { status: "unauthorized" | "load_error"; rows: [] }
> {
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return { status: "unauthorized", rows: [] };
  }

  const accessible = await getAccessibleOrganizationsForProfile(
    admin.supabase,
    admin.profile,
  );

  if (accessible.status !== "success") {
    return { status: "load_error", rows: [] };
  }

  const organizations = accessible.organizations
    .filter(
      (organization) =>
        organization.permissionKeys.includes("maintenance_materials.view") ||
        organization.permissionKeys.includes("maintenance_materials.manage"),
    )
    .map((organization) => ({
      id: organization.id,
      name: organization.name,
      code: organization.code,
      canManage: organization.permissionKeys.includes("maintenance_materials.manage"),
    }));

  if (organizations.length === 0) {
    return { status: "unauthorized", rows: [] };
  }

  const organizationIds = organizations.map((organization) => organization.id);
  const selectedOrganizationId = organizationIds.includes(filters.organizationId ?? "")
    ? filters.organizationId
    : undefined;
  const selectedCategory = normalizeCategory(filters.category);
  const selectedStatus = normalizeStatus(filters.status);
  const page = normalizePage(filters.page);
  const supabase = admin.supabase as SupabaseClient<MaintenanceStockDatabase>;

  const [itemsResult, summaryResult, providers] = await Promise.all([
    loadStockItems({
      supabase,
      organizationIds,
      filters,
      selectedOrganizationId,
      selectedCategory,
      selectedStatus,
      page,
    }),
    loadSummary({ supabase, organizationIds, filters, selectedOrganizationId }),
    loadProviders(supabase, organizationIds),
  ]);

  if (itemsResult.status !== "success" || summaryResult.status !== "success") {
    return { status: "load_error", rows: [] };
  }

  const itemIds = itemsResult.items.map((item) => item.id);
  const [summaries, allocationSummaries, allocations, movements, allocationMovements] =
    await Promise.all([
    loadItemSummaries(supabase, itemIds),
    loadAllocationSummaries(supabase, itemIds),
    loadAllocations(supabase, itemIds, organizations),
    loadMovements(supabase, itemIds),
    loadAllocationMovements(supabase, itemIds, organizations),
  ]);
  const rows = enrichRows({
    items: itemsResult.items,
    itemSummaries: summaries,
    allocationSummaries,
    organizations,
    providers,
  });
  const allocationOrganizationOptions = buildAllocationOrganizationOptions({
    items: itemsResult.items,
    organizations,
    providers,
  });

  return {
    status: "success",
    rows,
    movements,
    allocations,
    allocationMovements,
    allocationOrganizationOptions,
    summary: summaryResult.summary,
    organizations,
    providers,
    page,
    totalRows: itemsResult.totalRows,
    totalPages: Math.max(1, Math.ceil(itemsResult.totalRows / pageSize)),
    selectedCategory,
    selectedStatus,
  };
}

async function loadStockItems({
  supabase,
  organizationIds,
  filters,
  selectedOrganizationId,
  selectedCategory,
  selectedStatus,
  page,
}: {
  supabase: SupabaseClient<MaintenanceStockDatabase>;
  organizationIds: string[];
  filters: MaintenanceStockFilters;
  selectedOrganizationId: string | undefined;
  selectedCategory: "all" | MaintenanceStockCategory;
  selectedStatus: "active" | "archived" | "low_stock" | "out_of_stock";
  page: number;
}) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let query = applyItemFilters(
    supabase
      .from("maintenance_stock_items_overview")
      .select(
        "id, organization_id, provider_id, item_name, category, unit, sku, minimum_quantity, current_quantity, is_active, archived_at, created_at, updated_at, is_out_of_stock, is_low_stock",
        { count: "exact" },
      )
      .order("updated_at", { ascending: false }),
    {
      organizationIds,
      filters,
      selectedOrganizationId,
      selectedCategory,
      selectedStatus,
    },
  );

  query = query.range(from, to);
  const { data, error, count } = await query;

  if (error) {
    return { status: "load_error" as const, items: [], totalRows: 0 };
  }

  return {
    status: "success" as const,
    items: (data ?? []) as StockItemRecord[],
    totalRows: count ?? 0,
  };
}

async function loadSummary({
  supabase,
  organizationIds,
  filters,
  selectedOrganizationId,
}: {
  supabase: SupabaseClient<MaintenanceStockDatabase>;
  organizationIds: string[];
  filters: MaintenanceStockFilters;
  selectedOrganizationId: string | undefined;
}) {
  const countFor = (status: "all" | "active" | "archived" | "low_stock" | "out_of_stock") =>
    applyItemFilters(
      supabase
        .from("maintenance_stock_items_overview")
        .select("id", { count: "exact", head: true }),
      {
        organizationIds,
        filters: { ...filters, status: undefined },
        selectedOrganizationId,
        selectedCategory: "all",
        selectedStatus: status === "all" ? "active" : status,
        forceAll: status === "all",
      },
    );

  const [all, archived] = await Promise.all([
    countFor("all"),
    countFor("archived"),
  ]);

  const results = [all, archived];
  if (results.some((result) => result.error)) {
    return { status: "load_error" as const, summary: emptySummary() };
  }

  const quantitiesResult = await loadSummaryQuantities({
    supabase,
    organizationIds,
    filters,
    selectedOrganizationId,
  });

  if (quantitiesResult.status !== "success") {
    return { status: "load_error" as const, summary: emptySummary() };
  }

  return {
    status: "success" as const,
    summary: {
      totalItems: all.count ?? 0,
      physicalQuantity: quantitiesResult.physicalQuantity,
      allocatedQuantity: quantitiesResult.allocatedQuantity,
      unallocatedQuantity: quantitiesResult.unallocatedQuantity,
      lowOrOutItems: quantitiesResult.lowOrOutItems,
      archivedItems: archived.count ?? 0,
    },
  };
}

async function loadSummaryQuantities({
  supabase,
  organizationIds,
  filters,
  selectedOrganizationId,
}: {
  supabase: SupabaseClient<MaintenanceStockDatabase>;
  organizationIds: string[];
  filters: MaintenanceStockFilters;
  selectedOrganizationId: string | undefined;
}) {
  const query = applyItemFilters(
    supabase
      .from("maintenance_stock_items_overview")
      .select("id, current_quantity, is_low_stock, is_out_of_stock"),
    {
      organizationIds,
      filters: { ...filters, status: undefined },
      selectedOrganizationId,
      selectedCategory: "all",
      selectedStatus: "active",
    },
  );

  const { data, error } = await query;
  if (error) {
    return { status: "load_error" as const };
  }

  const items = (data ?? []) as Pick<
    StockItemRecord,
    "id" | "current_quantity" | "is_low_stock" | "is_out_of_stock"
  >[];
  const itemIds = items.map((item) => item.id);
  const allocationSummaries = await loadAllocationSummaries(supabase, itemIds);
  const physicalQuantity = items.reduce(
    (total, item) => total + Number(item.current_quantity),
    0,
  );
  const allocatedQuantity = itemIds.reduce(
    (total, itemId) =>
      total + Number(allocationSummaries.get(itemId)?.allocated_quantity ?? 0),
    0,
  );

  return {
    status: "success" as const,
    physicalQuantity,
    allocatedQuantity,
    unallocatedQuantity: physicalQuantity - allocatedQuantity,
    lowOrOutItems: items.filter((item) => item.is_low_stock || item.is_out_of_stock)
      .length,
  };
}

function applyItemFilters<Query>(
  query: Query,
  {
    organizationIds,
    filters,
    selectedOrganizationId,
    selectedCategory,
    selectedStatus,
    forceAll = false,
  }: {
    organizationIds: string[];
    filters: MaintenanceStockFilters;
    selectedOrganizationId: string | undefined;
    selectedCategory: "all" | MaintenanceStockCategory;
    selectedStatus: "active" | "archived" | "low_stock" | "out_of_stock";
    forceAll?: boolean;
  },
) {
  let filtered = query as Query & {
    in: (column: string, values: string[]) => typeof filtered;
    eq: (column: string, value: string | boolean | number) => typeof filtered;
    is: (column: string, value: null) => typeof filtered;
    not: (column: string, operator: string, value: string) => typeof filtered;
    ilike: (column: string, value: string) => typeof filtered;
  };

  filtered = filtered.in(
    "organization_id",
    selectedOrganizationId ? [selectedOrganizationId] : organizationIds,
  );

  if (filters.providerId) {
    filtered = filtered.eq("provider_id", filters.providerId);
  }

  if (selectedCategory !== "all") {
    filtered = filtered.eq("category", selectedCategory);
  }

  if (!forceAll) {
    if (selectedStatus === "archived") {
      filtered = filtered.not("archived_at", "is", "null");
    } else {
      filtered = filtered.is("archived_at", null).eq("is_active", true);

      if (selectedStatus === "out_of_stock") {
        filtered = filtered.eq("is_out_of_stock", true);
      } else if (selectedStatus === "low_stock") {
        filtered = filtered.eq("is_low_stock", true);
      }
    }
  }

  const search = filters.search?.trim();
  if (search) {
    filtered = filtered.ilike("item_name", `%${escapeIlike(search)}%`);
  }

  return filtered;
}

async function loadProviders(
  supabase: SupabaseClient<MaintenanceStockDatabase>,
  organizationIds: string[],
): Promise<MaintenanceStockProviderOption[]> {
  const { data: mappings, error: mappingsError } = await supabase
    .from("maintenance_provider_organizations")
    .select("provider_id, organization_id, is_active")
    .in("organization_id", organizationIds)
    .eq("is_active", true);

  if (mappingsError || !mappings || mappings.length === 0) {
    return [];
  }

  const providerIds = Array.from(new Set(mappings.map((mapping) => mapping.provider_id)));
  const { data: providers, error } = await supabase
    .from("maintenance_providers")
    .select("id, name, code, is_active")
    .in("id", providerIds)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) return [];

  const providersById = new Map((providers ?? []).map((provider) => [provider.id, provider]));

  return mappings
    .map((mapping) => {
      const provider = providersById.get(mapping.provider_id);
      if (!provider) return null;

      return {
        id: provider.id,
        organizationId: mapping.organization_id,
        name: provider.name,
        code: provider.code,
      };
    })
    .filter((provider): provider is MaintenanceStockProviderOption => Boolean(provider));
}

async function loadItemSummaries(
  supabase: SupabaseClient<MaintenanceStockDatabase>,
  itemIds: string[],
) {
  const summaries = new Map<string, StockSummaryRecord>();
  if (itemIds.length === 0) return summaries;

  const { data } = await supabase
    .from("maintenance_stock_item_summaries")
    .select(
      "stock_item_id, total_added, total_consumed, total_returned, total_adjusted_out, last_movement_at, movement_count",
    )
    .in("stock_item_id", itemIds);

  for (const summary of data ?? []) {
    summaries.set(summary.stock_item_id, summary as StockSummaryRecord);
  }

  return summaries;
}

async function loadAllocationSummaries(
  supabase: SupabaseClient<MaintenanceStockDatabase>,
  itemIds: string[],
) {
  const summaries = new Map<string, AllocationSummaryRecord>();
  if (itemIds.length === 0) return summaries;

  const { data } = await supabase
    .from("maintenance_stock_allocation_summaries")
    .select("stock_item_id, allocated_quantity, unallocated_quantity")
    .in("stock_item_id", itemIds);

  for (const summary of data ?? []) {
    summaries.set(summary.stock_item_id, summary as AllocationSummaryRecord);
  }

  return summaries;
}

async function loadAllocations(
  supabase: SupabaseClient<MaintenanceStockDatabase>,
  itemIds: string[],
  organizations: MaintenanceStockOrganizationOption[],
): Promise<MaintenanceStockAllocation[]> {
  if (itemIds.length === 0) return [];

  const { data } = await supabase
    .from("maintenance_stock_allocations")
    .select("id, stock_item_id, organization_id, provider_id, available_quantity, is_active, archived_at")
    .in("stock_item_id", itemIds)
    .eq("is_active", true)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });

  const organizationsById = new Map(
    organizations.map((organization) => [organization.id, organization]),
  );

  return ((data ?? []) as AllocationRecord[]).map((allocation) => {
    const organization = organizationsById.get(allocation.organization_id);

    return {
      id: allocation.id,
      stockItemId: allocation.stock_item_id,
      organizationId: allocation.organization_id,
      providerId: allocation.provider_id,
      availableQuantity: Number(allocation.available_quantity),
      organizationName: organization?.name ?? null,
      organizationCode: organization?.code ?? null,
    };
  });
}

async function loadMovements(
  supabase: SupabaseClient<MaintenanceStockDatabase>,
  itemIds: string[],
): Promise<MaintenanceStockMovement[]> {
  if (itemIds.length === 0) return [];

  const { data } = await supabase
    .from("maintenance_stock_movements")
    .select(
      "id, stock_item_id, organization_id, provider_id, maintenance_job_id, movement_type, quantity, quantity_delta, quantity_before, quantity_after, note, created_at, created_by",
    )
    .in("stock_item_id", itemIds)
    .order("created_at", { ascending: false })
    .limit(movementHistoryLimit);

  const movements = (data ?? []) as StockMovementRecord[];
  const actorIds = Array.from(new Set(movements.map((movement) => movement.created_by)));
  const jobIds = Array.from(
    new Set(
      movements
        .map((movement) => movement.maintenance_job_id)
        .filter((jobId): jobId is string => Boolean(jobId)),
    ),
  );
  const [profiles, jobs] = await Promise.all([
    loadProfiles(supabase, actorIds),
    loadJobs(supabase, jobIds),
  ]);

  return movements.map((movement) => ({
    id: movement.id,
    stockItemId: movement.stock_item_id,
    organizationId: movement.organization_id,
    providerId: movement.provider_id,
    maintenanceJobId: movement.maintenance_job_id,
    movementType: movement.movement_type,
    quantity: Number(movement.quantity),
    quantityDelta: Number(movement.quantity_delta),
    quantityBefore: Number(movement.quantity_before),
    quantityAfter: Number(movement.quantity_after),
    note: movement.note,
    createdAt: movement.created_at,
    createdBy: movement.created_by,
    actorName: profiles.get(movement.created_by)?.full_name ?? null,
    jobLabel: movement.maintenance_job_id
      ? formatJobLabel(jobs.get(movement.maintenance_job_id) ?? null)
      : null,
  }));
}

async function loadAllocationMovements(
  supabase: SupabaseClient<MaintenanceStockDatabase>,
  itemIds: string[],
  organizations: MaintenanceStockOrganizationOption[],
): Promise<MaintenanceStockAllocationMovement[]> {
  if (itemIds.length === 0) return [];

  const { data } = await supabase
    .from("maintenance_stock_allocation_movements")
    .select(
      "id, allocation_id, stock_item_id, organization_id, provider_id, movement_type, quantity, quantity_delta, quantity_before, quantity_after, note, maintenance_job_id, maintenance_job_material_id, created_at, created_by",
    )
    .in("stock_item_id", itemIds)
    .order("created_at", { ascending: false })
    .limit(movementHistoryLimit);

  const movements = (data ?? []) as AllocationMovementRecord[];
  const actorIds = Array.from(new Set(movements.map((movement) => movement.created_by)));
  const jobIds = Array.from(
    new Set(
      movements
        .map((movement) => movement.maintenance_job_id)
        .filter((jobId): jobId is string => Boolean(jobId)),
    ),
  );
  const organizationsById = new Map(
    organizations.map((organization) => [organization.id, organization]),
  );
  const [profiles, jobs] = await Promise.all([
    loadProfiles(supabase, actorIds),
    loadJobs(supabase, jobIds),
  ]);

  return movements.map((movement) => {
    const organization = organizationsById.get(movement.organization_id);

    return {
      id: movement.id,
      allocationId: movement.allocation_id,
      stockItemId: movement.stock_item_id,
      organizationId: movement.organization_id,
      providerId: movement.provider_id,
      movementType: movement.movement_type,
      quantity: Number(movement.quantity),
      quantityDelta: Number(movement.quantity_delta),
      quantityBefore: Number(movement.quantity_before),
      quantityAfter: Number(movement.quantity_after),
      note: movement.note,
      maintenanceJobId: movement.maintenance_job_id,
      maintenanceJobMaterialId: movement.maintenance_job_material_id,
      createdAt: movement.created_at,
      createdBy: movement.created_by,
      actorName: profiles.get(movement.created_by)?.full_name ?? null,
      jobLabel: movement.maintenance_job_id
        ? formatJobLabel(jobs.get(movement.maintenance_job_id) ?? null)
        : null,
      organizationName: organization?.name ?? null,
      organizationCode: organization?.code ?? null,
    };
  });
}

async function loadProfiles(
  supabase: SupabaseClient<MaintenanceStockDatabase>,
  actorIds: string[],
) {
  const profiles = new Map<string, ProfileRecord>();
  if (actorIds.length === 0) return profiles;

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", actorIds);

  for (const profile of data ?? []) {
    profiles.set(profile.id, profile);
  }

  return profiles;
}

async function loadJobs(
  supabase: SupabaseClient<MaintenanceStockDatabase>,
  jobIds: string[],
) {
  const jobs = new Map<string, JobRecord>();
  if (jobIds.length === 0) return jobs;

  const { data } = await supabase
    .from("maintenance_jobs")
    .select("id, job_type, driver_name_snapshot, vehicle_plate_snapshot")
    .in("id", jobIds);

  for (const job of data ?? []) {
    jobs.set(job.id, job);
  }

  return jobs;
}

function enrichRows({
  items,
  itemSummaries,
  allocationSummaries,
  organizations,
  providers,
}: {
  items: StockItemRecord[];
  itemSummaries: Map<string, StockSummaryRecord>;
  allocationSummaries: Map<string, AllocationSummaryRecord>;
  organizations: MaintenanceStockOrganizationOption[];
  providers: MaintenanceStockProviderOption[];
}): MaintenanceStockRow[] {
  const organizationsById = new Map(
    organizations.map((organization) => [organization.id, organization]),
  );
  const providersByKey = new Map(
    providers.map((provider) => [`${provider.organizationId}:${provider.id}`, provider]),
  );

  return items.map((item) => {
    const organization = organizationsById.get(item.organization_id);
    const provider = providersByKey.get(`${item.organization_id}:${item.provider_id}`);
    const summary = itemSummaries.get(item.id);
    const allocationSummary = allocationSummaries.get(item.id);
    const currentQuantity = Number(item.current_quantity);
    const allocatedQuantity = Number(allocationSummary?.allocated_quantity ?? 0);

    return {
      id: item.id,
      organizationId: item.organization_id,
      providerId: item.provider_id,
      itemName: item.item_name,
      category: item.category,
      unit: item.unit,
      sku: item.sku,
      minimumQuantity:
        item.minimum_quantity === null ? null : Number(item.minimum_quantity),
      currentQuantity,
      isActive: item.is_active,
      archivedAt: item.archived_at,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      organizationName: organization?.name ?? null,
      organizationCode: organization?.code ?? null,
      providerName: provider?.name ?? null,
      providerCode: provider?.code ?? null,
      allocatedQuantity,
      unallocatedQuantity:
        allocationSummary === undefined
          ? currentQuantity
          : Number(allocationSummary.unallocated_quantity),
      totalAdded: Number(summary?.total_added ?? 0),
      totalConsumed: Number(summary?.total_consumed ?? 0),
      totalReturned: Number(summary?.total_returned ?? 0),
      totalAdjustedOut: Number(summary?.total_adjusted_out ?? 0),
      lastMovementAt: summary?.last_movement_at ?? null,
      movementCount: Number(summary?.movement_count ?? 0),
      canManage: organization?.canManage ?? false,
    };
  });
}

function buildAllocationOrganizationOptions({
  items,
  organizations,
  providers,
}: {
  items: StockItemRecord[];
  organizations: MaintenanceStockOrganizationOption[];
  providers: MaintenanceStockProviderOption[];
}): MaintenanceStockAllocationOrganizationOption[] {
  const pageItemIds = new Set(items.map((item) => item.id));
  const manageableOrganizations = new Map(
    organizations
      .filter((organization) => organization.canManage)
      .map((organization) => [organization.id, organization]),
  );
  const itemProviderById = new Map(items.map((item) => [item.id, item.provider_id]));
  const options: MaintenanceStockAllocationOrganizationOption[] = [];
  const seen = new Set<string>();

  for (const itemId of pageItemIds) {
    const providerId = itemProviderById.get(itemId);
    if (!providerId) continue;

    for (const provider of providers) {
      if (provider.id !== providerId) continue;

      const organization = manageableOrganizations.get(provider.organizationId);
      if (!organization) continue;

      const key = `${itemId}:${organization.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      options.push({
        id: organization.id,
        stockItemId: itemId,
        name: organization.name,
        code: organization.code,
      });
    }
  }

  return options;
}

function formatJobLabel(job: JobRecord | null) {
  if (!job) return null;

  return [
    job.job_type === "oil_change" ? "Oil change" : "Maintenance",
    job.vehicle_plate_snapshot,
    job.driver_name_snapshot,
  ]
    .filter(Boolean)
    .join(" - ");
}

function normalizeCategory(value: string | undefined) {
  if (value === "oil" || value === "spare_part" || value === "material") {
    return value;
  }

  return "all";
}

function normalizeStatus(value: string | undefined) {
  if (
    value === "archived" ||
    value === "low_stock" ||
    value === "out_of_stock"
  ) {
    return value;
  }

  return "active";
}

function normalizePage(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function emptySummary(): MaintenanceStockSummary {
  return {
    totalItems: 0,
    physicalQuantity: 0,
    allocatedQuantity: 0,
    unallocatedQuantity: 0,
    lowOrOutItems: 0,
    archivedItems: 0,
  };
}

function escapeIlike(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}
