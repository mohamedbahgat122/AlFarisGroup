"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { usePathname } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-loading-state";
import { PermissionRevisionSync } from "@/components/dashboard/permission-revision-sync";
import { RealtimeRefresh } from "@/components/dashboard/realtime-refresh";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import type { AccessibleOrganization } from "@/features/organizations/types";
import type { OilMaintenanceAlertsResult } from "@/features/app-requests/types";
import type { AppNotification } from "@/features/notifications/types";
import type { SystemExpiryAlertsResult } from "@/features/expiry-alerts/types";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/types/locale";
import type { ProfileRole } from "@/types/profile";
import type { OrganizationPermissionKey } from "@/features/permissions/registry";

type DashboardShellProps = {
  locale: Locale;
  dictionary: Dictionary;
  user: {
    id: string;
    fullName: string | null;
    email: string;
    avatarUrl: string | null;
    homeOrganizationId: string | null;
    jobTitle: string | null;
    role: ProfileRole;
    hasGlobalFleetPermission: boolean;
    hasGlobalHousingPermission: boolean;
    hasGlobalSupervisorShiftsPermission: boolean;
  };
  authorizationRevision: string;
  organizations: AccessibleOrganization[];
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
  oilMaintenanceAlerts: OilMaintenanceAlertsResult;
  children?: React.ReactNode;
};

