import { DashboardUserControls } from "@/components/dashboard/dashboard-user-controls";
import { OrganizationSwitcher } from "@/components/dashboard/organization-switcher";
import type { AccessibleOrganization } from "@/features/organizations/types";
import type { OilMaintenanceAlertsResult } from "@/features/app-requests/types";
import type { AppNotification } from "@/features/notifications/types";
import type { SystemExpiryAlertsResult } from "@/features/expiry-alerts/types";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/types/locale";

type DashboardHeaderProps = {
  locale: Locale;
  dictionary: Dictionary;
  user: {
    id: string;
    fullName: string | null;
    jobTitle: string | null;
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
  systemExpiryAlerts: SystemExpiryAlertsResult;
  oilMaintenanceAlerts: OilMaintenanceAlertsResult;
  onOpenSidebar: () => void;
};

export function DashboardHeader({
  locale,
  dictionary,
  user,
  organizations,
  appNotifications,
  systemExpiryAlerts,
  oilMaintenanceAlerts,
  onOpenSidebar,
}: DashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-surface/98 px-4 shadow-sm backdrop-blur sm:px-6 lg:h-18">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label={dictionary.dashboard.openSidebar}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-navy shadow-sm transition hover:border-primary/35 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:hidden"
        >
          <MenuIcon />
        </button>
        <OrganizationSwitcher
          locale={locale}
          dictionary={dictionary.dashboard.organizations}
          organizations={organizations}
        />
      </div>
      <DashboardUserControls
        locale={locale}
        dictionary={dictionary}
        user={user}
        appNotifications={appNotifications}
        systemExpiryAlerts={systemExpiryAlerts}
        oilMaintenanceAlerts={oilMaintenanceAlerts}
      />
    </header>
  );
}

function MenuIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
