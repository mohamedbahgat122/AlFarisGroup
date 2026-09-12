import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { getAccessibleOrganizationsForProfile } from "@/features/organizations/queries";
import type {
  MaintenanceInventoryCategory,
  MaintenanceInventoryFilters,
  MaintenanceInventoryJobOption,
  MaintenanceInventoryJobStatus,
  MaintenanceInventoryOrganizationOption,
  MaintenanceInventoryProviderOption,
  MaintenanceInventoryRecordType,
  MaintenanceInventoryRow,
  MaintenanceInventorySummary,
  MaintenanceInventoryUnit,
} from "@/features/maintenance-inventory/types";
import type { Database } from "@/types/database";

type InventoryRecord = {
  id: string;
  organization_id: string;
  provider_id: string;
  maintenance_job_id: string | null;
  item_name: string;
  category: MaintenanceInventoryCategory;
  record_type: MaintenanceInventoryRecordType;
  quantity: number;
  unit: MaintenanceInventoryUnit;
  note: string | null;
  created_at: string;
  updated_at: string;
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

type JobRecord = {
  id: string;
  organization_id: string;
  provider_id: string;
  status: MaintenanceInventoryJobStatus;
  job_type: "maintenance" | "oil_change";
  driver_name_snapshot: string | null;
  vehicle_plate_snapshot: string | null;
  assigned_at: string | null;
};

type MaintenanceInventoryDatabase = Database & {
  public: Database["public"] & {
    Tables: Database["public"]["Tables"] & {
      maintenance_inventory_records: {
        Row: InventoryRecord & { deleted_at: string | null };
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
      maintenance_jobs: {
        Row: JobRecord;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
  };
};

const pageSize = 25;

export async function getMaintenanceInventoryPage({
  filters,
}: {
  filters: MaintenanceInventoryFilters;
}): Promise<
  | {
      status: "success";
      rows: MaintenanceInventoryRow[];
      summary: MaintenanceInventorySummary;
      organizations: MaintenanceInventoryOrganizationOption[];
      providers: MaintenanceInventoryProviderOption[];
      jobs: MaintenanceInventoryJobOption[];
      page: number;
      totalPages: number;
      totalRows: number;
      selectedCategory: "all" | "oil" | "spare_part" | "material" | "returns";
      selectedRecordType: "all" | MaintenanceInventoryRecordType;
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
  const page = normalizePage(filters.page);
  const selectedCategory = normalizeCategory(filters.category);
  const selectedRecordType = normalizeRecordType(filters.recordType);
  const supabase = admin.supabase as SupabaseClient<MaintenanceInventoryDatabase>;

  const [recordsResult, summary, providers, jobs] = await Promise.all([
    loadInventoryRecords({
      supabase,
      organizationIds,
      filters,
      selectedOrganizationId,
      selectedCategory,
      selectedRecordType,
      page,
    }),
    loadSummary({
      supabase,
      organizationIds,
      filters,
      selectedOrganizationId,
      selectedRecordType,
    }),
    loadProviders(supabase, organizationIds),
    loadJobs(supabase, organizationIds),
  ]);

  if (recordsResult.status !== "success" || summary.status !== "success") {
    return { status: "load_error", rows: [] };
  }

  const rows = enrichRows({
    records: recordsResult.records,
    organizations,
    providers,
    jobs,
  });

  return {
    status: "success",
    rows,
    summary: summary.summary,
    organizations,
    providers,
    jobs,
    page,
    totalRows: recordsResult.totalRows,
    totalPages: Math.max(1, Math.ceil(recordsResult.totalRows / pageSize)),
    selectedCategory,
    selectedRecordType,
  };
}

async function loadInventoryRecords({
  supabase,
  organizationIds,
  filters,
  selectedOrganizationId,
  selectedCategory,
  selectedRecordType,
  page,
}: {
  supabase: SupabaseClient<MaintenanceInventoryDatabase>;
  organizationIds: string[];
  filters: MaintenanceInventoryFilters;
  selectedOrganizationId: string | undefined;
  selectedCategory: "all" | "oil" | "spare_part" | "material" | "returns";
  selectedRecordType: "all" | MaintenanceInventoryRecordType;
  page: number;
}) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let query = applyInventoryFilters(
    supabase
      .from("maintenance_inventory_records")
      .select(
        "id, organization_id, provider_id, maintenance_job_id, item_name, category, record_type, quantity, unit, note, created_at, updated_at",
        { count: "exact" },
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    {
      organizationIds,
      filters,
      selectedOrganizationId,
      selectedCategory,
      selectedRecordType,
    },
  );

  query = query.range(from, to);
  const { data, error, count } = await query;

  if (error) {
    return { status: "load_error" as const, records: [], totalRows: 0 };
  }

  return {
    status: "success" as const,
    records: (data ?? []) as InventoryRecord[],
    totalRows: count ?? 0,
  };
}

async function loadSummary({
  supabase,
  organizationIds,
  filters,
  selectedOrganizationId,
  selectedRecordType,
}: {
  supabase: SupabaseClient<MaintenanceInventoryDatabase>;
  organizationIds: string[];
  filters: MaintenanceInventoryFilters;
  selectedOrganizationId: string | undefined;
  selectedRecordType: "all" | MaintenanceInventoryRecordType;
}) {
  const countFor = (category: "all" | MaintenanceInventoryCategory | "returns") =>
    applyInventoryFilters(
      supabase
        .from("maintenance_inventory_records")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null),
      {
        organizationIds,
        filters,
        selectedOrganizationId,
        selectedCategory: category,
        selectedRecordType,
      },
    );

  const [total, oil, sparePart, material, returned] = await Promise.all([
    countFor("all"),
    countFor("oil"),
    countFor("spare_part"),
    countFor("material"),
    countFor("returns"),
  ]);

  const results = [total, oil, sparePart, material, returned];
  if (results.some((result) => result.error)) {
    return { status: "load_error" as const, summary: emptySummary() };
  }

  return {
    status: "success" as const,
    summary: {
      totalRows: total.count ?? 0,
      oilRows: oil.count ?? 0,
      sparePartRows: sparePart.count ?? 0,
      materialRows: material.count ?? 0,
      returnedRows: returned.count ?? 0,
    },
  };
}

function applyInventoryFilters<Query>(
  query: Query,
  {
    organizationIds,
    filters,
    selectedOrganizationId,
    selectedCategory,
    selectedRecordType,
  }: {
    organizationIds: string[];
    filters: MaintenanceInventoryFilters;
    selectedOrganizationId: string | undefined;
    selectedCategory: "all" | "oil" | "spare_part" | "material" | "returns";
    selectedRecordType: "all" | MaintenanceInventoryRecordType;
  },
) {
  let filtered = query as Query & {
    in: (column: string, values: string[]) => typeof filtered;
    eq: (column: string, value: string) => typeof filtered;
    ilike: (column: string, value: string) => typeof filtered;
  };

  filtered = filtered.in(
    "organization_id",
    selectedOrganizationId ? [selectedOrganizationId] : organizationIds,
  );

  if (filters.providerId) {
    filtered = filtered.eq("provider_id", filters.providerId);
  }

  if (selectedCategory === "returns") {
    filtered = filtered.eq("record_type", "returned");
  } else if (selectedCategory !== "all") {
    filtered = filtered.eq("category", selectedCategory);
  }

  if (selectedRecordType !== "all" && selectedCategory !== "returns") {
    filtered = filtered.eq("record_type", selectedRecordType);
  }

  const search = filters.search?.trim();
  if (search) {
    filtered = filtered.ilike("item_name", `%${escapeIlike(search)}%`);
  }

  return filtered;
}

async function loadProviders(
  supabase: SupabaseClient<MaintenanceInventoryDatabase>,
  organizationIds: string[],
): Promise<MaintenanceInventoryProviderOption[]> {
  const { data: mappings, error: mappingsError } = await supabase
    .from("maintenance_provider_organizations")
    .select("provider_id, organization_id, is_active")
    .in("organization_id", organizationIds)
    .eq("is_active", true);

  if (mappingsError || !mappings || mappings.length === 0) {
    return [];
  }

  const providerIds = Array.from(
    new Set(mappings.map((mapping) => mapping.provider_id)),
  );
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
    .filter((provider): provider is MaintenanceInventoryProviderOption =>
      Boolean(provider),
    );
}

async function loadJobs(
  supabase: SupabaseClient<MaintenanceInventoryDatabase>,
  organizationIds: string[],
): Promise<MaintenanceInventoryJobOption[]> {
  const { data, error } = await supabase
    .from("maintenance_jobs")
    .select(
      "id, organization_id, provider_id, status, job_type, driver_name_snapshot, vehicle_plate_snapshot, assigned_at",
    )
    .in("organization_id", organizationIds)
    .order("assigned_at", { ascending: false })
    .limit(300);

  if (error) return [];

  return (data ?? []).map((job) => ({
    id: job.id,
    organizationId: job.organization_id,
    providerId: job.provider_id,
    label: formatJobLabel(job),
    status: job.status,
  }));
}

function enrichRows({
  records,
  organizations,
  providers,
  jobs,
}: {
  records: InventoryRecord[];
  organizations: MaintenanceInventoryOrganizationOption[];
  providers: MaintenanceInventoryProviderOption[];
  jobs: MaintenanceInventoryJobOption[];
}): MaintenanceInventoryRow[] {
  const organizationsById = new Map(
    organizations.map((organization) => [organization.id, organization]),
  );
  const providersByKey = new Map(
    providers.map((provider) => [`${provider.organizationId}:${provider.id}`, provider]),
  );
  const jobsById = new Map(jobs.map((job) => [job.id, job]));

  return records.map((record) => {
    const organization = organizationsById.get(record.organization_id);
    const provider = providersByKey.get(`${record.organization_id}:${record.provider_id}`);
    const job = record.maintenance_job_id
      ? jobsById.get(record.maintenance_job_id) ?? null
      : null;

    return {
      id: record.id,
      organizationId: record.organization_id,
      providerId: record.provider_id,
      maintenanceJobId: record.maintenance_job_id,
      itemName: record.item_name,
      category: record.category,
      recordType: record.record_type,
      quantity: Number(record.quantity),
      unit: record.unit,
      note: record.note,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      organizationName: organization?.name ?? null,
      organizationCode: organization?.code ?? null,
      providerName: provider?.name ?? null,
      providerCode: provider?.code ?? null,
      jobLabel: job?.label ?? null,
      jobStatus: job?.status ?? null,
    };
  });
}

function formatJobLabel(job: JobRecord) {
  return [
    job.job_type === "oil_change" ? "Oil change" : "Maintenance",
    job.vehicle_plate_snapshot,
    job.driver_name_snapshot,
  ]
    .filter(Boolean)
    .join(" - ");
}

function normalizeCategory(value: string | undefined) {
  if (
    value === "oil" ||
    value === "spare_part" ||
    value === "material" ||
    value === "returns"
  ) {
    return value;
  }

  return "all";
}

function normalizeRecordType(value: string | undefined) {
  return value === "leftover" || value === "returned" ? value : "all";
}

function normalizePage(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function emptySummary(): MaintenanceInventorySummary {
  return {
    totalRows: 0,
    oilRows: 0,
    sparePartRows: 0,
    materialRows: 0,
    returnedRows: 0,
  };
}

function escapeIlike(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}