export function DashboardShell({
  locale,
  dictionary,
  user,
  authorizationRevision,
  organizations,
  appNotifications,
  systemExpiryAlerts,
  oilMaintenanceAlerts,
  children,
}: DashboardShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [liveAppNotifications, setLiveAppNotifications] =
    useState<typeof appNotifications | null>(null);
  const [liveOilMaintenanceAlerts, setLiveOilMaintenanceAlerts] =
    useState<OilMaintenanceAlertsResult | null>(null);
  const appNotificationsRequestRef = useRef<Promise<void> | null>(null);
  const oilAlertsRequestRef = useRef<Promise<void> | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const pathname = usePathname();
  const currentPathnameRef = useRef(pathname);
  const dashboardPathPrefix = `/${locale}/dashboard`;
  const navigationPending = isNavigating || pendingHref !== null;

  useEffect(() => {
    if (pathname === currentPathnameRef.current) {
      return;
    }

    currentPathnameRef.current = pathname;
    setIsNavigating(false);
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    if (!navigationPending) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsNavigating(false);
      setPendingHref(null);
    }, 30000);

    return () => window.clearTimeout(timeoutId);
  }, [navigationPending]);

  useEffect(() => {
    const handlePopState = () => {
      if (window.location.pathname === currentPathnameRef.current) {
        return;
      }

      flushSync(() => {
        setIsNavigating(true);
      });
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handleSidebarLinkClick = useCallback((href: string | null, event: React.MouseEvent) => {
    if (!href) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (event.defaultPrevented) return;

    try {
      const url = new URL(href, window.location.origin);
      const currentUrl = new URL(window.location.href);
      if (
        url.origin !== window.location.origin ||
        !url.pathname.startsWith(dashboardPathPrefix) ||
        url.pathname === currentUrl.pathname
      ) {
        return;
      }
    } catch {
      return;
    }

    if (href === pendingHref) {
      event.preventDefault();
      return;
    }

    flushSync(() => {
      setPendingHref(href);
      setIsNavigating(true);
    });
  }, [dashboardPathPrefix, pendingHref]);

  const handleNavClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (event.defaultPrevented) return;

    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor) return;

    if (
      anchor.getAttribute("target") === "_blank" ||
      anchor.hasAttribute("download") ||
      anchor.getAttribute("rel") === "external"
    ) {
      return;
    }

    const href = anchor.getAttribute("href");
    if (!href) return;

    const isHash =
      href.startsWith("#") ||
      (href.includes("#") && href.split("#")[0] === window.location.pathname);
    if (isHash) return;

    const isInternal =
      (href.startsWith("/") && !href.startsWith("//")) ||
      href.startsWith(window.location.origin);
    if (!isInternal) return;

    let nextHref = "";

    try {
      const url = new URL(href, window.location.origin);
      const currentUrl = new URL(window.location.href);
      if (
        url.origin !== window.location.origin ||
        !url.pathname.startsWith(dashboardPathPrefix) ||
        url.pathname === currentUrl.pathname
      ) {
        return;
      }

      nextHref = `${url.pathname}${url.search}`;
    } catch {
      return;
    }

    flushSync(() => {
      setIsNavigating(true);
      setPendingHref(nextHref);
    });
  }, [dashboardPathPrefix]);

  const sidebarWidth = collapsed ? "88px" : "292px";
  const displayedAppNotifications = liveAppNotifications ?? appNotifications;
  const displayedOilMaintenanceAlerts =
    liveOilMaintenanceAlerts ?? oilMaintenanceAlerts;
  const granularRequestNotificationKeys: OrganizationPermissionKey[] = [
    "app_requests.leave.view",
    "app_requests.leave.review",
    "app_requests.maintenance.view",
    "app_requests.maintenance.review",
    "app_requests.meeting.view",
    "app_requests.meeting.review",
    "app_requests.oil_change.view",
    "app_requests.oil_change.review",
  ];
  const canSubscribeToRequestNotifications =
    appNotifications.canViewNotifications &&
    (user.role === "system_owner" || organizations.some((organization) =>
      organization.permissionKeys.includes("notifications.view") &&
      (organization.permissionKeys.includes("app_requests.view") ||
        granularRequestNotificationKeys.some((key) =>
          organization.permissionKeys.includes(key),
        )),
    ));
  const canSubscribeToOilMaintenanceAlerts = organizations.some(
    (organization) =>
      organization.navigation.appRequestOilChange,
  );
  const oilMaintenanceOrganizationIds = organizations
    .filter(
      (organization) =>
        organization.navigation.appRequestOilChange,
    )
    .map((organization) => organization.id);
  const oilMaintenanceRealtimeFilter =
    oilMaintenanceOrganizationIds.length > 0
      ? `organization_id=in.(${oilMaintenanceOrganizationIds.join(",")})`
      : undefined;

  const refreshAppNotifications = useCallback(async () => {
    if (appNotificationsRequestRef.current) {
      return appNotificationsRequestRef.current;
    }

    const request = fetch("/api/dashboard/notifications", {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok) {
          return;
        }

        const nextNotifications = (await response.json()) as typeof appNotifications;
        setLiveAppNotifications(nextNotifications);
      })
      .catch(() => {
        // Keep the last known shell state until the next Realtime event.
      })
      .finally(() => {
        appNotificationsRequestRef.current = null;
      });

    appNotificationsRequestRef.current = request;
    return request;
  }, []);

  const refreshOilMaintenanceAlerts = useCallback(() => {
    if (oilAlertsRequestRef.current) {
      return oilAlertsRequestRef.current;
    }

    const request = fetch(
        `/api/dashboard/oil-maintenance-alerts?locale=${encodeURIComponent(locale)}`,
        {
          cache: "no-store",
          credentials: "same-origin",
        },
      )
      .then(async (response) => {
        if (!response.ok) {
          return;
        }

        const nextAlerts = (await response.json()) as OilMaintenanceAlertsResult;
        setLiveOilMaintenanceAlerts(nextAlerts);
      })
      .catch(() => {
        // Keep the last known shell state until the next Realtime event.
      })
      .finally(() => {
        oilAlertsRequestRef.current = null;
      });

    oilAlertsRequestRef.current = request;
    return request;
  }, [locale]);

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-navy/42 transition-opacity lg:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setMobileOpen(false)}
      />
      {navigationPending && (
        <>
          <style>{`
            @keyframes loadingBar {
              0% { transform: scaleX(0); transform-origin: left; }
              50% { transform: scaleX(0.4); transform-origin: left; }
              100% { transform: scaleX(0.85); transform-origin: left; }
            }
          `}</style>
          <div className="fixed top-0 left-0 right-0 z-100 h-0.5 w-full bg-primary-soft">
            <div 
              className="h-full bg-primary" 
              style={{
                animation: "loadingBar 1.2s infinite ease-in-out",
                width: "100%"
              }} 
            />
          </div>
        </>
      )}
      <div
        className="dashboard-grid min-h-screen w-full overflow-x-hidden bg-background text-navy lg:grid lg:h-screen"
        style={{ "--sidebar-width": sidebarWidth } as CSSProperties}
        onClick={handleNavClick}
      >
        <DashboardSidebar
          locale={locale}
          dictionary={dictionary.dashboard}
          userRole={user.role}
          hasGlobalFleetPermission={user.hasGlobalFleetPermission}
          hasGlobalHousingPermission={user.hasGlobalHousingPermission}
          hasGlobalSupervisorShiftsPermission={user.hasGlobalSupervisorShiftsPermission}
          organizations={organizations}
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          pendingHref={pendingHref}
          onSidebarLinkClick={handleSidebarLinkClick}
          onToggleCollapsed={() => setCollapsed((current) => !current)}
          onCloseMobile={() => setMobileOpen(false)}
        />
        <section className="min-h-screen min-w-0 bg-background lg:h-screen">
          <RealtimeRefresh
            channelName={`dashboard-notifications-${user.id}`}
            table="app_notifications"
            filter={`recipient_user_id=eq.${user.id}`}
            includeDeletes={false}
            toast={dictionary.dashboard.notificationPanel.realtimeUpdated}
            enabled={canSubscribeToRequestNotifications}
            refreshRoute={false}
            onRefresh={refreshAppNotifications}
          />
          <RealtimeRefresh
            channelName={`dashboard-oil-events-${user.id}`}
            table="fleet_vehicle_oil_change_events"
            filter={oilMaintenanceRealtimeFilter}
            toast={dictionary.dashboard.oilMaintenancePanel.realtimeUpdated}
            enabled={canSubscribeToOilMaintenanceAlerts && Boolean(oilMaintenanceRealtimeFilter)}
            refreshRoute={false}
            onRefresh={refreshOilMaintenanceAlerts}
          />
          <RealtimeRefresh
            channelName={`dashboard-oil-odometers-${user.id}`}
            table="driver_shifts"
            filter={oilMaintenanceRealtimeFilter}
            toast={dictionary.dashboard.oilMaintenancePanel.realtimeUpdated}
            enabled={canSubscribeToOilMaintenanceAlerts && Boolean(oilMaintenanceRealtimeFilter)}
            refreshRoute={false}
            onRefresh={refreshOilMaintenanceAlerts}
          />
          <PermissionRevisionSync
            initialRevision={authorizationRevision}
            userId={user.id}
            message="تم تحديث صلاحيات حسابك. يتم تحديث الواجهة الآن."
          />
          <DashboardHeader
            locale={locale}
            dictionary={dictionary}
            user={user}
            organizations={organizations}
            appNotifications={displayedAppNotifications}
            systemExpiryAlerts={systemExpiryAlerts}
            oilMaintenanceAlerts={displayedOilMaintenanceAlerts}
            onOpenSidebar={() => setMobileOpen(true)}
          />
          <main className="min-h-[calc(100vh-4rem)] w-full">
            {navigationPending ? <DashboardLoadingState /> : children}
          </main>
        </section>
      </div>
    </>
  );
}
