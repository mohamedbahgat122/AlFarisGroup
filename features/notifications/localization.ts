import type { AppNotification } from "@/features/notifications/types";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/types/locale";

type LocalizedNotificationContent = {
  title: string;
  message: string;
  actionLabel: string;
};

const requestTypes = new Set(["leave", "maintenance", "meeting", "oil_change"]);
const maintenanceJobTypes = new Set(["maintenance", "oil_change"]);

export function getLocalizedNotificationContent({
  notification,
  locale,
  dictionary,
}: {
  notification: AppNotification;
  locale: Locale;
  dictionary: Dictionary["dashboard"]["notificationPanel"];
}): LocalizedNotificationContent {
  void locale;

  if (
    notification.type === "driver_app_request_submitted" &&
    isRequestType(notification.requestType)
  ) {
    const localized =
      dictionary.localized.driver_app_request_submitted[notification.requestType];

    return {
      title: localized.title,
      message: formatTemplate(localized.message, {
        driverName: notification.driverName ?? dictionary.driverFallback,
      }),
      actionLabel: dictionary.open,
    };
  }

  if (
    (notification.type === "driver_app_request_approved" ||
      notification.type === "driver_app_request_rejected") &&
    isRequestType(notification.requestType)
  ) {
    const decision =
      notification.type === "driver_app_request_approved" ? "approved" : "rejected";
    const localized =
      dictionary.localized[`driver_app_request_${decision}`][notification.requestType];

    return {
      title: localized.title,
      message: localized.message,
      actionLabel: dictionary.open,
    };
  }

  if (notification.type === "driver_warning_issued") {
    return {
      title: dictionary.localized.driver_warning_issued.title,
      message: dictionary.localized.driver_warning_issued.message,
      actionLabel: dictionary.open,
    };
  }

  if (notification.type === "task_assigned") {
    return {
      title: dictionary.localized.task_assigned.title,
      message: dictionary.localized.task_assigned.message,
      actionLabel: dictionary.open,
    };
  }

  if (notification.type === "task_updated") {
    return {
      title: dictionary.localized.task_updated.title,
      message: dictionary.localized.task_updated.message,
      actionLabel: dictionary.open,
    };
  }

  const maintenanceJobStatus = getMaintenanceJobStatus(notification.type);
  const maintenanceJobType = getMaintenanceJobType(notification);

  if (maintenanceJobStatus && maintenanceJobType) {
    const localized = dictionary.localized[`maintenance_job_${maintenanceJobStatus}`][
      maintenanceJobType
    ];

    return {
      title: localized.title,
      message: localized.message,
      actionLabel: dictionary.open,
    };
  }

  return {
    title: notification.title,
    message: notification.message,
    actionLabel: dictionary.open,
  };
}

function formatTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}

function isRequestType(value: string | null): value is "leave" | "maintenance" | "meeting" | "oil_change" {
  return Boolean(value && requestTypes.has(value));
}

function getMaintenanceJobStatus(value: string) {
  if (value === "maintenance_job_assigned") return "assigned";
  if (value === "maintenance_job_started") return "started";
  if (value === "maintenance_job_completed") return "completed";
  if (value === "maintenance_job_cancelled") return "cancelled";
  return null;
}

function getMaintenanceJobType(
  notification: AppNotification,
): "maintenance" | "oil_change" | null {
  const value = notification.maintenanceJobType ?? notification.requestType;
  return value && maintenanceJobTypes.has(value)
    ? (value as "maintenance" | "oil_change")
    : null;
}
