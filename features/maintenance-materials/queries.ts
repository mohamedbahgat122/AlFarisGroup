import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { getAccessibleOrganizationsForProfile } from "@/features/organizations/queries";
import type {
  MaintenanceJobMaterial,
  MaintenanceJobStatus,
  MaintenanceMaterialCategory,
  MaintenanceMaterialRow,
  MaintenanceMaterialsFilters,
  MaintenanceMaterialsSummary,
  MaintenanceMaterialUnit,
} from "@/features/maintenance-materials/types";
import type { Database } from "@/types/database";

type MaterialRecord = {
  id: string;
  maintenance_job_id: string;
  organization_id: string;
  provider_id: string;
  item_name: string;
  category: MaintenanceMaterialCategory;
  unit: MaintenanceMaterialUnit;
  issued_quantity: number;
  used_quantity: number | null;
  returned_quantity: number | null;
  usage_recorded_at: string | null;
  created_at: string;
  updated_at: string;
};

type JobRecord = {
  id: string;
  request_id: string;
  job_type: "maintenance" | "oil_change";
  status: MaintenanceJobStatus;
  driver_name_snapshot: string | null;
  vehicle_plate_snapshot: string | null;
  vehicle_type_snapshot: string | null;
};

type ProviderRecord = {
  id: string;
  name: string;
  code: string;
};

type OrganizationRecord = {
  id: string;
  name: string;
  code: string;
};

