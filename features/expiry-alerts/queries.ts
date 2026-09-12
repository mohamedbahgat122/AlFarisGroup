import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getBusinessDateString, getExpiryStatus } from "@/features/drivers/expiry";
import type { AccessibleOrganization } from "@/features/organizations/types";
import { getGlobalPermissions } from "@/features/permissions/server";
import type { Database } from "@/types/database";
import type { Profile } from "@/types/profile";
import type {
  SystemExpiryAlert,
  SystemExpiryAlertDocumentType,
  SystemExpiryAlertsResult,
  SystemExpiryAlertSeverity,
} from "@/features/expiry-alerts/types";

type DriverExpiryRow = Pick<
  Database["public"]["Tables"]["drivers"]["Row"],
  | "id"
  | "organization_id"
  | "full_name"
  | "iqama_number"
  | "iqama_expiry_date"
  | "driving_license_expiry_date"
  | "driver_card_expiry_date"
>;

type FleetExpiryRow = Pick<
  Database["public"]["Tables"]["fleet_vehicles"]["Row"],
  | "id"
  | "vehicle_category"
  | "vehicle_type"
  | "plate_number"
  | "operating_card_expiry_date"
  | "authorization_expiry_date"
  | "assigned_organization_id"
>;

type ExpirySource = {
  documentType: SystemExpiryAlertDocumentType;
  expiryDate: string | null;
};

const emptySummary = {
  expired: 0,
  critical: 0,
  warning: 0,
};

export async function getSystemExpiryAlertsForDashboard({
  supabase,
  profile,
  organizations,
  locale,
  today = getBusinessDateString(),
}: {
  supabase: SupabaseClient<Database>;
  profile: Profile;
  organizations: AccessibleOrganization[];
  locale: "ar" | "en";
  today?: string;
}): Promise<SystemExpiryAlertsResult> {
  const cutoff = addCalendarDays(today, 10);
  const [driverAlerts, fleetAlerts] = await Promise.all([
    getDriverExpiryAlerts({
      supabase,
      organizations,
      locale,
      today,
      cutoff,
    }),
    getFleetExpiryAlerts({
      supabase,
      profile,
      organizations,
      locale,
      today,
      cutoff,
    }),
  ]);

  if (driverAlerts.status === "load_error" || fleetAlerts.status === "load_error") {
    return {
      status: "load_error",
      alerts: [],
      summary: emptySummary,
      totalCount: 0,
      hasExpired: false,
    };
  }

  const alerts = [...driverAlerts.alerts, ...fleetAlerts.alerts].sort(compareAlerts);
  const summary = alerts.reduce(
    (current, alert) => ({
      ...current,
      [alert.severity]: current[alert.severity] + 1,
    }),
    { ...emptySummary },
  );

  return {
    status: "success",
    alerts: alerts.slice(0, 50),
    summary,
    totalCount: alerts.length,
    hasExpired: summary.expired > 0,
  };
}

async function getDriverExpiryAlerts({
  supabase,
  organizations,
  locale,
  today,
  cutoff,
}: {
  supabase: SupabaseClient<Database>;
  organizations: AccessibleOrganization[];
  locale: "ar" | "en";
  today: string;
  cutoff: string;
}): Promise<{ status: "success"; alerts: SystemExpiryAlert[] } | { status: "load_error"; alerts: [] }> {
  const driverOrganizations = organizations.filter((organization) =>
    organization.permissionKeys.includes("drivers.view"),
  );

  if (driverOrganizations.length === 0) {
    return { status: "success", alerts: [] };
  }

  const organizationsById = new Map(
    driverOrganizations.map((organization) => [organization.id, organization]),
  );
  const { data, error } = await supabase
    .from("drivers")
    .select(
      "id, organization_id, full_name, iqama_number, iqama_expiry_date, driving_license_expiry_date, driver_card_expiry_date",
    )
    .in("organization_id", driverOrganizations.map((organization) => organization.id))
    .is("deleted_at", null)
    .or(
      [
        `iqama_expiry_date.lte.${cutoff}`,
        `driving_license_expiry_date.lte.${cutoff}`,
        `driver_card_expiry_date.lte.${cutoff}`,
      ].join(","),
    )
    .order("full_name", { ascending: true });

  if (error) {
    return { status: "load_error", alerts: [] };
  }

  return {
    status: "success",
    alerts: ((data ?? []) as DriverExpiryRow[]).flatMap((driver) => {
      const organization = organizationsById.get(driver.organization_id);
      if (!organization) return [];

      const documents: ExpirySource[] = [
        { documentType: "iqama", expiryDate: driver.iqama_expiry_date },
        { documentType: "driving_license", expiryDate: driver.driving_license_expiry_date },
        { documentType: "driver_card", expiryDate: driver.driver_card_expiry_date },
      ];

      return documents.flatMap((document) => {
        const normalized = normalizeAlertDate({
          expiryDate: document.expiryDate,
          today,
        });
        if (!normalized) return [];

        const documentLabel = getDocumentLabel(document.documentType, locale);
        const href = `/${locale}/dashboard/organizations/${organization.code}/drivers?driver=${encodeURIComponent(driver.id)}&alert=${encodeURIComponent(document.documentType)}`;

        return [
          {
            id: `driver:${driver.id}:${document.documentType}:${document.expiryDate}`,
            sourceType: "driver" as const,
            documentType: document.documentType,
            entityId: driver.id,
            organizationId: driver.organization_id,
            organizationName: organization.name,
            title: `${documentLabel} ${driver.full_name}`,
            subtitle: organization.name,
            expiryDate: normalized.expiryDate,
            daysRemaining: normalized.daysRemaining,
            severity: normalized.severity,
            href,
          },
        ];
      });
    }),
  };
}

