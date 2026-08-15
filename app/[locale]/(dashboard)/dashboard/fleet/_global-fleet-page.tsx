import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { GlobalFleetClient } from "@/components/dashboard/fleet/global-fleet-client";
import { getBusinessDateString } from "@/features/drivers/expiry";
import { getGlobalFleetPageData } from "@/features/fleet/queries";
import type {
  FleetArchiveFilter,
  FleetListFilters,
  FleetOperationalStatus,
  FleetTechnicalStatus,
  FleetVehicleCategory,
  FleetOwnershipType,
} from "@/features/fleet/types";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/types/locale";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";

import { getGlobalPermissions } from "@/features/permissions/server";
import type { GlobalPermissionKey } from "@/features/permissions/global-registry";

export async function GlobalFleetPage({
  locale,
  category,
  searchParams,
}: {
  locale: Locale;
  category: FleetVehicleCategory;
  searchParams: Record<string, string | undefined>;
}) {
  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") {
    redirect(`/${locale}/login`);
  }

  const globalPermissions = await getGlobalPermissions(admin.supabase, admin.profile);

  const filters = parseFleetListFilters(searchParams);

  const result = await getGlobalFleetPageData({
    category,
    filters,
  });

  if (result.status === "unauthorized") {
    return <AccessDenied locale={locale} showOrganizationsLink={false} />;
  }

  const dictionary = getDictionary(locale).dashboard.fleet;

  if (result.status === "load_error") {
    return (
      <div className="min-h-full bg-background px-5 py-6 sm:px-7">
        <div className="border border-border bg-surface px-6 py-10 text-center shadow-[0_16px_45px_rgba(16,35,63,0.06)]">
          <h1 className="text-lg font-bold text-navy">
            {dictionary.loadErrorTitle}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            {dictionary.loadErrorDescription}
          </p>
        </div>
      </div>
    );
  }

  const [{ data: orgs }, { data: vehicleTypeRows }] = await Promise.all([
    admin.supabase.from("organizations").select("id, name").order("name", { ascending: true }),
    admin.supabase
      .from("fleet_vehicles")
      .select("vehicle_type")
      .eq("vehicle_category", category)
      .order("vehicle_type", { ascending: true }),
  ]);
  const organizationsMap = (orgs ?? []).reduce((acc, org) => {
    acc[org.id] = org.name;
    return acc;
  }, {} as Record<string, string>);
  const vehicleTypeOptions = Array.from(
    new Set((vehicleTypeRows ?? []).map((row) => row.vehicle_type).filter(Boolean)),
  );
  
  const hasGlobalPermission = (key: GlobalPermissionKey) => globalPermissions.has(key);

  const uiPermissions = {
    create: hasGlobalPermission("fleet.create"),
    update: hasGlobalPermission("fleet.update"),
    technicalStatus: hasGlobalPermission("fleet.technical_status"),
    operationalStatus: hasGlobalPermission("fleet.operational_status"),
    archive: hasGlobalPermission("fleet.archive"),
    activity: hasGlobalPermission("fleet.activity.view"),
    operatingCard: hasGlobalPermission("fleet.operating_card.download"),
  };

  return (
    <GlobalFleetClient
      locale={locale}
      dictionary={dictionary}
      category={category}
      vehicles={result.vehicles}
      drivers={result.drivers}
      summary={result.summary}
      today={getBusinessDateString()}
      filters={filters}
      organizationsMap={organizationsMap}
      vehicleTypeOptions={vehicleTypeOptions}
      permissions={uiPermissions}
    />
  );
}

function parseFleetListFilters(
  searchParams: Record<string, string | undefined>,
): FleetListFilters {
  return {
    search: searchParams.search?.trim() ?? "",
    technicalStatus: parseTechnicalStatus(searchParams.technical),
    operationalStatus: parseOperationalStatus(searchParams.operational),
    assignedOrganizationId: searchParams.organization ?? "",
    vehicleType: searchParams.vehicleType ?? "",
    ownershipType: parseOwnershipType(searchParams.ownership),
    archive: parseArchiveFilter(searchParams.archive, searchParams.archived),
  };
}

function parseTechnicalStatus(value: string | undefined): FleetTechnicalStatus | "all" {
  return value === "healthy" || value === "fault" || value === "accident" ? value : "all";
}

function parseOperationalStatus(value: string | undefined): FleetOperationalStatus | "all" {
  return value === "active" || value === "suspended" ? value : "all";
}

function parseOwnershipType(value: string | undefined): FleetOwnershipType | "all" {
  return value === "company_owned" ||
    value === "rental" ||
    value === "external_office" ||
    value === "individual" ||
    value === "driver_owned" ||
    value === "other"
    ? value
    : "all";
}

function parseArchiveFilter(
  archive: string | undefined,
  legacyArchived: string | undefined,
): FleetArchiveFilter {
  if (archive === "archived" || archive === "all" || archive === "active") {
    return archive;
  }

  return legacyArchived === "true" ? "all" : "active";
}