type MaintenanceMaterialsDatabase = Database & {
  public: Database["public"] & {
    Tables: Database["public"]["Tables"] & {
      maintenance_job_materials: {
        Row: MaterialRecord;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      maintenance_jobs: {
        Row: JobRecord & {
          organization_id: string;
          provider_id: string;
        };
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
    };
  };
};

type MaintenanceMaterialsLookupDatabase = Database & {
  public: Database["public"] & {
    Tables: Database["public"]["Tables"] & {
      maintenance_job_materials: {
        Row: MaterialRecord;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
  };
};

export async function getMaintenanceMaterialsPage({
  filters,
}: {
  filters: MaintenanceMaterialsFilters;
}): Promise<
  | {
      status: "success";
      rows: MaintenanceMaterialRow[];
      summary: MaintenanceMaterialsSummary;
      organizations: OrganizationRecord[];
      selectedCategory: "all" | "oil" | "spare_part" | "material" | "returns";
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

  const materialOrganizations = accessible.organizations.filter(
    (organization) =>
      organization.permissionKeys.includes("maintenance_materials.view") ||
      organization.permissionKeys.includes("maintenance_materials.manage"),
  );

  if (materialOrganizations.length === 0) {
    return { status: "unauthorized", rows: [] };
  }

  const organizationIds = materialOrganizations.map((organization) => organization.id);
  const selectedOrganizationId = organizationIds.includes(filters.organizationId ?? "")
    ? filters.organizationId
    : undefined;
  const selectedCategory = normalizeCategory(filters.category);
  const supabase = admin.supabase as SupabaseClient<MaintenanceMaterialsDatabase>;
  let query = supabase
    .from("maintenance_job_materials")
    .select(
      "id, maintenance_job_id, organization_id, provider_id, item_name, category, unit, issued_quantity, used_quantity, returned_quantity, usage_recorded_at, created_at, updated_at",
    )
    .in("organization_id", selectedOrganizationId ? [selectedOrganizationId] : organizationIds)
    .order("created_at", { ascending: false })
    .limit(500);

  const search = filters.search?.trim();
  if (search) {
    query = query.ilike("item_name", `%${escapeIlike(search)}%`);
  }

  const { data: materials, error } = await query;

  if (error) {
    return { status: "load_error", rows: [] };
  }

  const rows = await enrichMaterials(
    supabase,
    materials ?? [],
    materialOrganizations,
  );
  const statusFilteredRows = filterByStatus(rows, filters.status);
  const summary = summarizeRows(statusFilteredRows);
  const categoryRows = filterByCategory(statusFilteredRows, selectedCategory);

  return {
    status: "success",
    rows: categoryRows,
    summary,
    organizations: materialOrganizations.map(({ id, name, code }) => ({
      id,
      name,
      code,
    })),
    selectedCategory,
  };
}

export async function getMaintenanceMaterialsForJobIds(
  supabase: SupabaseClient<MaintenanceMaterialsLookupDatabase>,
  jobIds: string[],
): Promise<Map<string, MaintenanceJobMaterial[]>> {
  const grouped = new Map<string, MaintenanceJobMaterial[]>();
  const uniqueJobIds = Array.from(new Set(jobIds));

  if (uniqueJobIds.length === 0) {
    return grouped;
  }

  const { data } = await supabase
    .from("maintenance_job_materials")
    .select(
      "id, maintenance_job_id, organization_id, provider_id, item_name, category, unit, issued_quantity, used_quantity, returned_quantity, usage_recorded_at, created_at, updated_at",
    )
    .in("maintenance_job_id", uniqueJobIds)
    .order("created_at", { ascending: true });

  for (const material of data ?? []) {
    const items = grouped.get(material.maintenance_job_id) ?? [];
    items.push(mapMaterial(material));
    grouped.set(material.maintenance_job_id, items);
  }

  return grouped;
}

async function enrichMaterials(
  supabase: SupabaseClient<MaintenanceMaterialsDatabase>,
  materials: MaterialRecord[],
  organizations: OrganizationRecord[],
): Promise<MaintenanceMaterialRow[]> {
  const jobIds = Array.from(new Set(materials.map((material) => material.maintenance_job_id)));
  const providerIds = Array.from(new Set(materials.map((material) => material.provider_id)));
  const jobsById = new Map<string, JobRecord>();
  const providersById = new Map<string, ProviderRecord>();
  const organizationsById = new Map(organizations.map((organization) => [organization.id, organization]));

  if (jobIds.length > 0) {
    const { data: jobs } = await supabase
      .from("maintenance_jobs")
      .select(
        "id, request_id, job_type, status, driver_name_snapshot, vehicle_plate_snapshot, vehicle_type_snapshot",
      )
      .in("id", jobIds);

    for (const job of jobs ?? []) {
      jobsById.set(job.id, job);
    }
  }

  if (providerIds.length > 0) {
    const { data: providers } = await supabase
      .from("maintenance_providers")
      .select("id, name, code")
      .in("id", providerIds);

    for (const provider of providers ?? []) {
      providersById.set(provider.id, provider);
    }
  }

  return materials.map((material) => {
    const job = jobsById.get(material.maintenance_job_id);
    const provider = providersById.get(material.provider_id);
    const organization = organizationsById.get(material.organization_id);

    return {
      ...mapMaterial(material),
      organizationName: organization?.name ?? null,
      organizationCode: organization?.code ?? null,
      providerName: provider?.name ?? null,
      providerCode: provider?.code ?? null,
      jobType: job?.job_type ?? null,
      jobStatus: job?.status ?? null,
      vehiclePlate: job?.vehicle_plate_snapshot ?? null,
      vehicleType: job?.vehicle_type_snapshot ?? null,
      driverName: job?.driver_name_snapshot ?? null,
      requestId: job?.request_id ?? null,
    };
  });
}

function mapMaterial(material: MaterialRecord): MaintenanceJobMaterial {
  return {
    id: material.id,
    maintenanceJobId: material.maintenance_job_id,
    organizationId: material.organization_id,
    providerId: material.provider_id,
    itemName: material.item_name,
    category: material.category,
    unit: material.unit,
    issuedQuantity: Number(material.issued_quantity),
    usedQuantity:
      material.used_quantity === null ? null : Number(material.used_quantity),
    returnedQuantity:
      material.returned_quantity === null
        ? null
        : Number(material.returned_quantity),
    usageRecordedAt: material.usage_recorded_at,
    createdAt: material.created_at,
    updatedAt: material.updated_at,
  };
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

function filterByStatus(rows: MaintenanceMaterialRow[], status: string | undefined) {
  if (
    status !== "ready" &&
    status !== "in_progress" &&
    status !== "completed" &&
    status !== "cancelled"
  ) {
    return rows;
  }

  return rows.filter((row) => row.jobStatus === status);
}

function filterByCategory(
  rows: MaintenanceMaterialRow[],
  category: "all" | "oil" | "spare_part" | "material" | "returns",
) {
  if (category === "all") return rows;
  if (category === "returns") {
    return rows.filter(
      (row) => row.usedQuantity !== null && (row.returnedQuantity ?? 0) > 0,
    );
  }

  return rows.filter((row) => row.category === category);
}

function summarizeRows(rows: MaintenanceMaterialRow[]): MaintenanceMaterialsSummary {
  return {
    totalRows: rows.length,
    oilRows: rows.filter((row) => row.category === "oil").length,
    sparePartRows: rows.filter((row) => row.category === "spare_part").length,
    materialRows: rows.filter((row) => row.category === "material").length,
    returnedRows: rows.filter(
      (row) => row.usedQuantity !== null && (row.returnedQuantity ?? 0) > 0,
    ).length,
  };
}

function escapeIlike(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}
