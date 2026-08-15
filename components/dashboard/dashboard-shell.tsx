"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { usePathname } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { PermissionRevisionSync } from "@/components/dashboard/permission-revision-sync";
import { RealtimeRefresh } from "@/components/dashboard/realtime-refresh";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import type { AccessibleOrganization } from "@/features/organizations/types";
import type { AppNotification } from "@/features/notifications/types";
import type { SystemExpiryAlertsResult } from "@/features/expiry-alerts/types";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/types/locale";
import type { ProfileRole } from "@/types/profile";

type DashboardShellProps = {
  locale: Locale;
  dictionary: Dictionary;
  user: {
    id: string;
    fullName: string | null;
    jobTitle: string | null;
    role: ProfileRole;
    hasGlobalFleetPermission: boolean;
    hasGlobalHousingPermission: boolean;
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
  children,
}: DashboardShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [liveAppNotifications, setLiveAppNotifications] =
    useState<typeof appNotifications | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const pathname = usePathname();

  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setIsNavigating(false);
    setPendingHref(null);
  }

  useEffect(() => {
    const handlePopState = () => {
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
        url.pathname === currentUrl.pathname &&
        url.search === currentUrl.search
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
    });
  }, [pendingHref]);

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

    const isHash = href.startsWith("#") || (href.includes("#") && href.split("#")[0] === window.location.pathname);
    if (isHash) return;

    const isInternal =
      (href.startsWith("/") && !href.startsWith("//")) ||
      href.startsWith(window.location.origin);
    if (!isInternal) return;

    try {
      const url = new URL(href, window.location.origin);
      const currentUrl = new URL(window.location.href);
      if (
        url.pathname === currentUrl.pathname &&
        url.search === currentUrl.search
      ) {
        return;
      }
    } catch {
      return;
    }

    flushSync(() => {
      setIsNavigating(true);
    });
  }, []);

  const sidebarWidth = collapsed ? "88px" : "292px";
  const displayedAppNotifications = liveAppNotifications ?? appNotifications;
  const canSubscribeToRequestNotifications =
    appNotifications.canViewNotifications &&
    organizations.some((organization) =>
      organization.permissionKeys.includes("notifications.view") &&
      organization.permissionKeys.includes("app_requests.view"),
    );

  const refreshAppNotifications = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard/notifications", {
        cache: "no-store",
        credentials: "same-origin",
      });

      if (!response.ok) {
        return;
      }

      const nextNotifications = (await response.json()) as typeof appNotifications;
      setLiveAppNotifications(nextNotifications);
    } catch {
      // The realtime component still triggers router.refresh() as a fallback.
    }
  }, []);

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-navy/42 transition-opacity lg:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setMobileOpen(false)}
      />
      {(isNavigating || pendingHref !== null) && (
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
            toast={dictionary.dashboard.notificationPanel.realtimeUpdated}
            enabled={canSubscribeToRequestNotifications}
            onRefresh={refreshAppNotifications}
          />
          <PermissionRevisionSync
            initialRevision={authorizationRevision}
            message="تم تحديث صلاحيات حسابك. يتم تحديث الواجهة الآن."
          />
          <DashboardHeader
            locale={locale}
            dictionary={dictionary}
            user={user}
            organizations={organizations}
            appNotifications={displayedAppNotifications}
            systemExpiryAlerts={systemExpiryAlerts}
            onOpenSidebar={() => setMobileOpen(true)}
          />
          <main className="min-h-[calc(100vh-4rem)] w-full">{children}</main>
        </section>
      </div>
    </>
  );
}
