"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
  openNotificationAction,
} from "@/features/notifications/actions";
import { getLocalizedNotificationContent } from "@/features/notifications/localization";
import type {
  AppNotification,
  DriverExpiryAlert,
  DriverExpiryDocumentType,
  DriverExpiryAlertSeverity,
} from "@/features/notifications/types";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/types/locale";

type DashboardUserControlsProps = {
  locale: Locale;
  dictionary: Dictionary;
  user: {
    id: string;
    fullName: string | null;
    jobTitle: string | null;
  };
  appNotifications:
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
      };
};

export function DashboardUserControls({
  locale,
  dictionary,
  user,
  appNotifications,
}: DashboardUserControlsProps) {
  const pathname = usePathname();
  const nextLocale: Locale = locale === "ar" ? "en" : "ar";
  const localizedPath = pathname.replace(/^\/(ar|en)(?=\/|$)/, `/${nextLocale}`);
  const fullName = user.fullName?.trim() || dictionary.dashboard.userFallback;
  const jobTitle = user.jobTitle?.trim() || dictionary.dashboard.jobTitleFallback;
  const initials = getInitials(user.fullName);

  return (
    <div className="flex min-w-0 items-center gap-2 sm:gap-3">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary-soft text-sm font-bold text-primary shadow-sm">
        {initials ? (
          <span>{initials}</span>
        ) : (
          <UserIcon />
        )}
      </div>
      <div className="hidden min-w-0 max-w-[160px] sm:block lg:max-w-[220px]">
        <p className="truncate text-sm font-semibold leading-5 text-navy">
          {fullName}
        </p>
        <p className="truncate text-xs leading-5 text-muted">{jobTitle}</p>
      </div>
      <HeaderIconButton
        label={dictionary.dashboard.tasks}
        icon={<TasksIcon />}
      />
      {appNotifications.canViewNotifications ? (
        <NotificationBell
          locale={locale}
          dictionary={dictionary}
          notifications={appNotifications.notifications}
          unreadCount={appNotifications.unreadCount}
        />
      ) : null}
      <Link
        href={localizedPath}
        hrefLang={nextLocale}
        aria-label={dictionary.dashboard.switchLanguage}
        title={dictionary.dashboard.switchLanguage}
        className={iconButtonClassName}
      >
        <GlobeIcon />
      </Link>
      <SignOutButton locale={locale} label={dictionary.dashboard.signOut} />
    </div>
  );
}