async function getFleetExpiryAlerts({
  supabase,
  profile,
  organizations,
  locale,
  today,
  cutoff,
}: {
  supabase: SupabaseClient<Database>;
  profile: Profile;
  organizations: AccessibleOrganization[];
  locale: "ar" | "en";
  today: string;
  cutoff: string;
}): Promise<{ status: "success"; alerts: SystemExpiryAlert[] } | { status: "load_error"; alerts: [] }> {
  const globalPermissions = await getGlobalPermissions(supabase, profile);
  if (profile.role !== "system_owner" && !globalPermissions.has("fleet.view")) {
    return { status: "success", alerts: [] };
  }

  const organizationsById = new Map(
    organizations.map((organization) => [organization.id, organization.name]),
  );
  const { data, error } = await supabase
    .from("fleet_vehicles")
    .select(
      "id, vehicle_category, vehicle_type, plate_number, operating_card_expiry_date, authorization_expiry_date, assigned_organization_id",
    )
    .is("archived_at", null)
    .or(
      [
        `operating_card_expiry_date.lte.${cutoff}`,
        `authorization_expiry_date.lte.${cutoff}`,
      ].join(","),
    )
    .order("plate_number", { ascending: true });

  if (error) {
    return { status: "load_error", alerts: [] };
  }

  return {
    status: "success",
    alerts: ((data ?? []) as FleetExpiryRow[]).flatMap((vehicle) => {
      const documents: ExpirySource[] = [
        { documentType: "fleet_operating_card", expiryDate: vehicle.operating_card_expiry_date },
        { documentType: "fleet_authorization", expiryDate: vehicle.authorization_expiry_date },
      ];
      const vehiclePath = vehicle.vehicle_category === "motorcycle" ? "motorcycles" : "cars";
      const organizationName = vehicle.assigned_organization_id
        ? organizationsById.get(vehicle.assigned_organization_id) ?? null
        : null;

      return documents.flatMap((document) => {
        const normalized = normalizeAlertDate({
          expiryDate: document.expiryDate,
          today,
        });
        if (!normalized) return [];

        const documentLabel = getDocumentLabel(document.documentType, locale);
        const href = `/${locale}/dashboard/fleet/${vehiclePath}?search=${encodeURIComponent(vehicle.plate_number)}&alert=${encodeURIComponent(document.documentType)}&entityId=${encodeURIComponent(vehicle.id)}`;

        return [
          {
            id: `fleet_vehicle:${vehicle.id}:${document.documentType}:${document.expiryDate}`,
            sourceType: "fleet_vehicle" as const,
            documentType: document.documentType,
            entityId: vehicle.id,
            organizationId: vehicle.assigned_organization_id,
            organizationName,
            title: `${documentLabel} ${vehicle.plate_number}`,
            subtitle: vehicle.vehicle_type,
            expiryDate: normalized.expiryDate,
            daysRemaining: normalized.daysRemaining,
            severity: normalized.severity,
            href,
          },
        ];
      });
    }),
  };
}

function normalizeAlertDate({
  expiryDate,
  today,
}: {
  expiryDate: string | null;
  today: string;
}) {
  if (!expiryDate) {
    return null;
  }

  const status = getExpiryStatus(expiryDate, today);
  const daysRemaining = status.state === "expired" ? -status.days : status.days;
  if (daysRemaining > 10) {
    return null;
  }

  return {
    expiryDate,
    daysRemaining,
    severity: getSeverity(daysRemaining),
  };
}

function getSeverity(daysRemaining: number): SystemExpiryAlertSeverity {
  if (daysRemaining < 0) {
    return "expired";
  }

  if (daysRemaining <= 3) {
    return "critical";
  }

  return "warning";
}

function compareAlerts(first: SystemExpiryAlert, second: SystemExpiryAlert) {
  if (first.daysRemaining !== second.daysRemaining) {
    return first.daysRemaining - second.daysRemaining;
  }

  return first.title.localeCompare(second.title, ["ar", "en"], {
    sensitivity: "base",
  });
}

function addCalendarDays(dateString: string, days: number) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getDocumentLabel(
  documentType: SystemExpiryAlertDocumentType,
  locale: "ar" | "en",
) {
  const labels = locale === "ar"
    ? {
        iqama: "الإقامة",
        driving_license: "رخصة القيادة",
        driver_card: "بطاقة السائق",
        vehicle_authorization: "تفويض السيارة",
        driver_operating_card: "كرت التشغيل",
        fleet_operating_card: "كرت التشغيل",
        fleet_authorization: "تفويض المركبة",
      }
    : {
        iqama: "Iqama",
        driving_license: "Driving license",
        driver_card: "Driver card",
        vehicle_authorization: "Vehicle authorization",
        driver_operating_card: "Operating card",
        fleet_operating_card: "Operating card",
        fleet_authorization: "Vehicle authorization",
      };

  return labels[documentType];
}
