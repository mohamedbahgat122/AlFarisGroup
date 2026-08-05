"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { RealtimeRefresh } from "@/components/dashboard/realtime-refresh";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import type { AccessibleOrganization } from "@/features/organizations/types";
import type { AppNotification } from "@/features/notifications/types";
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
  };
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
  children?: React.ReactNode;
};

export function DashboardShell({
  locale,
  dictionary,
  user,
  organizations,
  appNotifications,
  children,
}: DashboardShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [liveAppNotifications, setLiveAppNotifications] =
    useState<typeof appNotifications | null>(null);
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

  useEffect(() => {
    if (!canSubscribeToRequestNotifications) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void refreshAppNotifications();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [canSubscribeToRequestNotifications, refreshAppNotifications]);

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-navy/42 transition-opacity lg:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setMobileOpen(false)}
      />
      <div
        className="dashboard-grid min-h-screen w-full overflow-x-hidden bg-background text-navy lg:grid lg:h-screen"
        style={{ "--sidebar-width": sidebarWidth } as CSSProperties}
      >
        <DashboardSidebar
          locale={locale}
          dictionary={dictionary.dashboard}
          userRole={user.role}
          organizations={organizations}
          collapsed={collapsed}
          mobileOpen={mobileOpen}
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
          <DashboardHeader
            locale={locale}
            dictionary={dictionary}
            user={user}
            organizations={organizations}
            appNotifications={displayedAppNotifications}
            onOpenSidebar={() => setMobileOpen(true)}
          />
          <main className="min-h-[calc(100vh-4rem)] w-full">{children}</main>
        </section>
      </div>
    </>
  );
}
