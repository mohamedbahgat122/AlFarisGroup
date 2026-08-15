import type { AccessibleOrganization } from "@/features/organizations/types";
import type { SystemExpiryAlert } from "@/features/expiry-alerts/types";

export type ExecutiveDashboardRange = 1 | 7 | 30;

export type ExecutiveDashboardFilters = {
  organization: string;
  range: ExecutiveDashboardRange;
};

export type DashboardMetric = {
  id: string;
  label: string;
  value: number;
  href?: string;
  helper?: string;
  tone?: "default" | "success" | "warning" | "danger";
};

export type DashboardTrendPoint = {
  date: string;
  total: number;
  leave: number;
  maintenance: number;
  meeting: number;
  oilChange: number;
  odometer: number;
  other: number;
};

export type DashboardOrganizationOverview = {
  id: string;
  name: string;
  code: string;
  activeDrivers: number;
  vehicles: number;
  housingLinkedDrivers: number;
  todayRequests: number;
  todayShifts: number;
  pendingAlerts: number;
};

export type DashboardDriverPerformance = {
  driverId: string;
  driverName: string;
  organizationName: string;
  score: number;
  deliveredTasks: number;
  acceptedTasks: number;
  reportDays: number;
  deliveryRate: number | null;
  completionRate: number | null;
  attendanceDays: number;
};

export type DashboardActivityLeader = {
  driverId: string;
  driverName: string;
  organizationName: string;
  activityCount: number;
  deliveredTasks: number;
  shifts: number;
  requests: number;
};

export type DashboardSectionStatus = "success" | "unavailable" | "load_error";

export type ExecutiveDashboardData =
  | {
      status: "unauthorized" | "load_error";
    }
  | {
      status: "success";
      filters: ExecutiveDashboardFilters;
      availableOrganizations: AccessibleOrganization[];
      selectedOrganizations: AccessibleOrganization[];
      lastUpdated: string;
      kpis: DashboardMetric[];
      organizationOverview: DashboardOrganizationOverview[];
      drivers: {
        total: number;
        active: number;
        inactive: number;
        archived: number;
        companySponsored: number;
        nonSponsored: number;
        withoutAssignedVehicle: number;
        withoutHousing: number;
        expiringDocuments: number;
      };
      fleet: {
        status: DashboardSectionStatus;
        totalActive: number;
        healthy: number;
        damaged: number;
        maintenance: number;
        operationalActive: number;
        operationalStopped: number;
        archived: number;
        withoutDriver: number;
        withoutOrganization: number;
        expiringOperatingCards: number;
      };
      housing: {
        status: DashboardSectionStatus;
        units: number;
        rooms: number;
        capacity: number;
        occupied: number;
        available: number;
        utilizationPercent: number;
        fullUnits: number;
        availableUnits: number;
      };
      requests: {
        todayTotal: number;
        pending: number;
        approved: number;
        rejected: number;
        byTypeToday: Record<string, number>;
        trend: DashboardTrendPoint[];
      };
      shifts: {
        todayTotal: number;
        started: number;
        completed: number;
        activeNow: number;
        incomplete: number;
        totalDistanceToday: number;
        missingStartProof: number;
        missingEndProof: number;
      };
      fuel: {
        status: DashboardSectionStatus;
        operations: number;
        amountSar: number;
        matchedDrivers: number;
        topDrivers: Array<{
          driverId: string;
          driverName: string;
          organizationName: string;
          amountSar: number;
          operations: number;
        }>;
      };
      alerts: {
        expired: number;
        critical: number;
        warning: number;
        total: number;
        nearest: SystemExpiryAlert[];
      };
      topPerformanceDrivers: DashboardDriverPerformance[];
      activityLeaders: DashboardActivityLeader[];
      definitions: string[];
      slowestSectionMs: {
        name: string;
        duration: number;
      };
    };

export type OrganizationDashboardData =
  | {
      status: "unauthorized" | "load_error";
    }
  | {
      status: "success";
      organization: AccessibleOrganization;
      range: ExecutiveDashboardRange;
      lastUpdated: string;
      kpis: DashboardMetric[];
      requests: Extract<ExecutiveDashboardData, { status: "success" }>["requests"];
      fleet: Extract<ExecutiveDashboardData, { status: "success" }>["fleet"];
      drivers: Extract<ExecutiveDashboardData, { status: "success" }>["drivers"];
      shifts: Extract<ExecutiveDashboardData, { status: "success" }>["shifts"];
      housing: Extract<ExecutiveDashboardData, { status: "success" }>["housing"];
      alerts: Extract<ExecutiveDashboardData, { status: "success" }>["alerts"];
      topPerformanceDrivers: DashboardDriverPerformance[];
      activityLeaders: DashboardActivityLeader[];
      quickActions: Array<{
        label: string;
        href: string;
        icon: string;
      }>;
      definitions: string[];
    };
