"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandIdentity } from "@/components/brand/brand-identity";
import type { AccessibleOrganization } from "@/features/organizations/types";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/types/locale";
import type { ProfileRole } from "@/types/profile";

type DashboardSidebarProps = {
  locale: Locale;
  dictionary: Dictionary["dashboard"];
  userRole: ProfileRole;
  hasGlobalFleetPermission: boolean;
  hasGlobalHousingPermission: boolean;
  hasGlobalSupervisorShiftsPermission: boolean;
  organizations: AccessibleOrganization[];
  collapsed: boolean;
  mobileOpen: boolean;
  pendingHref: string | null;
  onSidebarLinkClick: (href: string | null, event: React.MouseEvent) => void;
  onToggleCollapsed: () => void;
  onCloseMobile: () => void;
};

export function DashboardSidebar({
  locale,
  dictionary,
  userRole,
  hasGlobalFleetPermission,
  hasGlobalHousingPermission,
  hasGlobalSupervisorShiftsPermission,
  organizations,
  collapsed,
  mobileOpen,
  pendingHref,
  onSidebarLinkClick,
  onToggleCollapsed,
  onCloseMobile,
}: DashboardSidebarProps) {
  const pathname = usePathname();

  const checkActive = useCallback((routeHref: string | null, exact = false) => {
    if (!routeHref) return false;
    const isCurrent = exact ? pathname === routeHref : (pathname === routeHref || pathname.startsWith(routeHref + "/"));
    const isPending = pendingHref ? (exact ? pendingHref === routeHref : (pendingHref === routeHref || pendingHref.startsWith(routeHref + "/"))) : false;
    return isCurrent || isPending;
  }, [pathname, pendingHref]);

  const handleLinkClick = useCallback((href: string | null, event: React.MouseEvent) => {
    onSidebarLinkClick(href, event);
  }, [onSidebarLinkClick]);

  const dashboardHref = `/${locale}/dashboard`;
  const globalFleetHref = `/${locale}/dashboard/fleet`;
  const globalFleetCarsHref = `/${locale}/dashboard/fleet/cars`;
  const globalFleetMotorcyclesHref = `/${locale}/dashboard/fleet/motorcycles`;
  const globalFleetMaterialsHref = `/${locale}/dashboard/fleet/materials`;
  const globalHousingHref = `/${locale}/dashboard/housing`;
  const globalSupervisorShiftsHref = `/${locale}/dashboard/supervisor-shifts`;
  const organizationsHref = `/${locale}/dashboard/organizations`;
  const usersHref = `/${locale}/dashboard/users`;
  const currentOrganizationCode = getCurrentOrganizationCode(pathname, locale);
  const currentOrganization = organizations.find(
    (organization) => organization.code === currentOrganizationCode,
  );
  const navigation = currentOrganization?.navigation ?? {
    organizationHome: true,
    drivers: true,
    driverReports: true,
    driverOrderReports: true,
    fleetCars: true,
    fleetMotorcycles: true,
    fuelManagement: true,
    fuelReports: true,
    appRequests: true,
    appRequestLeave: true,
    appRequestMaintenance: true,
    appRequestMeeting: true,
    appRequestOilChange: true,
    appRequestShiftChange: true,
    notifications: true,
    odometerManagement: true,
    driverWarnings: true,
    shifts: true,
    orderPeriods: true,
    maintenanceMaterials: true,
  };
  const organizationHomeHref = currentOrganizationCode
    ? `${organizationsHref}/${currentOrganizationCode}`
    : null;
  const organizationDriversHref = currentOrganizationCode
    ? `${organizationsHref}/${currentOrganizationCode}/drivers`
    : null;
  const organizationDriversReportsHref = organizationDriversHref
    ? `${organizationDriversHref}/reports`
    : null;
  const organizationDriversOrderReportsHref = organizationDriversHref
    ? `${organizationDriversHref}/order-reports`
    : null;
  const organizationDriversResignationsHref = organizationDriversHref
    ? `${organizationDriversHref}/resignations`
    : null;
  const organizationFuelHref = currentOrganizationCode
    ? `${organizationsHref}/${currentOrganizationCode}/fuel`
    : null;
  const organizationFuelManagementHref = organizationFuelHref
    ? `${organizationFuelHref}/manage`
    : null;
  const organizationFuelReportsHref = organizationFuelHref
    ? `${organizationFuelHref}/reports`
    : null;
  const organizationAppRequestsHref = currentOrganizationCode
    ? `${organizationsHref}/${currentOrganizationCode}/app-requests`
    : null;
  const organizationOdometerHref = organizationAppRequestsHref
    ? `${organizationAppRequestsHref}/odometer`
    : null;
  const organizationLeaveRequestsHref = organizationAppRequestsHref
    ? `${organizationAppRequestsHref}/leave`
    : null;
  const organizationMaintenanceRequestsHref = organizationAppRequestsHref
    ? `${organizationAppRequestsHref}/maintenance`
    : null;
  const organizationMeetingRequestsHref = organizationAppRequestsHref
    ? `${organizationAppRequestsHref}/meetings`
    : null;
  const organizationOilChangeRequestsHref = organizationAppRequestsHref
    ? `${organizationAppRequestsHref}/oil-change`
    : null;
  const organizationShiftChangeRequestsHref = organizationAppRequestsHref
    ? `${organizationAppRequestsHref}/shifts`
    : null;
  const organizationShiftsHref = currentOrganizationCode
    ? `${organizationsHref}/${currentOrganizationCode}/shifts`
    : null;
  const organizationShiftsManagementHref = organizationShiftsHref
    ? `${organizationShiftsHref}/manage`
    : null;
  const organizationOrderPeriodsHref = currentOrganizationCode
    ? `${organizationsHref}/${currentOrganizationCode}/orders/manage`
    : null;
  const organizationDriverWarningsHref = currentOrganizationCode
    ? `${organizationsHref}/${currentOrganizationCode}/driver-warnings`
    : null;
  const isUsersActive = checkActive(usersHref, true);
  const isOrganizationsActive = checkActive(organizationsHref);
  const isOrganizationHomeActive =
    Boolean(organizationHomeHref) && checkActive(organizationHomeHref, true);
  const isOrganizationDriversActive =
    Boolean(organizationDriversHref) && checkActive(organizationDriversHref);
  const isOrganizationDriversDataActive =
    Boolean(organizationDriversHref) && checkActive(organizationDriversHref, true);
  const isOrganizationDriversReportsActive =
    Boolean(organizationDriversReportsHref) && checkActive(organizationDriversReportsHref);
  const isOrganizationDriversOrderReportsActive =
    Boolean(organizationDriversOrderReportsHref) && checkActive(organizationDriversOrderReportsHref);
  const isOrganizationDriversResignationsActive =
    Boolean(organizationDriversResignationsHref) && checkActive(organizationDriversResignationsHref);
  const isOrganizationFuelActive =
    Boolean(organizationFuelHref) && checkActive(organizationFuelHref);
  const isOrganizationFuelManagementActive =
    Boolean(organizationFuelManagementHref) &&
    checkActive(organizationFuelManagementHref, true);
  const isOrganizationFuelReportsActive =
    Boolean(organizationFuelReportsHref) && checkActive(organizationFuelReportsHref, true);
  const isOrganizationAppRequestsActive =
    Boolean(organizationAppRequestsHref) && checkActive(organizationAppRequestsHref);
  const isOrganizationOdometerActive =
    Boolean(organizationOdometerHref) && checkActive(organizationOdometerHref, true);
  const isOrganizationLeaveRequestsActive =
    Boolean(organizationLeaveRequestsHref) &&
    checkActive(organizationLeaveRequestsHref, true);
  const isOrganizationMaintenanceRequestsActive =
    Boolean(organizationMaintenanceRequestsHref) &&
    checkActive(organizationMaintenanceRequestsHref, true);
  const isOrganizationMeetingRequestsActive =
    Boolean(organizationMeetingRequestsHref) &&
    checkActive(organizationMeetingRequestsHref, true);
  const isOrganizationOilChangeRequestsActive =
    Boolean(organizationOilChangeRequestsHref) &&
    checkActive(organizationOilChangeRequestsHref, true);
  const isOrganizationShiftChangeRequestsActive =
    Boolean(organizationShiftChangeRequestsHref) &&
    checkActive(organizationShiftChangeRequestsHref, true);
  const isOrganizationShiftsActive =
    Boolean(organizationShiftsHref) && checkActive(organizationShiftsHref);
  const isOrganizationShiftsManagementActive =
    Boolean(organizationShiftsManagementHref) &&
    checkActive(organizationShiftsManagementHref, true);
  const isOrganizationOrderPeriodsActive =
    Boolean(organizationOrderPeriodsHref) &&
    checkActive(organizationOrderPeriodsHref, true);
  const isOrganizationDriverWarningsActive =
    Boolean(organizationDriverWarningsHref) &&
    checkActive(organizationDriverWarningsHref, true);
  const isDashboardActive = checkActive(dashboardHref, true);
  const isGlobalFleetActive = checkActive(globalFleetHref);
  const isGlobalFleetCarsActive = checkActive(globalFleetCarsHref, true);
  const isGlobalFleetMotorcyclesActive = checkActive(globalFleetMotorcyclesHref, true);
  const isGlobalFleetMaterialsActive = checkActive(globalFleetMaterialsHref, true);
  const isGlobalHousingActive = checkActive(globalHousingHref);
  const isGlobalSupervisorShiftsActive = checkActive(globalSupervisorShiftsHref);

  const isDashboardPending = pendingHref === dashboardHref;
  const isGlobalFleetCarsPending = pendingHref === globalFleetCarsHref;
  const isGlobalFleetMotorcyclesPending = pendingHref === globalFleetMotorcyclesHref;
  const isGlobalFleetMaterialsPending = pendingHref === globalFleetMaterialsHref;
  const isGlobalHousingPending = pendingHref === globalHousingHref;
  const isGlobalSupervisorShiftsPending = pendingHref === globalSupervisorShiftsHref;
  const isOrganizationsPending = pendingHref === organizationsHref;
  const isOrganizationHomePending = pendingHref === organizationHomeHref;
  const isOrganizationDriversPending = pendingHref === organizationDriversHref;
  const isOrganizationDriversReportsPending = pendingHref === organizationDriversReportsHref;
  const isOrganizationDriversOrderReportsPending = pendingHref === organizationDriversOrderReportsHref;
  const isOrganizationDriversResignationsPending = pendingHref === organizationDriversResignationsHref;
  const isOrganizationFuelManagementPending = pendingHref === organizationFuelManagementHref;
  const isOrganizationFuelReportsPending = pendingHref === organizationFuelReportsHref;
  const isOrganizationOdometerPending = pendingHref === organizationOdometerHref;
  const isOrganizationLeaveRequestsPending = pendingHref === organizationLeaveRequestsHref;
  const isOrganizationMaintenanceRequestsPending = pendingHref === organizationMaintenanceRequestsHref;
  const isOrganizationMeetingRequestsPending = pendingHref === organizationMeetingRequestsHref;
  const isOrganizationOilChangeRequestsPending = pendingHref === organizationOilChangeRequestsHref;
  const isOrganizationShiftChangeRequestsPending = pendingHref === organizationShiftChangeRequestsHref;
  const isOrganizationShiftsManagementPending = pendingHref === organizationShiftsManagementHref;
  const isOrganizationOrderPeriodsPending = pendingHref === organizationOrderPeriodsHref;
  const isOrganizationDriverWarningsPending = pendingHref === organizationDriverWarningsHref;
  const isUsersPending = pendingHref === usersHref;
  const canSeeOrganizations = userRole !== "driver";
  const canSeeUserManagement = userRole === "system_owner";
  const hasMaintenanceMaterialsPermission =
    userRole === "system_owner" ||
    organizations.some((organization) =>
      organization.permissionKeys.includes("maintenance_materials.view") ||
      organization.permissionKeys.includes("maintenance_materials.manage"),
    );
  const [manualGlobalFleetGroupOpen, setManualGlobalFleetGroupOpen] = useState(false);
  const [manualGlobalSupervisorsGroupOpen, setManualGlobalSupervisorsGroupOpen] = useState(false);
  const [manualDriversGroupOpen, setManualDriversGroupOpen] = useState(false);
  const [manualFuelGroupOpen, setManualFuelGroupOpen] = useState(false);
  const [manualAppRequestsGroupOpen, setManualAppRequestsGroupOpen] =
    useState(false);
  const [manualShiftsGroupOpen, setManualShiftsGroupOpen] = useState(false);
  const [driversFlyoutOpen, setDriversFlyoutOpen] = useState(false);
  const navigationRef = useRef<HTMLElement>(null);
  const driversFlyoutRef = useRef<HTMLDivElement>(null);
  const driversButtonRef = useRef<HTMLButtonElement>(null);
  const globalFleetGroupId = "dashboard-sidebar-global-fleet-group";
  const globalSupervisorsGroupId = "dashboard-sidebar-global-supervisors-group";
  const driversGroupId = "dashboard-sidebar-drivers-group";
  const fuelGroupId = "dashboard-sidebar-fuel-group";
  const appRequestsGroupId = "dashboard-sidebar-app-requests-group";
  const shiftsGroupId = "dashboard-sidebar-shifts-group";
  const globalFleetGroupOpen = isGlobalFleetActive || manualGlobalFleetGroupOpen;
  const globalSupervisorsGroupOpen = isGlobalSupervisorShiftsActive || manualGlobalSupervisorsGroupOpen;
  const driversGroupOpen =
    isOrganizationDriversActive || manualDriversGroupOpen;
  const fuelGroupOpen = isOrganizationFuelActive || manualFuelGroupOpen;
  const appRequestsGroupOpen =
    isOrganizationAppRequestsActive || manualAppRequestsGroupOpen;
  const shiftsGroupOpen = isOrganizationShiftsActive || manualShiftsGroupOpen;

  useEffect(() => {
    if (!driversFlyoutOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (
        target instanceof Node &&
        (driversFlyoutRef.current?.contains(target) ||
          driversButtonRef.current?.contains(target))
      ) {
        return;
      }

      setDriversFlyoutOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDriversFlyoutOpen(false);
        driversButtonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [driversFlyoutOpen]);

  useEffect(() => {
    const activeItem = navigationRef.current?.querySelector(
      '[aria-current="page"]',
    );

    if (!(activeItem instanceof HTMLElement)) {
      return;
    }

    window.requestAnimationFrame(() => {
      activeItem.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }, [
    appRequestsGroupOpen,
    collapsed,
    driversGroupOpen,
    globalFleetGroupOpen,
    globalSupervisorsGroupOpen,
    fuelGroupOpen,
    shiftsGroupOpen,
    pathname,
  ]);

  return (
    <aside
      className={`fixed inset-y-0 z-40 flex h-dvh w-73 flex-col overflow-hidden border-border bg-surface shadow-[0_22px_70px_rgba(16,35,63,0.16)] transition-[transform,width] duration-300 [border-inline-end-width:1px] inset-s-0 lg:sticky lg:top-0 lg:w-(--sidebar-width) lg:transform-none lg:shadow-none lg:[inset-inline-start:auto] ${
        mobileOpen
          ? "max-lg:translate-x-0"
          : "max-lg:ltr:-translate-x-full max-lg:rtl:translate-x-full"
      }`}
    >
      <div
        className={`flex min-h-20 shrink-0 items-center justify-between border-b border-border px-4 ${
          collapsed
            ? "lg:min-h-28 lg:flex-col lg:justify-center lg:gap-2 lg:px-3"
            : ""
        }`}
      >
        <div className="min-w-0">
          <BrandIdentity
            locale={locale}
            variant={collapsed ? "iconOnly" : "compact"}
          />
        </div>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={
            collapsed ? dictionary.expandSidebar : dictionary.collapseSidebar
          }
          title={
            collapsed ? dictionary.expandSidebar : dictionary.collapseSidebar
          }
          aria-pressed={collapsed}
          className="hidden size-9 shrink-0 items-center justify-center rounded-lg bg-transparent text-muted transition hover:bg-primary-soft hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:flex"
        >
          <SidebarPanelToggleIcon
            collapsed={collapsed}
            locale={locale}
          />
        </button>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label={dictionary.closeSidebar}
          className="flex size-10 items-center justify-center rounded-lg text-muted transition hover:bg-primary-soft hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:hidden"
        >
          <CloseIcon />
        </button>
      </div>

      <nav
        ref={navigationRef}
        className="dashboard-sidebar-nav min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-5"
        aria-label={dictionary.navLabel}
      >
        <div className="space-y-2">
          <Link
            href={dashboardHref}
            aria-current={isDashboardActive ? "page" : undefined}
            title={collapsed ? dictionary.navLabel : undefined}
            onClick={(e) => handleLinkClick(dashboardHref, e)}
            className={`${navItemClassName(isDashboardActive, collapsed)} ${isDashboardPending ? "pointer-events-none cursor-wait" : ""}`}
          >
            <span className={navIconClassName(isDashboardActive)}>
              {isDashboardPending ? <SidebarSpinnerActive /> : <DashboardIcon />}
            </span>
            <span className={collapsed ? "lg:hidden" : ""}>
              {dictionary.navLabel}
            </span>
          </Link>
          {hasGlobalFleetPermission || hasMaintenanceMaterialsPermission ? (
            <>
              <button
                type="button"
                aria-expanded={globalFleetGroupOpen}
                aria-controls={globalFleetGroupId}
                aria-label={
                  globalFleetGroupOpen
                    ? dictionary.fleet.collapseFleetMenu
                    : dictionary.fleet.expandFleetMenu
                }
                onClick={() => setManualGlobalFleetGroupOpen((open) => !open)}
                className={`${navItemClassName(isGlobalFleetActive, collapsed)} w-full`}
              >
                <span className={navIconClassName(isGlobalFleetActive)}>
                  <FleetIcon />
                </span>
                <span className={collapsed ? "lg:hidden" : ""}>{dictionary.fleet.navLabel}</span>
                <span
                  className={`ms-auto transition-transform duration-200 ${collapsed ? "lg:hidden" : ""} ${
                    globalFleetGroupOpen ? "rotate-180" : ""
                  }`}
                >
                  <DownChevronIcon />
                </span>
              </button>
              {globalFleetGroupOpen ? (
                <div id={globalFleetGroupId} className={`space-y-1 ${collapsed ? "lg:hidden" : "ps-4"}`}>
                  {hasGlobalFleetPermission ? (
                    <>
                      <Link
                        href={globalFleetCarsHref}
                        aria-current={
                          isGlobalFleetCarsActive ? "page" : undefined
                        }
                        onClick={(e) => handleLinkClick(globalFleetCarsHref, e)}
                        className={`${subNavItemClassName(
                          isGlobalFleetCarsActive,
                        )} ${isGlobalFleetCarsPending ? "pointer-events-none cursor-wait" : ""}`}
                      >
                        {isGlobalFleetCarsPending ? (
                          <SidebarSpinnerActive className="size-3" />
                        ) : (
                          <span
                            className={subNavDotClassName(
                              isGlobalFleetCarsActive,
                            )}
                          />
                        )}
                        <span>{dictionary.fleet.carsNavLabel}</span>
                      </Link>
                      <Link
                        href={globalFleetMotorcyclesHref}
                        aria-current={
                          isGlobalFleetMotorcyclesActive
                            ? "page"
                            : undefined
                        }
                        onClick={(e) => handleLinkClick(globalFleetMotorcyclesHref, e)}
                        className={`${subNavItemClassName(
                          isGlobalFleetMotorcyclesActive,
                        )} ${isGlobalFleetMotorcyclesPending ? "pointer-events-none cursor-wait" : ""}`}
                      >
                        {isGlobalFleetMotorcyclesPending ? (
                          <SidebarSpinnerActive className="size-3" />
                        ) : (
                          <span
                            className={subNavDotClassName(
                              isGlobalFleetMotorcyclesActive,
                            )}
                          />
                        )}
                        <span>{dictionary.fleet.motorcyclesNavLabel}</span>
                      </Link>
                    </>
                  ) : null}
                  {hasMaintenanceMaterialsPermission ? (
                    <Link
                      href={globalFleetMaterialsHref}
                      aria-current={
                        isGlobalFleetMaterialsActive ? "page" : undefined
                      }
                      onClick={(e) => handleLinkClick(globalFleetMaterialsHref, e)}
                      className={`${subNavItemClassName(
                        isGlobalFleetMaterialsActive,
                      )} ${isGlobalFleetMaterialsPending ? "pointer-events-none cursor-wait" : ""}`}
                    >
                      {isGlobalFleetMaterialsPending ? (
                        <SidebarSpinnerActive className="size-3" />
                      ) : (
                        <span
                          className={subNavDotClassName(
                            isGlobalFleetMaterialsActive,
                          )}
                        />
                      )}
                      <span>{dictionary.fleet.materialsNavLabel}</span>
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
          {hasGlobalHousingPermission ? (
            <Link
              href={globalHousingHref}
              aria-current={isGlobalHousingActive ? "page" : undefined}
              title={collapsed ? dictionary.housing.navLabel : undefined}
              onClick={(e) => handleLinkClick(globalHousingHref, e)}
              className={`${navItemClassName(isGlobalHousingActive, collapsed)} ${isGlobalHousingPending ? "pointer-events-none cursor-wait" : ""}`}
            >
              <span className={navIconClassName(isGlobalHousingActive)}>
                {isGlobalHousingPending ? <SidebarSpinnerActive /> : <HousingIcon />}
              </span>
              <span className={collapsed ? "lg:hidden" : ""}>
                {dictionary.housing.navLabel}
              </span>
            </Link>
          ) : null}
          {hasGlobalSupervisorShiftsPermission ? (
            <>
              <button
                type="button"
                aria-expanded={globalSupervisorsGroupOpen}
                aria-controls={globalSupervisorsGroupId}
                aria-label={
                  globalSupervisorsGroupOpen
                    ? dictionary.supervisorsNavigation.collapse
                    : dictionary.supervisorsNavigation.expand
                }
                onClick={() => setManualGlobalSupervisorsGroupOpen((open) => !open)}
                className={`${navItemClassName(isGlobalSupervisorShiftsActive, collapsed)} w-full`}
              >
                <span className={navIconClassName(isGlobalSupervisorShiftsActive)}>
                  <ShiftsIcon />
                </span>
                <span className={collapsed ? "lg:hidden" : ""}>{dictionary.supervisorsNavigation.group}</span>
                <span
                  className={`ms-auto transition-transform duration-200 ${collapsed ? "lg:hidden" : ""} ${
                    globalSupervisorsGroupOpen ? "rotate-180" : ""
                  }`}
                >
                  <DownChevronIcon />
                </span>
              </button>
              {globalSupervisorsGroupOpen ? (
                <div id={globalSupervisorsGroupId} className={`space-y-1 ${collapsed ? "lg:hidden" : "ps-4"}`}>
                  {hasGlobalSupervisorShiftsPermission ? (
                    <Link
                      href={globalSupervisorShiftsHref}
                      aria-current={
                        isGlobalSupervisorShiftsActive ? "page" : undefined
                      }
                      onClick={(e) => handleLinkClick(globalSupervisorShiftsHref, e)}
                      className={`${subNavItemClassName(
                        isGlobalSupervisorShiftsActive,
                      )} ${isGlobalSupervisorShiftsPending ? "pointer-events-none cursor-wait" : ""}`}
                    >
                      {isGlobalSupervisorShiftsPending ? (
                        <SidebarSpinnerActive className="size-3" />
                      ) : (
                        <span
                          className={subNavDotClassName(
                            isGlobalSupervisorShiftsActive,
                          )}
                        />
                      )}
                      <span>{dictionary.supervisorsNavigation.shifts}</span>
                    </Link>
                  ) : null}
                  {/*
                    <Link
                      href={globalSupervisorEntitlementsHref}
                      aria-current={
                        isGlobalSupervisorEntitlementsActive ? "page" : undefined
                      }
                      onClick={(e) => handleLinkClick(globalSupervisorEntitlementsHref, e)}
                      className={`${subNavItemClassName(
                        isGlobalSupervisorEntitlementsActive,
                      )} ${isGlobalSupervisorEntitlementsPending ? "pointer-events-none cursor-wait" : ""}`}
                    >
                      {isGlobalSupervisorEntitlementsPending ? (
                        <SidebarSpinnerActive className="size-3" />
                      ) : (
                        <span
                          className={subNavDotClassName(
                            isGlobalSupervisorEntitlementsActive,
                          )}
                        />
                      )}
                      <span>{"مستحقات المشرفين"}</span>
                    </Link>
                  */}
                </div>
              ) : null}
            </>
          ) : null}
          {canSeeOrganizations ? (
            <>
              <Link
                href={organizationsHref}
                aria-current={isOrganizationsActive ? "page" : undefined}
                title={collapsed ? dictionary.organizations.navLabel : undefined}
                onClick={(e) => handleLinkClick(organizationsHref, e)}
                className={`${navItemClassName(isOrganizationsActive, collapsed)} ${isOrganizationsPending ? "pointer-events-none cursor-wait" : ""}`}
              >
                <span className={navIconClassName(isOrganizationsActive)}>
                  {isOrganizationsPending ? <SidebarSpinnerActive /> : <OrganizationsIcon />}
                </span>
                <span className={collapsed ? "lg:hidden" : ""}>
                  {dictionary.organizations.navLabel}
                </span>
              </Link>
              {organizationHomeHref && organizationDriversHref ? (
                <div className={`space-y-1 ${collapsed ? "lg:hidden" : "ps-4"}`}>
                  {navigation.organizationHome ? (
                    <Link
                      href={organizationHomeHref}
                      aria-current={isOrganizationHomeActive ? "page" : undefined}
                      onClick={(e) => handleLinkClick(organizationHomeHref, e)}
                      className={`${subNavItemClassName(isOrganizationHomeActive)} ${isOrganizationHomePending ? "pointer-events-none cursor-wait" : ""}`}
                    >
                      {isOrganizationHomePending ? (
                        <SidebarSpinnerActive className="size-3" />
                      ) : (
                        <span className={subNavDotClassName(isOrganizationHomeActive)} />
                      )}
                      <span>{dictionary.organizations.organizationHome}</span>
                    </Link>
                  ) : null}
                  {navigation.drivers || navigation.driverReports ? (
                    <button
                    type="button"
                    aria-expanded={driversGroupOpen}
                    aria-controls={driversGroupId}
                    aria-label={
                      driversGroupOpen
                        ? dictionary.drivers.collapseDriversMenu
                        : dictionary.drivers.expandDriversMenu
                    }
                    onClick={() => setManualDriversGroupOpen((open) => !open)}
                    className={`${subNavItemClassName(
                      isOrganizationDriversActive,
                    )} w-full`}
                    >
                    <span className={subNavIconClassName(isOrganizationDriversActive)}>
                      <DriversIcon />
                    </span>
                    <span>{dictionary.drivers.navLabel}</span>
                    <span
                      className={`ms-auto transition-transform duration-200 ${
                        driversGroupOpen ? "rotate-180" : ""
                      }`}
                    >
                      <DownChevronIcon />
                    </span>
                    </button>
                  ) : null}
                  {driversGroupOpen && (navigation.drivers || navigation.driverReports) ? (
                    <div id={driversGroupId} className="space-y-1 ps-9">
                      {navigation.drivers ? (
                        <Link
                          href={organizationDriversHref}
                          aria-current={
                            isOrganizationDriversDataActive ? "page" : undefined
                          }
                          onClick={(e) => handleLinkClick(organizationDriversHref, e)}
                          className={`${subNavItemClassName(
                            isOrganizationDriversDataActive,
                          )} ${isOrganizationDriversPending ? "pointer-events-none cursor-wait" : ""}`}
                        >
                          {isOrganizationDriversPending ? (
                            <SidebarSpinnerActive className="size-3" />
                          ) : (
                            <span
                              className={subNavDotClassName(
                                isOrganizationDriversDataActive,
                              )}
                            />
                          )}
                          <span>{dictionary.drivers.dataNavLabel}</span>
                        </Link>
                      ) : null}
                      {organizationDriversReportsHref && navigation.driverReports ? (
                        <Link
                          href={organizationDriversReportsHref}
                          aria-current={
                            isOrganizationDriversReportsActive
                              ? "page"
                              : undefined
                          }
                          onClick={(e) => handleLinkClick(organizationDriversReportsHref, e)}
                          className={`${subNavItemClassName(
                            isOrganizationDriversReportsActive,
                          )} ${isOrganizationDriversReportsPending ? "pointer-events-none cursor-wait" : ""}`}
                        >
                          {isOrganizationDriversReportsPending ? (
                            <SidebarSpinnerActive className="size-3" />
                          ) : (
                            <span
                              className={subNavDotClassName(
                                isOrganizationDriversReportsActive,
                              )}
                            />
                          )}
                          <span>{dictionary.drivers.reportsNavLabel}</span>
                        </Link>
                      ) : null}
                      {organizationDriversOrderReportsHref && navigation.driverOrderReports ? (
                        <Link
                          href={organizationDriversOrderReportsHref}
                          aria-current={isOrganizationDriversOrderReportsActive ? "page" : undefined}
                          onClick={(e) => handleLinkClick(organizationDriversOrderReportsHref, e)}
                          className={`${subNavItemClassName(isOrganizationDriversOrderReportsActive)} ${isOrganizationDriversOrderReportsPending ? "pointer-events-none cursor-wait" : ""}`}
                        >
                          {isOrganizationDriversOrderReportsPending ? <SidebarSpinnerActive className="size-3" /> : <span className={subNavDotClassName(isOrganizationDriversOrderReportsActive)} />}
                          <span>{dictionary.drivers.orderReportsNavLabel}</span>
                        </Link>
                      ) : null}
                      {organizationDriversResignationsHref && navigation.drivers ? (
                        <Link
                          href={organizationDriversResignationsHref}
                          aria-current={
                            isOrganizationDriversResignationsActive
                              ? "page"
                              : undefined
                          }
                          onClick={(e) => handleLinkClick(organizationDriversResignationsHref, e)}
                          className={`${subNavItemClassName(
                            isOrganizationDriversResignationsActive,
                          )} ${isOrganizationDriversResignationsPending ? "pointer-events-none cursor-wait" : ""}`}
                        >
                          {isOrganizationDriversResignationsPending ? (
                            <SidebarSpinnerActive className="size-3" />
                          ) : (
                            <span
                              className={subNavDotClassName(
                                isOrganizationDriversResignationsActive,
                              )}
                            />
                          )}
                          <span>{dictionary.drivers.resignationsNavLabel}</span>
                        </Link>
                      ) : null}
                      {/*
                        <Link
                          href={organizationEntitlementsHref}
                          aria-current={
                            isOrganizationEntitlementsActive
                              ? "page"
                              : undefined
                          }
                          onClick={(e) => handleLinkClick(organizationEntitlementsHref, e)}
                          className={`${subNavItemClassName(
                            isOrganizationEntitlementsActive,
                          )} ${isOrganizationEntitlementsPending ? "pointer-events-none cursor-wait" : ""}`}
                        >
                          {isOrganizationEntitlementsPending ? (
                            <SidebarSpinnerActive className="size-3" />
                          ) : (
                            <span
                              className={subNavDotClassName(
                                isOrganizationEntitlementsActive,
                              )}
                            />
                          )}
                        </Link>
                      */}
                    </div>
                  ) : null}
                  {(navigation.fuelManagement || navigation.fuelReports) &&
                  organizationFuelManagementHref &&
                  organizationFuelReportsHref ? (
                    <>
                      <button
                        type="button"
                        aria-expanded={fuelGroupOpen}
                        aria-controls={fuelGroupId}
                        aria-label={dictionary.fuel.navLabel}
                        onClick={() => setManualFuelGroupOpen((open) => !open)}
                        className={`${subNavItemClassName(
                          isOrganizationFuelActive,
                        )} w-full`}
                      >
                        <span className={subNavIconClassName(isOrganizationFuelActive)}>
                          <FuelIcon />
                        </span>
                        <span>{dictionary.fuel.navLabel}</span>
                        <span
                          className={`ms-auto transition-transform duration-200 ${
                            fuelGroupOpen ? "rotate-180" : ""
                          }`}
                        >
                          <DownChevronIcon />
                        </span>
                      </button>
                      {fuelGroupOpen ? (
                        <div id={fuelGroupId} className="space-y-1 ps-9">
                          {navigation.fuelManagement ? (
                            <Link
                              href={organizationFuelManagementHref}
                              aria-current={
                                isOrganizationFuelManagementActive
                                  ? "page"
                                  : undefined
                              }
                              onClick={(e) => handleLinkClick(organizationFuelManagementHref, e)}
                              className={`${subNavItemClassName(
                                isOrganizationFuelManagementActive,
                              )} ${isOrganizationFuelManagementPending ? "pointer-events-none cursor-wait" : ""}`}
                            >
                              {isOrganizationFuelManagementPending ? (
                                <SidebarSpinnerActive className="size-3" />
                              ) : (
                                <span
                                  className={subNavDotClassName(
                                    isOrganizationFuelManagementActive,
                                  )}
                                />
                              )}
                              <span>{dictionary.fuel.managementNavLabel}</span>
                            </Link>
                          ) : null}
                          {navigation.fuelReports ? (
                            <Link
                              href={organizationFuelReportsHref}
                              aria-current={
                                isOrganizationFuelReportsActive
                                  ? "page"
                                  : undefined
                              }
                              onClick={(e) => handleLinkClick(organizationFuelReportsHref, e)}
                              className={`${subNavItemClassName(
                                isOrganizationFuelReportsActive,
                              )} ${isOrganizationFuelReportsPending ? "pointer-events-none cursor-wait" : ""}`}
                            >
                              {isOrganizationFuelReportsPending ? (
                                <SidebarSpinnerActive className="size-3" />
                              ) : (
                                <span
                                  className={subNavDotClassName(
                                    isOrganizationFuelReportsActive,
                                  )}
                                />
                              )}
                              <span>{dictionary.fuel.reportsNavLabel}</span>
                            </Link>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  {(navigation.odometerManagement || navigation.appRequestLeave || navigation.appRequestMaintenance || navigation.appRequestMeeting || navigation.appRequestOilChange || navigation.appRequestShiftChange) &&
                  organizationOdometerHref &&
                  organizationLeaveRequestsHref &&
                  organizationMaintenanceRequestsHref &&
                  organizationMeetingRequestsHref &&
                  organizationOilChangeRequestsHref &&
                  organizationShiftChangeRequestsHref ? (
                    <>
                      <button
                        type="button"
                        aria-expanded={appRequestsGroupOpen}
                        aria-controls={appRequestsGroupId}
                        aria-label={dictionary.appRequests.navLabel}
                        onClick={() =>
                          setManualAppRequestsGroupOpen((open) => !open)
                        }
                        className={`${subNavItemClassName(
                          isOrganizationAppRequestsActive,
                        )} w-full`}
                      >
                        <span
                          className={subNavIconClassName(
                            isOrganizationAppRequestsActive,
                          )}
                        >
                          <AppRequestsIcon />
                        </span>
                        <span>{dictionary.appRequests.navLabel}</span>
                        <span
                          className={`ms-auto transition-transform duration-200 ${
                            appRequestsGroupOpen ? "rotate-180" : ""
                          }`}
                        >
                          <DownChevronIcon />
                        </span>
                      </button>
                      {appRequestsGroupOpen ? (
                        <div id={appRequestsGroupId} className="space-y-1 ps-9">
                          {navigation.odometerManagement ? (
                            <Link
                              href={organizationOdometerHref}
                              aria-current={
                                isOrganizationOdometerActive
                                  ? "page"
                                  : undefined
                              }
                              onClick={(e) => handleLinkClick(organizationOdometerHref, e)}
                              className={`${subNavItemClassName(
                                isOrganizationOdometerActive,
                              )} ${isOrganizationOdometerPending ? "pointer-events-none cursor-wait" : ""}`}
                            >
                              {isOrganizationOdometerPending ? (
                                <SidebarSpinnerActive className="size-3" />
                              ) : (
                                <span
                                  className={subNavDotClassName(
                                    isOrganizationOdometerActive,
                                  )}
                                />
                              )}
                              <span>{dictionary.appRequests.odometerNavLabel}</span>
                            </Link>
                          ) : null}
                          {(navigation.appRequestLeave || navigation.appRequestMaintenance || navigation.appRequestMeeting || navigation.appRequestOilChange || navigation.appRequestShiftChange) ? (
                            <>
                              {navigation.appRequestLeave ? <Link
                                href={organizationLeaveRequestsHref}
                                aria-current={
                                  isOrganizationLeaveRequestsActive
                                    ? "page"
                                    : undefined
                                }
                                onClick={(e) => handleLinkClick(organizationLeaveRequestsHref, e)}
                                className={`${subNavItemClassName(
                                  isOrganizationLeaveRequestsActive,
                                )} ${isOrganizationLeaveRequestsPending ? "pointer-events-none cursor-wait" : ""}`}
                              >
                                {isOrganizationLeaveRequestsPending ? (
                                  <SidebarSpinnerActive className="size-3" />
                                ) : (
                                  <span
                                    className={subNavDotClassName(
                                      isOrganizationLeaveRequestsActive,
                                    )}
                                  />
                                )}
                                <span>{dictionary.appRequests.leaveNavLabel}</span>
                              </Link> : null}
                              {navigation.appRequestMaintenance ? <Link
                                href={organizationMaintenanceRequestsHref}
                                aria-current={
                                  isOrganizationMaintenanceRequestsActive
                                    ? "page"
                                    : undefined
                                }
                                onClick={(e) => handleLinkClick(organizationMaintenanceRequestsHref, e)}
                                className={`${subNavItemClassName(
                                  isOrganizationMaintenanceRequestsActive,
                                )} ${isOrganizationMaintenanceRequestsPending ? "pointer-events-none cursor-wait" : ""}`}
                              >
                                {isOrganizationMaintenanceRequestsPending ? (
                                  <SidebarSpinnerActive className="size-3" />
                                ) : (
                                  <span
                                    className={subNavDotClassName(
                                      isOrganizationMaintenanceRequestsActive,
                                    )}
                                  />
                                )}
                                <span>
                                  {dictionary.appRequests.maintenanceNavLabel}
                                </span>
                              </Link> : null}
                              {navigation.appRequestMeeting ? <Link
                                href={organizationMeetingRequestsHref}
                                aria-current={
                                  isOrganizationMeetingRequestsActive
                                    ? "page"
                                    : undefined
                                }
                                onClick={(e) => handleLinkClick(organizationMeetingRequestsHref, e)}
                                className={`${subNavItemClassName(
                                  isOrganizationMeetingRequestsActive,
                                )} ${isOrganizationMeetingRequestsPending ? "pointer-events-none cursor-wait" : ""}`}
                              >
                                {isOrganizationMeetingRequestsPending ? (
                                  <SidebarSpinnerActive className="size-3" />
                                ) : (
                                  <span
                                    className={subNavDotClassName(
                                      isOrganizationMeetingRequestsActive,
                                    )}
                                  />
                                )}
                                <span>{dictionary.appRequests.meetingsNavLabel}</span>
                              </Link> : null}
                              {navigation.appRequestOilChange ? <Link
                                href={organizationOilChangeRequestsHref}
                                aria-current={
                                  isOrganizationOilChangeRequestsActive
                                    ? "page"
                                    : undefined
                                }
                                onClick={(e) => handleLinkClick(organizationOilChangeRequestsHref, e)}
                                className={`${subNavItemClassName(
                                  isOrganizationOilChangeRequestsActive,
                                )} ${isOrganizationOilChangeRequestsPending ? "pointer-events-none cursor-wait" : ""}`}
                              >
                                {isOrganizationOilChangeRequestsPending ? (
                                  <SidebarSpinnerActive className="size-3" />
                                ) : (
                                  <span
                                    className={subNavDotClassName(
                                      isOrganizationOilChangeRequestsActive,
                                    )}
                                  />
                                )}
                                <span>{dictionary.appRequests.oilChangeNavLabel}</span>
                              </Link> : null}
                              {navigation.appRequestShiftChange ? <Link
                                href={organizationShiftChangeRequestsHref}
                                aria-current={
                                  isOrganizationShiftChangeRequestsActive
                                    ? "page"
                                    : undefined
                                }
                                onClick={(e) => handleLinkClick(organizationShiftChangeRequestsHref, e)}
                                className={`${subNavItemClassName(
                                  isOrganizationShiftChangeRequestsActive,
                                )} ${isOrganizationShiftChangeRequestsPending ? "pointer-events-none cursor-wait" : ""}`}
                              >
                                {isOrganizationShiftChangeRequestsPending ? (
                                  <SidebarSpinnerActive className="size-3" />
                                ) : (
                                  <span
                                    className={subNavDotClassName(
                                      isOrganizationShiftChangeRequestsActive,
                                    )}
                                  />
                                )}
                                <span>{dictionary.appRequests.shiftChangeNavLabel}</span>
                              </Link> : null}
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  {(navigation.shifts || navigation.orderPeriods) && organizationShiftsManagementHref ? (
                    <>
                      <button
                        type="button"
                        aria-expanded={shiftsGroupOpen}
                        aria-controls={shiftsGroupId}
                        aria-label={dictionary.shifts.navLabel}
                        onClick={() =>
                          setManualShiftsGroupOpen((open) => !open)
                        }
                        className={`${subNavItemClassName(
                          isOrganizationShiftsActive,
                        )} w-full`}
                      >
                        <span
                          className={subNavIconClassName(
                            isOrganizationShiftsActive,
                          )}
                        >
                          <ShiftsIcon />
                        </span>
                        <span>{dictionary.shifts.navLabel}</span>
                        <span
                          className={`ms-auto transition-transform duration-200 ${
                            shiftsGroupOpen ? "rotate-180" : ""
                          }`}
                        >
                          <DownChevronIcon />
                        </span>
                      </button>
                      {shiftsGroupOpen ? (
                        <div id={shiftsGroupId} className="space-y-1 ps-9">
                          {navigation.shifts ? <Link
                            href={organizationShiftsManagementHref}
                            aria-current={
                              isOrganizationShiftsManagementActive
                                ? "page"
                                : undefined
                            }
                            onClick={(e) => handleLinkClick(organizationShiftsManagementHref, e)}
                            className={`${subNavItemClassName(
                              isOrganizationShiftsManagementActive,
                            )} ${isOrganizationShiftsManagementPending ? "pointer-events-none cursor-wait" : ""}`}
                          >
                            {isOrganizationShiftsManagementPending ? (
                              <SidebarSpinnerActive className="size-3" />
                            ) : (
                              <span
                                className={subNavDotClassName(
                                  isOrganizationShiftsManagementActive,
                                )}
                              />
                            )}
                            <span>{dictionary.shifts.managementNavLabel}</span>
                          </Link> : null}
                          {navigation.orderPeriods && organizationOrderPeriodsHref ? (
                            <Link
                              href={organizationOrderPeriodsHref}
                              aria-current={
                                isOrganizationOrderPeriodsActive ? "page" : undefined
                              }
                              onClick={(e) => handleLinkClick(organizationOrderPeriodsHref, e)}
                              className={`${subNavItemClassName(
                                isOrganizationOrderPeriodsActive,
                              )} ${isOrganizationOrderPeriodsPending ? "pointer-events-none cursor-wait" : ""}`}
                            >
                              {isOrganizationOrderPeriodsPending ? (
                                <SidebarSpinnerActive className="size-3" />
                              ) : (
                                <span
                                  className={subNavDotClassName(
                                    isOrganizationOrderPeriodsActive,
                                  )}
                                />
                              )}
                              <span>{dictionary.orderPeriods.navLabel}</span>
                            </Link>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  {navigation.driverWarnings && organizationDriverWarningsHref ? (
                    <Link
                      href={organizationDriverWarningsHref}
                      aria-current={
                        isOrganizationDriverWarningsActive ? "page" : undefined
                      }
                      onClick={(e) => handleLinkClick(organizationDriverWarningsHref, e)}
                      className={`${subNavItemClassName(
                        isOrganizationDriverWarningsActive,
                      )} ${isOrganizationDriverWarningsPending ? "pointer-events-none cursor-wait" : ""}`}
                    >
                      <span
                        className={subNavIconClassName(
                          isOrganizationDriverWarningsActive,
                        )}
                      >
                        {isOrganizationDriverWarningsPending ? <SidebarSpinnerActive className="size-3" /> : <WarningIcon />}
                      </span>
                      <span>{dictionary.driverWarnings.navLabel}</span>
                    </Link>
                  ) : null}
                </div>
              ) : null}
              {organizationDriversHref &&
              organizationDriversReportsHref &&
              (navigation.drivers || navigation.driverReports) ? (
                <div
                  ref={driversFlyoutRef}
                  className={`relative hidden ${collapsed ? "lg:block" : ""}`}
                >
                  <button
                    ref={driversButtonRef}
                    type="button"
                    aria-expanded={driversFlyoutOpen}
                    aria-label={dictionary.drivers.expandDriversMenu}
                    title={dictionary.drivers.navLabel}
                    onClick={() => setDriversFlyoutOpen((open) => !open)}
                    className={navItemClassName(
                      isOrganizationDriversActive,
                      collapsed,
                    )}
                  >
                    <span className={navIconClassName(isOrganizationDriversActive)}>
                      <DriversIcon />
                    </span>
                  </button>
                  {driversFlyoutOpen ? (
                    <div className="absolute top-0 z-50 min-w-52 rounded-2xl border border-border bg-surface p-2 shadow-[0_18px_50px_rgba(16,35,63,0.18)] ltr:left-[calc(100%+0.75rem)] rtl:right-[calc(100%+0.75rem)]">
                      <p className="px-3 py-2 text-xs font-bold text-muted">
                        {dictionary.drivers.navLabel}
                      </p>
                      {navigation.drivers ? (
                        <Link
                          href={organizationDriversHref}
                          aria-current={
                            isOrganizationDriversDataActive ? "page" : undefined
                          }
                          onClick={(e) => {
                            setDriversFlyoutOpen(false);
                            handleLinkClick(organizationDriversHref, e);
                          }}
                          className={`${subNavItemClassName(
                            isOrganizationDriversDataActive,
                          )} ${isOrganizationDriversPending ? "pointer-events-none cursor-wait" : ""}`}
                        >
                          {isOrganizationDriversPending ? (
                            <SidebarSpinnerActive className="size-3" />
                          ) : (
                            <span
                              className={subNavDotClassName(
                                isOrganizationDriversDataActive,
                              )}
                            />
                          )}
                          <span>{dictionary.drivers.dataNavLabel}</span>
                        </Link>
                      ) : null}
                      {navigation.driverReports ? (
                        <Link
                          href={organizationDriversReportsHref}
                          aria-current={
                            isOrganizationDriversReportsActive
                              ? "page"
                              : undefined
                          }
                          onClick={(e) => {
                            setDriversFlyoutOpen(false);
                            handleLinkClick(organizationDriversReportsHref, e);
                          }}
                          className={`${subNavItemClassName(
                            isOrganizationDriversReportsActive,
                          )} ${isOrganizationDriversReportsPending ? "pointer-events-none cursor-wait" : ""}`}
                        >
                          {isOrganizationDriversReportsPending ? (
                            <SidebarSpinnerActive className="size-3" />
                          ) : (
                            <span
                              className={subNavDotClassName(
                                isOrganizationDriversReportsActive,
                              )}
                            />
                          )}
                          <span>{dictionary.drivers.reportsNavLabel}</span>
                        </Link>
                      ) : null}
                      {navigation.driverOrderReports ? (
                        <Link
                          href={organizationDriversOrderReportsHref!}
                          aria-current={isOrganizationDriversOrderReportsActive ? "page" : undefined}
                          onClick={(e) => handleLinkClick(organizationDriversOrderReportsHref, e)}
                          className={`${subNavItemClassName(isOrganizationDriversOrderReportsActive)} ${isOrganizationDriversOrderReportsPending ? "pointer-events-none cursor-wait" : ""}`}
                        >
                          {isOrganizationDriversOrderReportsPending ? <SidebarSpinnerActive className="size-3" /> : <span className={subNavDotClassName(isOrganizationDriversOrderReportsActive)} />}
                          <span>{dictionary.drivers.orderReportsNavLabel}</span>
                        </Link>
                      ) : null}
                      {/*
                        <Link
                          href={organizationEntitlementsHref!}
                          aria-current={
                            isOrganizationEntitlementsActive
                              ? "page"
                              : undefined
                          }
                          onClick={(e) => {
                            setDriversFlyoutOpen(false);
                            handleLinkClick(organizationEntitlementsHref!, e);
                          }}
                          className={`${subNavItemClassName(
                            isOrganizationEntitlementsActive,
                          )} ${isOrganizationEntitlementsPending ? "pointer-events-none cursor-wait" : ""}`}
                        >
                          {isOrganizationEntitlementsPending ? (
                            <SidebarSpinnerActive className="size-3" />
                          ) : (
                            <span
                              className={subNavDotClassName(
                                isOrganizationEntitlementsActive,
                              )}
                            />
                          )}
                        </Link>
                      */}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {organizationFuelManagementHref && (navigation.fuelManagement || navigation.fuelReports) ? (
                <div className={collapsed ? "hidden lg:block" : "hidden"}>
                  <Link
                    href={
                      navigation.fuelManagement
                        ? organizationFuelManagementHref
                        : organizationFuelReportsHref ?? organizationFuelManagementHref
                    }
                    aria-current={isOrganizationFuelActive ? "page" : undefined}
                    title={dictionary.fuel.navLabel}
                    onClick={(e) => handleLinkClick(
                      navigation.fuelManagement
                        ? organizationFuelManagementHref
                        : organizationFuelReportsHref ?? organizationFuelManagementHref,
                      e
                    )}
                    className={`${navItemClassName(
                      isOrganizationFuelActive,
                      true,
                    )} ${isOrganizationFuelManagementPending || isOrganizationFuelReportsPending ? "pointer-events-none cursor-wait" : ""}`}
                  >
                    <span className={navIconClassName(isOrganizationFuelActive)}>
                      {isOrganizationFuelManagementPending || isOrganizationFuelReportsPending ? (
                        <SidebarSpinnerActive />
                      ) : (
                        <FuelIcon />
                      )}
                    </span>
                  </Link>
                </div>
              ) : null}
              {organizationOdometerHref &&
              (navigation.odometerManagement || navigation.appRequestLeave || navigation.appRequestMaintenance || navigation.appRequestMeeting || navigation.appRequestOilChange || navigation.appRequestShiftChange) ? (
                <div className={collapsed ? "hidden lg:block" : "hidden"}>
                  <Link
                    href={
                      navigation.odometerManagement
                        ? organizationOdometerHref
                        : navigation.appRequestLeave
                          ? organizationLeaveRequestsHref ?? organizationOdometerHref
                          : navigation.appRequestMaintenance
                            ? organizationMaintenanceRequestsHref ?? organizationOdometerHref
                            : navigation.appRequestMeeting
                              ? organizationMeetingRequestsHref ?? organizationOdometerHref
                              : navigation.appRequestOilChange
                                ? organizationOilChangeRequestsHref ?? organizationOdometerHref
                                : organizationShiftChangeRequestsHref ?? organizationOdometerHref
                    }
                    aria-current={
                      isOrganizationAppRequestsActive ? "page" : undefined
                    }
                    title={dictionary.appRequests.navLabel}
                    onClick={(e) => handleLinkClick(
                      navigation.odometerManagement
                        ? organizationOdometerHref
                        : navigation.appRequestLeave
                          ? organizationLeaveRequestsHref ?? organizationOdometerHref
                          : navigation.appRequestMaintenance
                            ? organizationMaintenanceRequestsHref ?? organizationOdometerHref
                            : navigation.appRequestMeeting
                              ? organizationMeetingRequestsHref ?? organizationOdometerHref
                              : navigation.appRequestOilChange
                                ? organizationOilChangeRequestsHref ?? organizationOdometerHref
                                : organizationShiftChangeRequestsHref ?? organizationOdometerHref,
                      e
                    )}
                    className={`${navItemClassName(
                      isOrganizationAppRequestsActive,
                      true,
                    )} ${isOrganizationOdometerPending || isOrganizationLeaveRequestsPending || isOrganizationMaintenanceRequestsPending || isOrganizationMeetingRequestsPending || isOrganizationOilChangeRequestsPending ? "pointer-events-none cursor-wait" : ""}`}
                  >
                    <span
                      className={navIconClassName(
                        isOrganizationAppRequestsActive,
                      )}
                    >
                      {isOrganizationOdometerPending || isOrganizationLeaveRequestsPending || isOrganizationMaintenanceRequestsPending || isOrganizationMeetingRequestsPending || isOrganizationOilChangeRequestsPending ? (
                        <SidebarSpinnerActive />
                      ) : (
                        <AppRequestsIcon />
                      )}
                    </span>
                  </Link>
                </div>
              ) : null}
              {navigation.shifts && organizationShiftsManagementHref ? (
                <div className={collapsed ? "hidden lg:block" : "hidden"}>
                  <Link
                    href={organizationShiftsManagementHref}
                    aria-current={
                      isOrganizationShiftsActive ? "page" : undefined
                    }
                    title={dictionary.shifts.navLabel}
                    onClick={(e) => handleLinkClick(organizationShiftsManagementHref, e)}
                    className={`${navItemClassName(
                      isOrganizationShiftsActive,
                      true,
                    )} ${isOrganizationShiftsManagementPending ? "pointer-events-none cursor-wait" : ""}`}
                  >
                    <span
                      className={navIconClassName(
                        isOrganizationShiftsActive,
                      )}
                    >
                      {isOrganizationShiftsManagementPending ? (
                        <SidebarSpinnerActive />
                      ) : (
                        <ShiftsIcon />
                      )}
                    </span>
                  </Link>
                </div>
              ) : null}
              {organizationDriverWarningsHref && navigation.driverWarnings ? (
                <div className={collapsed ? "hidden lg:block" : "hidden"}>
                  <Link
                    href={organizationDriverWarningsHref}
                    aria-current={
                      isOrganizationDriverWarningsActive ? "page" : undefined
                    }
                    title={dictionary.driverWarnings.navLabel}
                    onClick={(e) => handleLinkClick(organizationDriverWarningsHref, e)}
                    className={`${navItemClassName(
                      isOrganizationDriverWarningsActive,
                      true,
                    )} ${isOrganizationDriverWarningsPending ? "pointer-events-none cursor-wait" : ""}`}
                  >
                    <span
                      className={navIconClassName(
                        isOrganizationDriverWarningsActive,
                      )}
                    >
                      {isOrganizationDriverWarningsPending ? (
                        <SidebarSpinnerActive />
                      ) : (
                        <WarningIcon />
                      )}
                    </span>
                  </Link>
                </div>
              ) : null}
            </>
          ) : null}
          {canSeeUserManagement ? (
            <Link
              href={usersHref}
              aria-current={isUsersActive ? "page" : undefined}
              title={collapsed ? dictionary.userManagement.navLabel : undefined}
              onClick={(e) => handleLinkClick(usersHref, e)}
              className={`${navItemClassName(isUsersActive, collapsed)} ${isUsersPending ? "pointer-events-none cursor-wait" : ""}`}
            >
              <span className={navIconClassName(isUsersActive)}>
                {isUsersPending ? <SidebarSpinnerActive /> : <UsersIcon />}
              </span>
              <span className={collapsed ? "lg:hidden" : ""}>
                {dictionary.userManagement.navLabel}
              </span>
            </Link>
          ) : null}
        </div>
      </nav>

    </aside>
  );
}

function navItemClassName(active: boolean, collapsed: boolean) {
  return `flex min-h-12 items-center gap-3 rounded-2xl p-2 text-sm font-semibold transition ${
    active
      ? "bg-primary-soft text-primary"
      : "text-muted hover:bg-primary-soft hover:text-primary"
  } ${collapsed ? "lg:justify-center" : ""}`;
}

function navIconClassName(active: boolean) {
  return `flex size-9 shrink-0 items-center justify-center rounded-xl ${
    active ? "bg-primary text-white" : "bg-background text-muted"
  }`;
}

function subNavItemClassName(active: boolean) {
  return `flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition ${
    active
      ? "bg-primary-soft text-primary"
      : "text-muted hover:bg-primary-soft hover:text-primary"
  }`;
}

function subNavDotClassName(active: boolean) {
  return `size-2 rounded-full ${active ? "bg-primary" : "bg-muted/45"}`;
}

function subNavIconClassName(active: boolean) {
  return `flex size-7 shrink-0 items-center justify-center rounded-lg ${
    active ? "bg-primary text-white" : "bg-background text-muted"
  }`;
}

function getCurrentOrganizationCode(pathname: string, locale: Locale) {
  const prefix = `/${locale}/dashboard/organizations/`;

  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const code = pathname.slice(prefix.length).split("/")[0];

  return code || null;
}

function DashboardIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path
        d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M8 9h8M8 13h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path
        d="M16 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM6.5 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12.8 20a5.2 5.2 0 0 1 10.4 0M2 20a4.5 4.5 0 0 1 7.6-3.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function OrganizationsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path
        d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h8A1.5 1.5 0 0 1 15 5.5V21M8 8h3M8 12h3M8 16h3M15 10h3.5A1.5 1.5 0 0 1 20 11.5V21M18 14h-1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function DriversIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none">
      <path
        d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0M17.5 5.5l1.2 1.2L21 4.4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function FuelIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path
        d="M7 21V4.5A1.5 1.5 0 0 1 8.5 3h6A1.5 1.5 0 0 1 16 4.5V21M7 9h9M16 6h1.5L20 8.5V19a2 2 0 0 1-4 0v-4h1.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function FleetIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none">
      <path
        d="M4 14h16l-1.6-4.7A2 2 0 0 0 16.5 8h-9a2 2 0 0 0-1.9 1.3L4 14Zm2 0v3m12-3v3M7 17h.1M17 17h.1M8 11h8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function HousingIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none">
      <path
        d="M4.5 20.5V10.2L12 4l7.5 6.2v10.3M8.5 20.5v-6h7v6M7 11.5h10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function AppRequestsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none">
      <path
        d="M8 6h8M8 11h8M8 16h5M5 6h.01M5 11h.01M5 16h.01M4 3.5h16a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 19V5A1.5 1.5 0 0 1 4 3.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function ShiftsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none">
      <path
        d="M7 3.5v3M17 3.5v3M4.5 9h15M6 5h12a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 18 20H6a1.5 1.5 0 0 1-1.5-1.5v-12A1.5 1.5 0 0 1 6 5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M12 12v3l2 1.2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none">
      <path
        d="M12 3.75 21 19.5H3L12 3.75Zm0 5.75v4.25m0 3.25h.01"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function DownChevronIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none">
      <path
        d="m7 10 5 5 5-5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path
        d="m6 6 12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SidebarPanelToggleIcon({
  collapsed,
  locale,
}: {
  collapsed: boolean;
  locale: Locale;
}) {
  const sidebarOnRight = locale === "ar";
  const separatorX = sidebarOnRight ? 15 : 9;
  const contentLineStart = sidebarOnRight ? 6.5 : 11.5;
  const contentLineEnd = sidebarOnRight ? 12 : 17.5;
  const indicatorPoints = getPanelIndicatorPoints({
    collapsed,
    sidebarOnRight,
  });

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path
        d="M4.5 5.5A1.5 1.5 0 0 1 6 4h12a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 18 20H6a1.5 1.5 0 0 1-1.5-1.5v-13Z"
        stroke="currentColor"
      />
      <path
        d={`M${separatorX} 4v16`}
        stroke="currentColor"
        strokeLinecap="round"
      />
      <path
        d={`M${contentLineStart} 8.5h${contentLineEnd - contentLineStart}M${contentLineStart} 12h${contentLineEnd - contentLineStart}`}
        stroke="currentColor"
        strokeLinecap="round"
      />
      <path
        d={indicatorPoints}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function getPanelIndicatorPoints({
  collapsed,
  sidebarOnRight,
}: {
  collapsed: boolean;
  sidebarOnRight: boolean;
}) {
  if (sidebarOnRight) {
    return collapsed ? "M17 10l-2 2 2 2" : "M15 10l2 2-2 2";
  }

  return collapsed ? "M7 10l2 2-2 2" : "M9 10l-2 2 2 2";
}

function SidebarSpinnerActive({ className = "size-4" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