function NotificationBell({
  locale,
  dictionary,
  notifications,
  unreadCount,
}: {
  locale: Locale;
  dictionary: Dictionary;
  notifications: AppNotification[];
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const panelDictionary = dictionary.dashboard.notificationPanel;
  const badgeText = unreadCount > 99 ? "99+" : String(unreadCount);
  const accessibleLabel =
    unreadCount > 0
      ? panelDictionary.openWithCount.replace("{count}", String(unreadCount))
      : panelDictionary.openEmpty;

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (
        buttonRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }

      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      setOpen(false);
      buttonRef.current?.focus();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={popoverRef}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={accessibleLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={dictionary.dashboard.notifications}
        className={`${iconButtonClassName} relative`}
        onClick={() => setOpen((current) => !current)}
      >
        <BellIcon />
        {unreadCount > 0 ? (
          <span
            dir="ltr"
            className="absolute -end-1.5 -top-1.5 inline-flex min-w-5 items-center justify-center rounded-full border-2 border-surface bg-danger px-1 text-[10px] font-bold leading-4 text-white"
          >
            {badgeText}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={panelDictionary.title}
          className="absolute end-0 top-[calc(100%+0.65rem)] z-50 w-[min(92vw,420px)] overflow-hidden rounded-xl border border-border bg-surface text-start shadow-[0_24px_70px_rgba(16,35,63,0.16)]"
        >
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-navy">
                  {panelDictionary.title}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted">
                  {panelDictionary.appSummary}
                </p>
              </div>
              {unreadCount > 0 ? (
                <form action={markAllNotificationsReadAction}>
                  <input type="hidden" name="pathname" value={pathname} />
                  <button className="shrink-0 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary">
                    {panelDictionary.markAllRead} ({badgeText})
                  </button>
                </form>
              ) : null}
            </div>
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm font-bold text-navy">
                {panelDictionary.emptyTitle}
              </p>
              <p className="mt-2 text-xs leading-5 text-muted">
                {panelDictionary.emptyDescription}
              </p>
            </div>
          ) : (
            <div className="max-h-[min(68vh,520px)] overflow-y-auto p-2">
              {notifications.map((notification) => (
                <PersistentNotificationItem
                  key={notification.id}
                  locale={locale}
                  notification={notification}
                  dictionary={dictionary}
                  pathname={pathname}
                  onNavigate={() => setOpen(false)}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function PersistentNotificationItem({
  locale,
  dictionary,
  notification,
  pathname,
  onNavigate,
}: {
  locale: Locale;
  dictionary: Dictionary;
  notification: AppNotification;
  pathname: string;
  onNavigate: () => void;
}) {
  const panelDictionary = dictionary.dashboard.notificationPanel;
  const content = getLocalizedNotificationContent({
    notification,
    locale,
    dictionary: panelDictionary,
  });
  const href =
    notification.organizationCode && notification.requestType
      ? getRequestNotificationHref(locale, notification)
      : notification.organizationCode && notification.entityType === "driver_warning"
        ? `/${locale}/dashboard/organizations/${notification.organizationCode}/driver-warnings`
      : `/${locale}/dashboard`;

  return (
    <div
      className={`rounded-lg px-3 py-3 transition hover:bg-background ${
        notification.isRead ? "opacity-75" : ""
      }`}
    >
      <span className="mb-2 inline-flex rounded-full border border-primary/20 bg-primary-soft px-2 py-0.5 text-xs font-bold text-primary">
        {notification.isRead ? panelDictionary.read : panelDictionary.unread}
      </span>
      <div className="flex gap-3">
        <span
          className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary-soft text-primary"
          aria-hidden="true"
        >
          <BellIcon />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-navy">
            {content.title}
          </span>
          <span className="mt-0.5 block text-xs leading-5 text-muted">
            {content.message}
          </span>
          <span className="mt-1 block text-xs leading-5 text-muted">
            {formatNotificationDate(
              notification.createdAt,
              locale,
              panelDictionary.timeUnavailable,
            )}
          </span>
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {!notification.isRead ? (
          <form action={markNotificationReadAction}>
            <input type="hidden" name="notificationId" value={notification.id} />
            <input type="hidden" name="pathname" value={pathname} />
            <button className="rounded-lg border border-border px-2.5 py-1 text-xs font-bold text-navy">
              {panelDictionary.markRead}
            </button>
          </form>
        ) : null}
        <form action={openNotificationAction}>
          <input type="hidden" name="notificationId" value={notification.id} />
          <input type="hidden" name="href" value={href} />
          <button
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-bold text-primary"
            onClick={onNavigate}
          >
            {content.actionLabel}
          </button>
        </form>
      </div>
    </div>
  );
}

function getRequestNotificationHref(locale: Locale, notification: AppNotification) {
  const baseHref = `/${locale}/dashboard/organizations/${notification.organizationCode}/app-requests/${getRequestPath(
    notification.requestType ?? "",
  )}`;

  return notification.entityType === "driver_app_request" && notification.entityId
    ? `${baseHref}?requestId=${encodeURIComponent(notification.entityId)}`
    : baseHref;
}

// Kept for the existing document-expiry alert rendering shape if that panel is restored.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function NotificationAlertItem({
  locale,
  dictionary,
  alert,
  onNavigate,
}: {
  locale: Locale;
  dictionary: Dictionary;
  alert: DriverExpiryAlert;
  onNavigate: () => void;
}) {
  const panelDictionary = dictionary.dashboard.notificationPanel;
  const driversDictionary = dictionary.dashboard.drivers;
  const documentLabel =
    panelDictionary.documents[alert.documentType] ??
    getFallbackDocumentLabel(alert.documentType);
  const href = `/${locale}/dashboard/organizations/${alert.organizationCode}/drivers?driver=${alert.driverId}`;

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="group flex gap-3 rounded-lg px-3 py-3 transition hover:bg-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <span
        className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border ${getSeverityIconClassName(alert.severity)}`}
        aria-hidden="true"
      >
        {getDocumentIcon(alert.documentType)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-navy">
          {alert.driverName}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-muted">
          {documentLabel} — {alert.organizationName}
        </span>
        <span className="mt-1 block text-xs leading-5 text-muted">
          {formatExpiryDateLine(alert.expiryDate, alert.daysRemaining, locale, panelDictionary)}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-bold ${getSeverityBadgeClassName(alert.severity)}`}
          >
            {formatAlertStatus(alert.daysRemaining, panelDictionary)}
          </span>
          {alert.driverStatus === "suspended" ? (
            <span className="text-xs font-semibold text-muted">
              {driversDictionary.driverStatuses.suspended}
            </span>
          ) : null}
        </span>
      </span>
    </Link>
  );
}

function getRequestPath(requestType: string) {
  return requestType === "meeting"
    ? "meetings"
    : requestType === "oil_change"
      ? "oil-change"
      : requestType;
}

function getInitials(fullName: string | null) {
  const parts = fullName?.trim().split(/\s+/).filter(Boolean) ?? [];

  if (parts.length === 0) {
    return "";
  }

  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";

  return `${first}${last}`.toUpperCase();
}

const iconButtonClassName =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted shadow-sm transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function HeaderIconButton({
  label,
  icon,
}: {
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={iconButtonClassName}
    >
      {icon}
    </button>
  );
}

function UserIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path
        d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TasksIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path
        d="M9 5h6M9 5a3 3 0 0 0 6 0M9 5H7.5A2.5 2.5 0 0 0 5 7.5v11A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5v-11A2.5 2.5 0 0 0 16.5 5H15"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m8.5 13 2 2 4.5-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path
        d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IdCardIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none">
      <path
        d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M8 9h4M8 13h8M8 16h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none">
      <path
        d="M12 3 5.5 5.5v5.7c0 4.2 2.6 7.7 6.5 9.3 3.9-1.6 6.5-5.1 6.5-9.3V5.5L12 3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="m9 12 2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CreditCardIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none">
      <path
        d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-9Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M4.5 9h15" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8 14h3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FileCheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none">
      <path
        d="M7 3.5h6l4 4V18a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 5 18V6a2.5 2.5 0 0 1 2-2.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M13 3.5V8h4M8.5 14l1.8 1.8 3.7-4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function getDocumentIcon(documentType: DriverExpiryDocumentType) {
  switch (documentType) {
    case "iqama":
      return <IdCardIcon />;
    case "driving_license":
      return <ShieldCheckIcon />;
    case "driver_card":
      return <CreditCardIcon />;
    case "vehicle_authorization":
    case "operating_card":
      return <FileCheckIcon />;
  }
}

function getFallbackDocumentLabel(documentType: DriverExpiryDocumentType) {
  return documentType.replace(/_/g, " ");
}

function getSeverityIconClassName(severity: DriverExpiryAlertSeverity) {
  switch (severity) {
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "urgent":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "expires_today":
    case "expired":
      return "border-red-200 bg-red-50 text-danger";
  }
}

function getSeverityBadgeClassName(severity: DriverExpiryAlertSeverity) {
  switch (severity) {
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "urgent":
      return "border-orange-200 bg-orange-50 text-orange-800";
    case "expires_today":
    case "expired":
      return "border-red-200 bg-red-50 text-danger";
  }
}

function formatExpiryDateLine(
  expiryDate: string,
  daysRemaining: number,
  locale: Locale,
  dictionary: Dictionary["dashboard"]["notificationPanel"],
) {
  const formattedDate = formatDate(expiryDate, locale);
  const template =
    daysRemaining < 0 ? dictionary.expiredOnDate : dictionary.expiresOnDate;

  return template.replace("{date}", formattedDate);
}

function formatAlertStatus(
  daysRemaining: number,
  dictionary: Dictionary["dashboard"]["notificationPanel"],
) {
  const absoluteDays = Math.abs(daysRemaining);

  if (daysRemaining < 0) {
    return (
      absoluteDays === 1
        ? dictionary.expiredOneDay
        : dictionary.expiredDays.replace("{days}", String(absoluteDays))
    );
  }

  if (daysRemaining === 0) {
    return dictionary.expiresToday;
  }

  return daysRemaining === 1
    ? dictionary.oneDayRemaining
    : dictionary.daysRemaining.replace("{days}", String(daysRemaining));
}

function formatDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(
    locale === "ar" ? "ar-SA-u-ca-gregory" : "en-US",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    },
  ).format(new Date(`${value}T00:00:00.000Z`));
}

function formatNotificationDate(
  value: string | null | undefined,
  locale: Locale,
  fallback: string,
) {
  if (!value?.trim()) {
    return fallback;
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return fallback;
  }

  return new Intl.DateTimeFormat(
    locale === "ar" ? "ar-SA-u-ca-gregory" : "en-US",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    },
  ).format(date);
}

function GlobeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path
        d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3.6 9h16.8M3.6 15h16.8M12 3c2.1 2.2 3.2 5.2 3.2 9S14.1 18.8 12 21M12 3C9.9 5.2 8.8 8.2 8.8 12S9.9 18.8 12 21"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
