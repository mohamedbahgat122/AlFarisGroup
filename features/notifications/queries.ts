import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getBusinessDateString, getExpiryStatus } from "@/features/drivers/expiry";
import type { AccessibleOrganization } from "@/features/organizations/types";
import type { Database } from "@/types/database";
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

  const [notificationsResult, unreadResult] = await Promise.all([
    supabase
      .from("app_notifications")
      .select(
        "id, type, title, message, entity_type, entity_id, organization_id, is_read, read_at, created_at",
      )
      .in("organization_id", organizationIds)
      .eq("recipient_user_id", recipientUserId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("app_notifications")
      .select("id", { count: "exact", head: true })
      .in("organization_id", organizationIds)
      .eq("recipient_user_id", recipientUserId)
      .is("read_at", null),
  ]);

  if (notificationsResult.error || unreadResult.error) {
    return {
      status: "load_error",
      notifications: [],
      unreadCount: 0,
      canViewNotifications: false,
    };
  }

  return {
    status: "success",
    notifications: await enrichAppNotifications(
      supabase,
      (notificationsResult.data ?? []) as AppNotificationRow[],
      organizations,
    ),
    unreadCount: unreadResult.count ?? 0,
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
  const directRequestIds = rows
    .filter((row) => row.entity_type === "driver_app_request" && row.entity_id)
    .map((row) => row.entity_id as string);
  const maintenanceJobIds = rows
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

    const driverIds = Array.from(
      new Set((requests ?? []).map((request) => request.driver_id)),
    );

    if (driverIds.length > 0) {
      const { data: drivers } = await supabase
        .from("drivers")
        .select("id, full_name")
        .in("id", driverIds);

      for (const driver of (drivers ?? []) as DriverRow[]) {
        driversById.set(driver.id, driver);
      }
    }
  }

  return rows.map((row) => {
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
