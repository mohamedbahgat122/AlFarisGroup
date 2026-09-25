import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getBusinessDateString, getExpiryStatus } from "@/features/drivers/expiry";
import type { AccessibleOrganization } from "@/features/organizations/types";
import { canViewRequestType } from "@/features/app-requests/authorization";
import type { DriverAppRequestType } from "@/features/app-requests/types";
import type { Database } from "@/types/database";
import { parseNotificationMetadata } from "@/features/notifications/types";
import type {
  AppNotification,
  DriverExpiryAlert,
  DriverExpiryDocumentType,
  DriverExpiryAlertSeverity,
} from "@/features/notifications/types";

type DriverExpirySourceRow = Pick<
  Database["public"]["Tables"]["drivers"]["Row"],
  | "id"
  | "organization_id"
  | "full_name"
  | "status"
  | "iqama_expiry_date"
  | "driving_license_expiry_date"
  | "driver_card_expiry_date"
> & {
  fleet_vehicles: {
    authorization_expiry_date: string | null;
    operating_card_expiry_date: string | null;
  } | null;
};

type DocumentSource = {
  documentType: DriverExpiryDocumentType;
  expiryDate: string | null;
};

type AppNotificationRow = Pick<
  Database["public"]["Tables"]["app_notifications"]["Row"],
  | "id"
  | "type"
  | "title"
  | "message"
  | "metadata"
  | "entity_type"
  | "entity_id"
  | "organization_id"
  | "is_read"
  | "read_at"
  | "created_at"
>;

type RequestRow = Pick<
  Database["public"]["Tables"]["driver_app_requests"]["Row"],
  "id" | "request_type" | "status" | "driver_id"
>;

type MaintenanceJobRow = {
  id: string;
  request_id: string;
  job_type: "maintenance" | "oil_change";
};

