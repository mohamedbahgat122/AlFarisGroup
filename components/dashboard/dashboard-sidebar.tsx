"use client";

import { useEffect, useRef, useState } from "react";
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
  organizations: AccessibleOrganization[];
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapsed: () => void;
  onCloseMobile: () => void;
};

export function DashboardSidebar({
  locale,
  dictionary,
  userRole,
  organizations,
  collapsed,
  mobileOpen,
  onToggleCollapsed,
  onCloseMobile,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const dashboardHref = `/${locale}/dashboard`;
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
    fleetCars: true,
    fleetMotorcycles: true,
    fuelManagement: true,
    fuelReports: true,
    appRequests: true,
    notifications: true,
    odometerManagement: true,
    driverWarnings: true,
    shifts: true,
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
  const organizationFleetHref = currentOrganizationCode
    ? `${organizationsHref}/${currentOrganizationCode}/fleet`
    : null;
  const organizationFleetCarsHref = organizationFleetHref
    ? `${organizationFleetHref}/cars`
    : null;
  const organizationFleetMotorcyclesHref = organizationFleetHref
    ? `${organizationFleetHref}/motorcycles`
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
  const organizationShiftsHref = currentOrganizationCode
    ? `${organizationsHref}/${currentOrganizationCode}/shifts`
    : null;
  const organizationShiftsManagementHref = organizationShiftsHref
    ? `${organizationShiftsHref}/manage`
    : null;
  const organizationShiftCalculationHref = organizationShiftsHref
    ? `${organizationShiftsHref}/calculation`
    : null;
  const organizationDriverWarningsHref = currentOrganizationCode
    ? `${organizationsHref}/${currentOrganizationCode}/driver-warnings`
    : null;
  const isUsersActive = pathname === usersHref;
  const isOrganizationsActive =
    pathname === organizationsHref ||
    pathname.startsWith(`${organizationsHref}/`);
  const isOrganizationHomeActive =
    Boolean(organizationHomeHref) && pathname === organizationHomeHref;
  const isOrganizationDriversActive =
    Boolean(organizationDriversHref) &&
    (pathname === organizationDriversHref ||
      pathname.startsWith(`${organizationDriversHref}/`));
  const isOrganizationDriversDataActive =
    Boolean(organizationDriversHref) && pathname === organizationDriversHref;
  const isOrganizationDriversReportsActive =
    Boolean(organizationDriversReportsHref) &&
    (pathname === organizationDriversReportsHref ||
      pathname.startsWith(`${organizationDriversReportsHref}/`));
  const isOrganizationFleetActive =
    Boolean(organizationFleetHref) &&
    (pathname === organizationFleetHref ||
      pathname.startsWith(`${organizationFleetHref}/`));
  const isOrganizationFleetCarsActive =
    Boolean(organizationFleetCarsHref) && pathname === organizationFleetCarsHref;
  const isOrganizationFleetMotorcyclesActive =
    Boolean(organizationFleetMotorcyclesHref) &&
    pathname === organizationFleetMotorcyclesHref;
  const isOrganizationFuelActive =
    Boolean(organizationFuelHref) &&
    (pathname === organizationFuelHref ||
      pathname.startsWith(`${organizationFuelHref}/`));
  const isOrganizationFuelManagementActive =
    Boolean(organizationFuelManagementHref) &&
    pathname === organizationFuelManagementHref;
  const isOrganizationFuelReportsActive =
    Boolean(organizationFuelReportsHref) && pathname === organizationFuelReportsHref;
  const isOrganizationAppRequestsActive =
    Boolean(organizationAppRequestsHref) &&
    (pathname === organizationAppRequestsHref ||
      pathname.startsWith(`${organizationAppRequestsHref}/`));
  const isOrganizationOdometerActive =
    Boolean(organizationOdometerHref) && pathname === organizationOdometerHref;
  const isOrganizationLeaveRequestsActive =
    Boolean(organizationLeaveRequestsHref) &&
    pathname === organizationLeaveRequestsHref;
  const isOrganizationMaintenanceRequestsActive =
    Boolean(organizationMaintenanceRequestsHref) &&
    pathname === organizationMaintenanceRequestsHref;
  const isOrganizationMeetingRequestsActive =
    Boolean(organizationMeetingRequestsHref) &&
    pathname === organizationMeetingRequestsHref;
  const isOrganizationOilChangeRequestsActive =
    Boolean(organizationOilChangeRequestsHref) &&
    pathname === organizationOilChangeRequestsHref;
  const isOrganizationShiftsActive =
    Boolean(organizationShiftsHref) &&
    (pathname === organizationShiftsHref ||
      pathname.startsWith(`${organizationShiftsHref}/`));
  const isOrganizationShiftsManagementActive =
    Boolean(organizationShiftsManagementHref) &&
    pathname === organizationShiftsManagementHref;
  const isOrganizationShiftCalculationActive =
    Boolean(organizationShiftCalculationHref) &&
    pathname === organizationShiftCalculationHref;
  const isOrganizationDriverWarningsActive =
    Boolean(organizationDriverWarningsHref) &&
    pathname === organizationDriverWarningsHref;
  const isDashboardActive = pathname === dashboardHref;
  const canSeeOrganizations = userRole !== "driver";
  const canSeeUserManagement = userRole === "system_owner";
  const [manualDriversGroupOpen, setManualDriversGroupOpen] = useState(false);
  const [manualFleetGroupOpen, setManualFleetGroupOpen] = useState(false);
  const [manualFuelGroupOpen, setManualFuelGroupOpen] = useState(false);
  const [manualAppRequestsGroupOpen, setManualAppRequestsGroupOpen] =
    useState(false);
  const [manualShiftsGroupOpen, setManualShiftsGroupOpen] = useState(false);
  const [driversFlyoutOpen, setDriversFlyoutOpen] = useState(false);
  const navigationRef = useRef<HTMLElement>(null);
  const driversFlyoutRef = useRef<HTMLDivElement>(null);
  const driversButtonRef = useRef<HTMLButtonElement>(null);
  const driversGroupId = "dashboard-sidebar-drivers-group";
  const fleetGroupId = "dashboard-sidebar-fleet-group";
  const fuelGroupId = "dashboard-sidebar-fuel-group";
  const appRequestsGroupId = "dashboard-sidebar-app-requests-group";
  const shiftsGroupId = "dashboard-sidebar-shifts-group";
  const driversGroupOpen =
    isOrganizationDriversActive || manualDriversGroupOpen;
  const fleetGroupOpen = isOrganizationFleetActive || manualFleetGroupOpen;
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
    fleetGroupOpen,
    fuelGroupOpen,
    shiftsGroupOpen,
    pathname,
  ]);

  return (
    <aside
      className={`fixed inset-y-0 z-40 flex h-dvh w-[292px] flex-col overflow-hidden border-border bg-surface shadow-[0_22px_70px_rgba(16,35,63,0.16)] transition-[transform,width] duration-300 [border-inline-end-width:1px] [inset-inline-start:0] lg:sticky lg:top-0 lg:w-[var(--sidebar-width)] lg:transform-none lg:shadow-none lg:[inset-inline-start:auto] ${
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
          className="hidden size-9 shrink-0 items-center justify-center rounded-lg bg-transparent text-muted transition hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:flex"
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
          className="flex size-10 items-center justify-center rounded-lg text-muted transition hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:hidden"
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
            className={navItemClassName(isDashboardActive, collapsed)}
          >
            <span className={navIconClassName(isDashboardActive)}>
              <DashboardIcon />
            </span>
            <span className={collapsed ? "lg:hidden" : ""}>
              {dictionary.navLabel}
            </span>
          </Link>
          {canSeeOrganizations ? (
            <>
              <Link
                href={organizationsHref}
                aria-current={isOrganizationsActive ? "page" : undefined}
                title={collapsed ? dictionary.organizations.navLabel : undefined}
                className={navItemClassName(isOrganizationsActive, collapsed)}
              >
                <span className={navIconClassName(isOrganizationsActive)}>
                  <OrganizationsIcon />
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
                      className={subNavItemClassName(isOrganizationHomeActive)}
                    >
                      <span className={subNavDotClassName(isOrganizationHomeActive)} />
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
                        className={subNavItemClassName(
                          isOrganizationDriversDataActive,
                        )}
                        >
                        <span
                          className={subNavDotClassName(
                            isOrganizationDriversDataActive,
                          )}
                        />
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
                          className={subNavItemClassName(
                            isOrganizationDriversReportsActive,
                          )}
                        >
                          <span
                            className={subNavDotClassName(
                              isOrganizationDriversReportsActive,
                            )}
                          />
                          <span>{dictionary.drivers.reportsNavLabel}</span>
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                  {(navigation.fleetCars || navigation.fleetMotorcycles) &&
                  organizationFleetCarsHref &&
                  organizationFleetMotorcyclesHref ? (
                    <>
                      <button
                        type="button"
                        aria-expanded={fleetGroupOpen}
                        aria-controls={fleetGroupId}
                        aria-label={
                          fleetGroupOpen
                            ? dictionary.fleet.collapseFleetMenu
                            : dictionary.fleet.expandFleetMenu
                        }
                        onClick={() => setManualFleetGroupOpen((open) => !open)}
                        className={`${subNavItemClassName(
                          isOrganizationFleetActive,
                        )} w-full`}
                      >
                        <span className={subNavIconClassName(isOrganizationFleetActive)}>
                          <FleetIcon />
                        </span>
                        <span>{dictionary.fleet.navLabel}</span>
                        <span
                          className={`ms-auto transition-transform duration-200 ${
                            fleetGroupOpen ? "rotate-180" : ""
                          }`}
                        >
                          <DownChevronIcon />
                        </span>
                      </button>
                      {fleetGroupOpen ? (
                        <div id={fleetGroupId} className="space-y-1 ps-9">
                          {navigation.fleetCars ? (
                            <Link
                            href={organizationFleetCarsHref}
                            aria-current={
                              isOrganizationFleetCarsActive ? "page" : undefined
                            }
                            className={subNavItemClassName(
                              isOrganizationFleetCarsActive,
                            )}
                            >
                            <span
                              className={subNavDotClassName(
                                isOrganizationFleetCarsActive,
                              )}
                            />
                              <span>{dictionary.fleet.carsNavLabel}</span>
                            </Link>
                          ) : null}
                          {navigation.fleetMotorcycles ? (
                            <Link
                            href={organizationFleetMotorcyclesHref}
                            aria-current={
                              isOrganizationFleetMotorcyclesActive
                                ? "page"
                                : undefined
                            }
                            className={subNavItemClassName(
                              isOrganizationFleetMotorcyclesActive,
                            )}
                            >
                            <span
                              className={subNavDotClassName(
                                isOrganizationFleetMotorcyclesActive,
                              )}
                            />
                              <span>{dictionary.fleet.motorcyclesNavLabel}</span>
                            </Link>
                          ) : null}
                        </div>
                      ) : null}
                    </>
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
                              className={subNavItemClassName(
                                isOrganizationFuelManagementActive,
                              )}
                            >
                              <span
                                className={subNavDotClassName(
                                  isOrganizationFuelManagementActive,
                                )}
                              />
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
                              className={subNavItemClassName(
                                isOrganizationFuelReportsActive,
                              )}
                            >
                              <span
                                className={subNavDotClassName(
                                  isOrganizationFuelReportsActive,
                                )}
                              />
                              <span>{dictionary.fuel.reportsNavLabel}</span>
                            </Link>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  {(navigation.odometerManagement || navigation.appRequests) &&
                  organizationOdometerHref &&
                  organizationLeaveRequestsHref &&
                  organizationMaintenanceRequestsHref &&
                  organizationMeetingRequestsHref &&
                  organizationOilChangeRequestsHref ? (
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
                              className={subNavItemClassName(
                                isOrganizationOdometerActive,
                              )}
                            >
                              <span
                                className={subNavDotClassName(
                                  isOrganizationOdometerActive,
                                )}
                              />
                              <span>{dictionary.appRequests.odometerNavLabel}</span>
                            </Link>
                          ) : null}
                          {navigation.appRequests ? (
                            <>
                              <Link
                                href={organizationLeaveRequestsHref}
                                aria-current={
                                  isOrganizationLeaveRequestsActive
                                    ? "page"
                                    : undefined
                                }
                                className={subNavItemClassName(
                                  isOrganizationLeaveRequestsActive,
                                )}
                              >
                                <span
                                  className={subNavDotClassName(
                                    isOrganizationLeaveRequestsActive,
                                  )}
                                />
                                <span>{dictionary.appRequests.leaveNavLabel}</span>
                              </Link>
                              <Link
                                href={organizationMaintenanceRequestsHref}
                                aria-current={
                                  isOrganizationMaintenanceRequestsActive
                                    ? "page"
                                    : undefined
                                }
                                className={subNavItemClassName(
                                  isOrganizationMaintenanceRequestsActive,
                                )}
                              >
                                <span
                                  className={subNavDotClassName(
                                    isOrganizationMaintenanceRequestsActive,
                                  )}
                                />
                                <span>
                                  {dictionary.appRequests.maintenanceNavLabel}
                                </span>
                              </Link>
                              <Link
                                href={organizationMeetingRequestsHref}
                                aria-current={
                                  isOrganizationMeetingRequestsActive
                                    ? "page"
                                    : undefined
                                }
                                className={subNavItemClassName(
                                  isOrganizationMeetingRequestsActive,
                                )}
                              >
                                <span
                                  className={subNavDotClassName(
                                    isOrganizationMeetingRequestsActive,
                                  )}
                                />
                                <span>{dictionary.appRequests.meetingsNavLabel}</span>
                              </Link>
                              <Link
                                href={organizationOilChangeRequestsHref}
                                aria-current={
                                  isOrganizationOilChangeRequestsActive
                                    ? "page"
                                    : undefined
                                }
                                className={subNavItemClassName(
                                  isOrganizationOilChangeRequestsActive,
                                )}
                              >
                                <span
                                  className={subNavDotClassName(
                                    isOrganizationOilChangeRequestsActive,
                                  )}
                                />
                                <span>{dictionary.appRequests.oilChangeNavLabel}</span>
                              </Link>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  {navigation.shifts &&
                  organizationShiftsManagementHref &&
                  organizationShiftCalculationHref ? (
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
                          <Link
                            href={organizationShiftsManagementHref}
                            aria-current={
                              isOrganizationShiftsManagementActive
                                ? "page"
                                : undefined
                            }
                            className={subNavItemClassName(
                              isOrganizationShiftsManagementActive,
                            )}
                          >
                            <span
                              className={subNavDotClassName(
                                isOrganizationShiftsManagementActive,
                              )}
                            />
                            <span>{dictionary.shifts.managementNavLabel}</span>
                          </Link>
                          <Link
                            href={organizationShiftCalculationHref}
                            aria-current={
                              isOrganizationShiftCalculationActive
                                ? "page"
                                : undefined
                            }
                            className={subNavItemClassName(
                              isOrganizationShiftCalculationActive,
                            )}
                          >
                            <span
                              className={subNavDotClassName(
                                isOrganizationShiftCalculationActive,
                              )}
                            />
                            <span>{dictionary.shifts.calculationNavLabel}</span>
                          </Link>
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
                      className={subNavItemClassName(
                        isOrganizationDriverWarningsActive,
                      )}
                    >
                      <span
                        className={subNavIconClassName(
                          isOrganizationDriverWarningsActive,
                        )}
                      >
                        <WarningIcon />
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
                        onClick={() => setDriversFlyoutOpen(false)}
                        className={subNavItemClassName(
                          isOrganizationDriversDataActive,
                        )}
                        >
                        <span
                          className={subNavDotClassName(
                            isOrganizationDriversDataActive,
                          )}
                        />
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
                        onClick={() => setDriversFlyoutOpen(false)}
                        className={subNavItemClassName(
                          isOrganizationDriversReportsActive,
                        )}
                        >
                        <span
                          className={subNavDotClassName(
                            isOrganizationDriversReportsActive,
                          )}
                        />
                          <span>{dictionary.drivers.reportsNavLabel}</span>
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {organizationFleetCarsHref && (navigation.fleetCars || navigation.fleetMotorcycles) ? (
                <div className={collapsed ? "hidden lg:block" : "hidden"}>
                  <Link
                    href={
                      navigation.fleetCars
                        ? organizationFleetCarsHref
                        : organizationFleetMotorcyclesHref ?? organizationFleetCarsHref
                    }
                    aria-current={isOrganizationFleetActive ? "page" : undefined}
                    title={dictionary.fleet.navLabel}
                    className={navItemClassName(
                      isOrganizationFleetActive,
                      true,
                    )}
                  >
                    <span className={navIconClassName(isOrganizationFleetActive)}>
                      <FleetIcon />
                    </span>
                  </Link>
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
                    className={navItemClassName(
                      isOrganizationFuelActive,
                      true,
                    )}
                  >
                    <span className={navIconClassName(isOrganizationFuelActive)}>
                      <FuelIcon />
                    </span>
                  </Link>
                </div>
              ) : null}
              {organizationOdometerHref &&
              (navigation.odometerManagement || navigation.appRequests) ? (
                <div className={collapsed ? "hidden lg:block" : "hidden"}>
                  <Link
                    href={
                      navigation.odometerManagement
                        ? organizationOdometerHref
                        : organizationLeaveRequestsHref ?? organizationOdometerHref
                    }
                    aria-current={
                      isOrganizationAppRequestsActive ? "page" : undefined
                    }
                    title={dictionary.appRequests.navLabel}
                    className={navItemClassName(
                      isOrganizationAppRequestsActive,
                      true,
                    )}
                  >
                    <span
                      className={navIconClassName(
                        isOrganizationAppRequestsActive,
                      )}
                    >
                      <AppRequestsIcon />
                    </span>
                  </Link>
                </div>
              ) : null}
              {navigation.shifts &&
              organizationShiftsManagementHref &&
              organizationShiftCalculationHref ? (
                <div className={collapsed ? "hidden lg:block" : "hidden"}>
                  <Link
                    href={organizationShiftsManagementHref}
                    aria-current={
                      isOrganizationShiftsActive ? "page" : undefined
                    }
                    title={dictionary.shifts.navLabel}
                    className={navItemClassName(
                      isOrganizationShiftsActive,
                      true,
                    )}
                  >
                    <span
                      className={navIconClassName(
                        isOrganizationShiftsActive,
                      )}
                    >
                      <ShiftsIcon />
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
                    className={navItemClassName(
                      isOrganizationDriverWarningsActive,
                      true,
                    )}
                  >
                    <span
                      className={navIconClassName(
                        isOrganizationDriverWarningsActive,
                      )}
                    >
                      <WarningIcon />
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
              className={navItemClassName(isUsersActive, collapsed)}
            >
              <span className={navIconClassName(isUsersActive)}>
                <UsersIcon />
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
