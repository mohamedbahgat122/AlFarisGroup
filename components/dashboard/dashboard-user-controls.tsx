"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import {
  markAllNotificationsReadAction,
} from "@/features/notifications/actions";
import { getLocalizedNotificationContent } from "@/features/notifications/localization";
import type {
  AppNotification,
  DriverExpiryAlert,
  DriverExpiryDocumentType,
  DriverExpiryAlertSeverity,
} from "@/features/notifications/types";
import type {
  SystemExpiryAlert,
  SystemExpiryAlertsResult,
  SystemExpiryAlertSeverity,
} from "@/features/expiry-alerts/types";
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
  systemExpiryAlerts: SystemExpiryAlertsResult;
};

export function DashboardUserControls({
  locale,
  dictionary,
  user,
  appNotifications,
  systemExpiryAlerts,
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
      {systemExpiryAlerts.status === "success" ? (
        <SystemExpiryWarningBell
          locale={locale}
          dictionary={dictionary}
          result={systemExpiryAlerts}
        />
      ) : null}
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

function SystemExpiryWarningBell({
  locale,
  dictionary,
  result,
}: {
  locale: Locale;
  dictionary: Dictionary;
  result: Extract<SystemExpiryAlertsResult, { status: "success" }>;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const panelDictionary = dictionary.dashboard.systemExpiryPanel;
  const badgeText = result.totalCount > 99 ? "99+" : String(result.totalCount);
  const accessibleLabel =
    result.totalCount > 0
      ? panelDictionary.openWithCount.replace("{count}", String(result.totalCount))
      : panelDictionary.openEmpty;

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (buttonRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
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
        title={panelDictionary.title}
        className={`${iconButtonClassName} relative ${result.hasExpired ? "text-danger hover:text-danger" : ""}`}
        onClick={() => setOpen((current) => !current)}
      >
        <AlertTriangleIcon />
        {result.totalCount > 0 ? (
          <span
            dir="ltr"
            className={`absolute -end-1.5 -top-1.5 inline-flex min-w-5 items-center justify-center rounded-full border-2 border-surface px-1 text-[10px] font-bold leading-4 text-white ${
              result.hasExpired ? "bg-danger" : "bg-amber-500"
            }`}
          >
            {badgeText}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={panelDictionary.title}
          className="absolute end-0 top-[calc(100%+0.65rem)] z-50 w-[min(92vw,460px)] overflow-hidden rounded-xl border border-border bg-surface text-start shadow-[0_24px_70px_rgba(16,35,63,0.16)]"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-bold text-navy">{panelDictionary.title}</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <SummaryPill label={panelDictionary.expired} value={result.summary.expired} tone="danger" />
              <SummaryPill label={panelDictionary.within3Days} value={result.summary.critical} tone="critical" />
              <SummaryPill label={panelDictionary.within10Days} value={result.summary.warning} tone="warning" />
            </div>
          </div>

          {result.alerts.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm font-bold text-navy">
                {panelDictionary.emptyTitle}
              </p>
              <p className="mt-2 text-xs leading-5 text-muted">
                {panelDictionary.emptyDescription}
              </p>
            </div>
          ) : (
            <div className="max-h-[min(68vh,560px)] overflow-y-auto p-2">
              {result.alerts.map((alert) => (
                <SystemExpiryAlertItem
                  key={alert.id}
                  locale={locale}
                  dictionary={dictionary}
                  alert={alert}
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

function SummaryPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "danger" | "critical" | "warning";
}) {
  const className =
    tone === "danger"
      ? "border-red-200 bg-red-50 text-danger"
      : tone === "critical"
        ? "border-orange-200 bg-orange-50 text-orange-800"
        : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <div className={`rounded-lg border px-2.5 py-2 ${className}`}>
      <p className="text-[11px] font-bold leading-4">{label}</p>
      <p className="mt-0.5 text-base font-bold leading-none" dir="ltr">
        {value}
      </p>
    </div>
  );
}

function SystemExpiryAlertItem({
  locale,
  dictionary,
  alert,
  onNavigate,
}: {
  locale: Locale;
  dictionary: Dictionary;
  alert: SystemExpiryAlert;
  onNavigate: () => void;
}) {
  const panelDictionary = dictionary.dashboard.systemExpiryPanel;

  return (
    <Link
      href={alert.href}
      onClick={onNavigate}
      className="group flex gap-3 rounded-lg px-3 py-3 transition hover:bg-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <span
        className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border ${getSystemSeverityIconClassName(alert.severity)}`}
        aria-hidden="true"
      >
        {alert.sourceType === "driver" ? <IdCardIcon /> : <FileCheckIcon />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-navy">
          {alert.title}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-muted">
          {alert.subtitle}
          {alert.organizationName ? ` · ${alert.organizationName}` : ""}
        </span>
        <span className="mt-1 block text-xs leading-5 text-muted">
          {formatExpiryDateLine(alert.expiryDate, alert.daysRemaining, locale, panelDictionary)}
        </span>
        <span className="mt-2 inline-flex rounded-full border px-2 py-0.5 text-xs font-bold">
          <span className={getSystemSeverityTextClassName(alert.severity)}>
            {formatSystemAlertStatus(alert.daysRemaining, panelDictionary)}
          </span>
        </span>
      </span>
    </Link>
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
  const [optimisticReadIds, setOptimisticReadIds] = useState<Set<string>>(
    () => new Set(),
  );
  const pathname = usePathname();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const panelDictionary = dictionary.dashboard.notificationPanel;
  const visibleNotifications = notifications.map((notification) =>
    optimisticReadIds.has(notification.id)
      ? {
          ...notification,
          isRead: true,
          readAt: notification.readAt ?? new Date().toISOString(),
        }
      : notification,
  );
  const optimisticUnreadAdjustment = notifications.filter(
    (notification) => !notification.isRead && optimisticReadIds.has(notification.id),
  ).length;
  const visibleUnreadCount = Math.max(0, unreadCount - optimisticUnreadAdjustment);
  const badgeText =
    visibleUnreadCount > 99 ? "99+" : String(visibleUnreadCount);
  const accessibleLabel =
    visibleUnreadCount > 0
      ? panelDictionary.openWithCount.replace("{count}", String(visibleUnreadCount))
      : panelDictionary.openEmpty;

  function markReadLocally(notificationId: string) {
    setOptimisticReadIds((current) => {
      const next = new Set(current);
      next.add(notificationId);
      return next;
    });
  }

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
        {visibleUnreadCount > 0 ? (
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
              {visibleUnreadCount > 0 ? (
                <form action={markAllNotificationsReadAction}>
                  <input type="hidden" name="pathname" value={pathname} />
                  <button className="shrink-0 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary">
                    {panelDictionary.markAllRead} ({badgeText})
                  </button>
                </form>
              ) : null}
            </div>
          </div>

          {visibleNotifications.length === 0 ? (
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
              {visibleNotifications.map((notification) => (
                <PersistentNotificationItem
                  key={notification.id}
                  locale={locale}
                  notification={notification}
                  dictionary={dictionary}
                  onRead={markReadLocally}
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
  onRead,
  onNavigate,
}: {
  locale: Locale;
  dictionary: Dictionary;
  notification: AppNotification;
  onRead: (notificationId: string) => void;
  onNavigate: () => void;
}) {
  const panelDictionary = dictionary.dashboard.notificationPanel;
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<"read" | "open" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const content = getLocalizedNotificationContent({
    notification,
    locale,
    dictionary: panelDictionary,
  });
  const href = getNotificationHref(locale, notification);

  async function markRead() {
    setErrorMessage(null);
    setPendingAction("read");

    const ok = await markNotificationRead(notification.id);

    if (ok || notification.isRead) {
      onRead(notification.id);
    } else {
      setErrorMessage("تعذر تعليم الإشعار كمقروء. حاول مرة أخرى.");
    }

    setPendingAction(null);
  }

  async function openNotification() {
    setErrorMessage(null);

    if (!href) {
      setErrorMessage("تعذر فتح العنصر المرتبط بهذا الإشعار.");
      if (process.env.NODE_ENV !== "production") {
        console.info("[notifications:open] Unresolved notification target", {
          notificationId: notification.id,
          entityType: notification.entityType,
          entityId: notification.entityId,
          organizationId: notification.organizationId,
        });
      }
      return;
    }

    setPendingAction("open");

    const ok = await markNotificationRead(notification.id);

    if (!ok && process.env.NODE_ENV !== "production") {
      console.info("[notifications:open] Continuing navigation after read failure", {
        notificationId: notification.id,
      });
    }

    onRead(notification.id);
    onNavigate();
    router.push(href);
  }

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
          <button
            type="button"
            disabled={pendingAction !== null}
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-bold text-navy disabled:cursor-not-allowed disabled:opacity-60"
            onClick={markRead}
          >
            {pendingAction === "read" ? "..." : panelDictionary.markRead}
          </button>
        ) : null}
        <button
          type="button"
          disabled={pendingAction !== null}
          className="rounded-lg border border-border px-2.5 py-1 text-xs font-bold text-primary disabled:cursor-not-allowed disabled:opacity-60"
          onClick={openNotification}
        >
          {pendingAction === "open" ? "..." : content.actionLabel}
        </button>
      </div>
      {errorMessage ? (
        <p className="mt-2 text-xs font-semibold text-danger">{errorMessage}</p>
      ) : null}
    </div>
  );
}

function getNotificationHref(locale: Locale, notification: AppNotification) {
  if (notification.organizationCode && notification.requestType) {
    return getRequestNotificationHref(locale, notification);
  }

  if (
    notification.organizationCode &&
    notification.entityType === "driver_warning"
  ) {
    return `/${locale}/dashboard/organizations/${notification.organizationCode}/driver-warnings`;
  }

  return null;
}

function getRequestNotificationHref(locale: Locale, notification: AppNotification) {
  const baseHref = `/${locale}/dashboard/organizations/${notification.organizationCode}/app-requests/${getRequestPath(
    notification.requestType ?? "",
  )}`;

  return notification.entityType === "driver_app_request" && notification.entityId
    ? `${baseHref}?requestId=${encodeURIComponent(notification.entityId)}`
    : baseHref;
}

async function markNotificationRead(notificationId: string) {
  try {
    const response = await fetch("/api/dashboard/notifications", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ notificationId }),
    });

    return response.ok;
  } catch {
    return false;
  }
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

function AlertTriangleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path
        d="M12 4 3.5 19h17L12 4Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M12 9v4m0 3h.01"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
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

function getSystemSeverityIconClassName(severity: SystemExpiryAlertSeverity) {
  switch (severity) {
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "critical":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "expired":
      return "border-red-200 bg-red-50 text-danger";
  }
}

function getSystemSeverityTextClassName(severity: SystemExpiryAlertSeverity) {
  switch (severity) {
    case "warning":
      return "text-amber-800";
    case "critical":
      return "text-orange-800";
    case "expired":
      return "text-danger";
  }
}

function formatExpiryDateLine(
  expiryDate: string,
  daysRemaining: number,
  locale: Locale,
  dictionary:
    | Dictionary["dashboard"]["notificationPanel"]
    | Dictionary["dashboard"]["systemExpiryPanel"],
) {
  const formattedDate = formatDate(expiryDate, locale);
  const template =
    daysRemaining < 0 ? dictionary.expiredOnDate : dictionary.expiresOnDate;

  return template.replace("{date}", formattedDate);
}

function formatSystemAlertStatus(
  daysRemaining: number,
  dictionary: Dictionary["dashboard"]["systemExpiryPanel"],
) {
  const absoluteDays = Math.abs(daysRemaining);

  if (daysRemaining < 0) {
    return absoluteDays === 1
      ? dictionary.expiredOneDay
      : dictionary.expiredDays.replace("{days}", String(absoluteDays));
  }

  if (daysRemaining === 0) {
    return dictionary.expiresToday;
  }

  return daysRemaining === 1
    ? dictionary.oneDayRemaining
    : dictionary.daysRemaining.replace("{days}", String(daysRemaining));
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