type NotificationDatabase = Database & {
  public: Database["public"] & {
    Tables: Database["public"]["Tables"] & {
      maintenance_jobs: {
        Row: MaintenanceJobRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
  };
};

type DriverRow = Pick<
  Database["public"]["Tables"]["drivers"]["Row"],
  "id" | "full_name"
>;

export async function getDriverExpiryAlertsForOrganizations({
  supabase,
  organizations,
  today = getBusinessDateString(),
}: {
  supabase: SupabaseClient<Database>;
  organizations: AccessibleOrganization[];
  today?: string;
}): Promise<DriverExpiryAlert[]> {
  if (organizations.length === 0) {
    return [];
  }

  const organizationsById = new Map(
    organizations.map((organization) => [organization.id, organization]),
  );

  const { data, error } = await supabase
    .from("drivers")
    .select(
      `
      id,
      organization_id,
      full_name,
      status,
      iqama_expiry_date,
      driving_license_expiry_date,
      driver_card_expiry_date,
      fleet_vehicles(authorization_expiry_date, operating_card_expiry_date)
    `,
    )
    .in("organization_id", organizations.map((organization) => organization.id))
    .is("deleted_at", null)
    .order("full_name", { ascending: true });

  if (error) {
    return [];
  }

  const alerts = (data ?? []).flatMap((driver) =>
    buildDriverAlerts(driver as DriverExpirySourceRow, organizationsById, today),
  );

  return alerts.sort(compareDriverExpiryAlerts);
}

export async function getAppNotificationsForCurrentUser({
  supabase,
  organizations,
  recipientUserId,
  limit = 20,
}: {
  supabase: SupabaseClient<Database>;
  organizations: AccessibleOrganization[];
  recipientUserId: string;
  limit?: number;
}): Promise<
  | {
      status: "success";
      notifications: AppNotification[];
      unreadCount: number;
      canViewNotifications: boolean;
    }
  | {
      status: "unauthorized" | "load_error";
      notifications: [];
      unreadCount: 0;
      canViewNotifications: false;
    }
> {
  const notificationOrganizations = organizations.filter((organization) =>
    organization.permissionKeys.includes("notifications.view"),
  );

  if (notificationOrganizations.length === 0) {
    return {
      status: "unauthorized",
      notifications: [],
      unreadCount: 0,
      canViewNotifications: false,
    };
  }

  const organizationIds = notificationOrganizations.map(
    (organization) => organization.id,
  );

  const notificationsResult = await supabase
    .from("app_notifications")
    .select(
      "id, type, title, message, metadata, entity_type, entity_id, organization_id, is_read, read_at, created_at",
    )
    .in("organization_id", organizationIds)
    .eq("recipient_user_id", recipientUserId)
    .order("created_at", { ascending: false })
    .limit(Math.max(limit * 5, 100));

  if (notificationsResult.error) {
    return {
      status: "load_error",
      notifications: [],
      unreadCount: 0,
      canViewNotifications: false,
    };
  }

  const enrichedNotifications = await enrichAppNotifications(
      supabase,
      (notificationsResult.data ?? []) as AppNotificationRow[],
      organizations,
    );

  return {
    status: "success",
    notifications: enrichedNotifications.slice(0, limit),
    unreadCount: enrichedNotifications.filter((notification) => !notification.isRead).length,
    canViewNotifications: true,
  };
}

async function enrichAppNotifications(
  supabase: SupabaseClient<Database>,
  rows: AppNotificationRow[],
  organizations: AccessibleOrganization[],
): Promise<AppNotification[]> {
  const organizationById = new Map(
    organizations.map((organization) => [organization.id, organization]),
  );
  const candidateRows = rows.filter((row) => {
    if (row.entity_type !== "maintenance_job") {
      return true;
    }

    const organization = row.organization_id
      ? organizationById.get(row.organization_id)
      : null;
    if (!organization) {
      return false;
    }

    return (
      organization.permissionKeys.includes("app_requests.view") ||
      organization.permissionKeys.includes("app_requests.maintenance.view") ||
      organization.permissionKeys.includes("app_requests.maintenance.review")
    );
  });
  const directRequestIds = candidateRows
    .filter((row) => row.entity_type === "driver_app_request" && row.entity_id)
    .map((row) => row.entity_id as string);
  const maintenanceJobIds = candidateRows
    .filter((row) => row.entity_type === "maintenance_job" && row.entity_id)
    .map((row) => row.entity_id as string);
  const requestsById = new Map<string, RequestRow>();
  const maintenanceJobsById = new Map<string, MaintenanceJobRow>();
  const driversById = new Map<string, DriverRow>();
  const notificationSupabase = supabase as SupabaseClient<NotificationDatabase>;

  if (maintenanceJobIds.length > 0) {
    const { data: maintenanceJobs } = await notificationSupabase
      .from("maintenance_jobs")
      .select("id, request_id, job_type")
      .in("id", Array.from(new Set(maintenanceJobIds)));

    for (const job of maintenanceJobs ?? []) {
      maintenanceJobsById.set(job.id, job);
    }
  }

  const requestIds = Array.from(
    new Set([
      ...directRequestIds,
      ...Array.from(maintenanceJobsById.values()).map((job) => job.request_id),
    ]),
  );

  if (requestIds.length > 0) {
    const { data: requests } = await supabase
      .from("driver_app_requests")
      .select("id, request_type, status, driver_id")
      .in("id", requestIds);

    for (const request of (requests ?? []) as RequestRow[]) {
      requestsById.set(request.id, request);
    }

  }

  const visibleRows = candidateRows.filter((row) => {
    const organization = row.organization_id
      ? organizationById.get(row.organization_id)
      : null;
    if (!organization) return false;

    const maintenanceJob =
      row.entity_type === "maintenance_job" && row.entity_id
        ? maintenanceJobsById.get(row.entity_id)
        : null;
    const requestId =
      row.entity_type === "driver_app_request"
        ? row.entity_id
        : maintenanceJob?.request_id ?? null;
    const request = requestId ? requestsById.get(requestId) : null;
    const requestType = request?.request_type ?? maintenanceJob?.job_type ?? null;

    if (isDriverAppRequestType(requestType)) {
      return canViewRequestType(organization.permissionKeys, requestType);
    }
    if (row.entity_type === "driver_app_request") {
      return false;
    }
    if (row.entity_type === "driver_shift_change_request" || row.type.includes("shift_change")) {
      return organization.permissionKeys.includes("app_requests.view") ||
        organization.permissionKeys.includes("app_requests.shift_change.view") ||
        organization.permissionKeys.includes("app_requests.shift_change.review");
    }
    if (row.entity_type === "driver_shift" || row.type.includes("odometer")) {
      return organization.permissionKeys.includes("odometer.manage") ||
        organization.permissionKeys.includes("odometer.view") ||
        organization.permissionKeys.includes("odometer.review") ||
        organization.permissionKeys.includes("odometer.edit") ||
        organization.permissionKeys.includes("odometer.approve") ||
        organization.permissionKeys.includes("odometer.reject");
    }
    if (row.type.includes("order_shift") || row.type.includes("order_period")) {
      return organization.permissionKeys.includes("order_periods.manage") ||
        organization.permissionKeys.includes("order_periods.requests.review");
    }
    return true;
  });

  const visibleDriverIds = Array.from(
    new Set(
      visibleRows.flatMap((row) => {
        const maintenanceJob =
          row.entity_type === "maintenance_job" && row.entity_id
            ? maintenanceJobsById.get(row.entity_id)
            : null;
        const requestId =
          row.entity_type === "driver_app_request"
            ? row.entity_id
            : maintenanceJob?.request_id ?? null;
        const request = requestId ? requestsById.get(requestId) : null;
        return request?.driver_id ? [request.driver_id] : [];
      }),
    ),
  );
  if (visibleDriverIds.length > 0) {
    const { data: drivers } = await supabase
      .from("drivers")
      .select("id, full_name")
      .in("id", visibleDriverIds);
    for (const driver of drivers ?? []) {
      driversById.set(driver.id, driver);
    }
  }

  return visibleRows.map((row) => {
    const organization = row.organization_id
      ? organizationById.get(row.organization_id)
      : null;
    const maintenanceJob =
      row.entity_type === "maintenance_job" && row.entity_id
        ? maintenanceJobsById.get(row.entity_id)
        : null;
    const requestId =
      row.entity_type === "driver_app_request"
        ? row.entity_id
        : maintenanceJob?.request_id ?? null;
    const request = requestId ? requestsById.get(requestId) : null;
    const driver = request ? driversById.get(request.driver_id) : null;

    return {
      id: row.id,
      type: row.type,
      title: row.title,
      message: row.message,
      metadata: parseNotificationMetadata(row.metadata),
      entityType: row.entity_type,
      entityId: row.entity_id,
      organizationId: row.organization_id,
      organizationName: organization?.name ?? null,
      organizationCode: organization?.code ?? null,
      requestId,
      requestType: request?.request_type ?? maintenanceJob?.job_type ?? null,
      requestStatus: request?.status ?? null,
      maintenanceJobType: maintenanceJob?.job_type ?? null,
      driverName: driver?.full_name ?? null,
      isRead: Boolean(row.read_at),
      readAt: row.read_at,
      createdAt: row.created_at,
    };
  });
}

function isDriverAppRequestType(
  value: string | null,
): value is DriverAppRequestType {
  return (
    value === "leave" ||
    value === "maintenance" ||
    value === "meeting" ||
    value === "oil_change"
  );
}

function buildDriverAlerts(
  driver: DriverExpirySourceRow,
  organizationsById: Map<string, AccessibleOrganization>,
  today: string,
) {
  const organization = organizationsById.get(driver.organization_id);

  if (!organization) {
    return [];
  }

  const documents: DocumentSource[] = [
    { documentType: "iqama", expiryDate: driver.iqama_expiry_date },
    {
      documentType: "driving_license",
      expiryDate: driver.driving_license_expiry_date,
    },
    { documentType: "driver_card", expiryDate: driver.driver_card_expiry_date },
    {
      documentType: "vehicle_authorization",
      expiryDate: driver.fleet_vehicles?.authorization_expiry_date ?? null,
    },
    {
      documentType: "operating_card",
      expiryDate: driver.fleet_vehicles?.operating_card_expiry_date ?? null,
    },
  ];

  return documents.flatMap((document) => {
    if (!document.expiryDate) {
      return [];
    }

    const status = getExpiryStatus(document.expiryDate, today);
    const daysRemaining =
      status.state === "expired" ? -status.days : status.days;

    if (daysRemaining > 10) {
      return [];
    }

    return [
      {
        key: `${driver.organization_id}:${driver.id}:${document.documentType}:${document.expiryDate}`,
        organizationCode: organization.code,
        organizationName: organization.name,
        driverId: driver.id,
        driverName: driver.full_name,
        driverStatus: driver.status,
        documentType: document.documentType,
        expiryDate: document.expiryDate,
        daysRemaining,
        severity: getSeverity(daysRemaining),
      },
    ];
  });
}

function getSeverity(daysRemaining: number): DriverExpiryAlertSeverity {
  if (daysRemaining < 0) {
    return "expired";
  }

  if (daysRemaining === 0) {
    return "expires_today";
  }

  if (daysRemaining <= 3) {
    return "urgent";
  }

  return "warning";
}

function compareDriverExpiryAlerts(
  first: DriverExpiryAlert,
  second: DriverExpiryAlert,
) {
  if (first.daysRemaining !== second.daysRemaining) {
    return first.daysRemaining - second.daysRemaining;
  }

  return first.driverName.localeCompare(second.driverName, ["ar", "en"], {
    sensitivity: "base",
  });
}
