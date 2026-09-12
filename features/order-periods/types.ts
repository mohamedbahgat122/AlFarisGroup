export type OrderPeriodDriver = {
  id: string;
  fullName: string;
  keetaDriverId: string | null;
  mobileNumber: string | null;
  vehicleLabel: string | null;
};

export type OrderPeriodTemplate = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  isPublished: boolean;
  isActive: boolean;
  archivedAt: string | null;
  openBeforeMinutes: number | null;
  closeAfterMinutes: number | null;
  minimumWorkMinutes: number | null;
};

export type OrderPeriodAssignment = OrderPeriodDriver & {
  assignmentId: string;
  templateId: string;
};

export type OrderPeriodWeek = {
  key: "current" | "next";
  label: string;
  startDate: string;
  endDate: string;
  rows: Array<{
    template: OrderPeriodTemplate;
    drivers: OrderPeriodAssignment[];
  }>;
  unassignedDrivers: OrderPeriodDriver[];
};

export type OrderPeriodManagementPermissions = {
  manage: boolean;
  assign: boolean;
};

export type OrderShiftChangeRequest = {
  id: string;
  driverName: string;
  driverIdentifier: string | null;
  currentTemplateName: string;
  requestedTemplateName: string;
  requestedWeekStartDate: string;
  status: "pending" | "approved" | "rejected";
  reason: string | null;
  reviewNote: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

export type OrderPeriodQueryResult =
  | {
      status: "success";
      weeks: { current: OrderPeriodWeek; next: OrderPeriodWeek };
      templates: OrderPeriodTemplate[];
      drivers: OrderPeriodDriver[];
      permissions: OrderPeriodManagementPermissions;
      orderShiftChangeSettings: number[];
      orderShiftChangeRequests: OrderShiftChangeRequest[];
    }
  | {
      status: "unauthorized" | "load_error";
      weeks: null;
      templates: [];
      drivers: [];
      permissions: OrderPeriodManagementPermissions;
      orderShiftChangeSettings: [];
      orderShiftChangeRequests: [];
    };

export type OrderPeriodActionResult =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; code: string; message: string };

export type OrderPeriodManagementDictionary = {
  navLabel: string;
  title: string;
  description: string;
  currentWeek: string;
  nextWeek: string;
  addTemplate: string;
  editTemplate: string;
  manageDrivers: string;
  moveDriver: string;
  archive: string;
  archiveConfirm: string;
  copyIds: string;
  copiedIds: string;
  noIds: string;
  noTemplates: string;
  noDrivers: string;
  unassigned: string;
  assignedCount: string;
  name: string;
  startTime: string;
  endTime: string;
  overnight: string;
  sameDay: string;
  crossesMidnight: string;
  save: string;
  saving: string;
  cancel: string;
  close: string;
  saveAssignments: string;
  chooseTemplate: string;
  successSaved: string;
  successArchived: string;
  successAssigned: string;
  successMoved: string;
  loadError: string;
  unauthorized: string;
  orderShiftChangeSettings: string;
  orderShiftChangeSettingsDescription: string;
  orderShiftChangeSettingsClosed: string;
  orderShiftChangeSave: string;
  orderShiftChangeCancel: string;
  orderShiftChangeWeekdays: readonly string[];
  orderShiftChangeRequests: string;
  orderShiftChangeRequestsEmpty: string;
  driver: string;
  identifier: string;
  requestedWeek: string;
  reason: string;
  approve: string;
  reject: string;
  approveOrderShiftChangeConfirm: string;
  rejectOrderShiftChangeConfirm: string;
  currentOrderShift: string;
  requestedOrderShift: string;
  pending: string;
  approved: string;
  rejected: string;
  reviewNote: string;
  approvedBy: string;
  rejectedBy: string;
  unavailable: string;
  reviewedAt: string;
  settingsSaved: string;
  requestApproved: string;
  requestRejected: string;
  actionFailed: string;
  openBefore: string;
  closeAfter: string;
  minimumWork: string;
  minutes: string;
  unconfigured: string;
  operationalSettings: string;
  operationalSettingsDescription: string;
  operationalPreview: string;
  opensAt: string;
  closesAt: string;
  published: string;
  unpublished: string;
  disabled: string;
  archived: string;
  publish: string;
  unpublish: string;
  disable: string;
  enable: string;
  publishConfirm: string;
  unpublishConfirm: string;
  disableConfirm: string;
  archiveImpact: string;
  openNow: string;
  openNowTitle: string;
  openNowConfirm: string;
  openNowSuccess: string;
  policySaved: string;
  lifecycleSuccess: string;
  moreActions: string;
};
