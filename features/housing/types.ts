import type { GlobalPermissionKey } from "@/features/permissions/global-registry";

export const housingStatuses = ["active", "full", "maintenance", "inactive"] as const;

export type HousingStatus = (typeof housingStatuses)[number];

export type HousingActionCode =
  | "success"
  | "unauthorized"
  | "validation_error"
  | "duplicate_code"
  | "not_found"
  | "capacity_below_occupancy"
  | "housing_full"
  | "housing_not_assignable"
  | "room_full"
  | "room_not_assignable"
  | "room_unavailable"
  | "room_capacity_below_occupancy"
  | "room_has_residents"
  | "driver_unavailable"
  | "organization_unavailable"
  | "assignment_unavailable"
  | "configuration_error"
  | "save_failed";

export type HousingActionState = {
  status: "idle" | "success" | "error" | "validation_error";
  code?: HousingActionCode;
  message?: string;
  fieldErrors?: Record<string, string>;
};

export const initialHousingActionState: HousingActionState = {
  status: "idle",
};

export type HousingPermissionFlags = {
  view: boolean;
  create: boolean;
  update: boolean;
  archive: boolean;
  assignOrganizations: boolean;
  assignDrivers: boolean;
  activity: boolean;
};

export type HousingUnitInput = {
  name: string;
  code: string | null;
  address: string | null;
  city: string | null;
  locationNotes: string | null;
  latitude: number | null;
  longitude: number | null;
  capacity: number;
  status: HousingStatus;
  notes: string | null;
};

export type HousingUnitSummary = HousingUnitInput & {
  id: string;
  archivedAt: string | null;
  roomCount: number;
  occupied: number;
  available: number;
  utilization: number;
  displayStatus: HousingStatus;
  organizations: HousingOrganizationSummary[];
};

export type HousingRoomInput = {
  name: string;
  code: string | null;
  capacity: number;
  status: HousingStatus;
  notes: string | null;
};

export type HousingRoomSummary = HousingRoomInput & {
  id: string;
  housingId: string;
  archivedAt: string | null;
  occupied: number;
  available: number;
  utilization: number;
  displayStatus: HousingStatus;
};

export type HousingOrganizationSummary = {
  id: string;
  name: string;
  code: string | null;
  assignmentId?: string;
  active?: boolean;
  assignedAt?: string;
  unassignedAt?: string | null;
};

export type HousingMoveTarget = {
  id: string;
  name: string;
  code: string | null;
  city: string | null;
  capacity: number;
  occupied: number;
  available: number;
  status: HousingStatus;
};

export type HousingResident = {
  assignmentId: string;
  driverId: string;
  fullName: string;
  iqamaNumber: string | null;
  mobileNumber: string | null;
  organizationName: string | null;
  roomId: string | null;
  roomName: string | null;
  assignedAt: string;
  notes: string | null;
};

export type HousingDriverOption = {
  id: string;
  fullName: string;
  iqamaNumber: string | null;
  mobileNumber: string | null;
  organizationName: string | null;
  currentHousingName: string | null;
};

export type HousingAssignmentHistory = {
  id: string;
  type: "driver" | "organization";
  subject: string;
  assignedAt: string;
  unassignedAt: string | null;
  notes: string | null;
};

export type HousingActivity = {
  id: string;
  action: string;
  actorName: string | null;
  createdAt: string;
};

export type HousingDetails = HousingUnitSummary & {
  rooms: HousingRoomSummary[];
  residents: HousingResident[];
  organizationAssignments: HousingOrganizationSummary[];
  assignmentHistory: HousingAssignmentHistory[];
  activities: HousingActivity[];
};

export type HousingListResult =
  | {
      status: "success";
      housing: HousingUnitSummary[];
      permissions: HousingPermissionFlags;
    }
  | { status: "unauthorized" | "load_error"; housing: [] };

export type HousingDetailsResult =
  | {
      status: "success";
      housing: HousingDetails;
      organizations: HousingOrganizationSummary[];
      moveTargets: HousingMoveTarget[];
      permissions: HousingPermissionFlags;
    }
  | { status: "unauthorized" | "not_found" | "load_error"; housing: null };

export const housingPermissionMap = {
  view: "housing.view",
  create: "housing.create",
  update: "housing.update",
  archive: "housing.archive",
  assignOrganizations: "housing.assign_organizations",
  assignDrivers: "housing.assign_drivers",
  activity: "housing.activity.view",
} satisfies Record<keyof HousingPermissionFlags, GlobalPermissionKey>;
