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
  hasBreak: boolean;
  breakStartTime: string | null;
  breakEndTime: string | null;
  isPublished: boolean;
  isActive: boolean;
  archivedAt: string | null;
  openBeforeMinutes: number | null;
  closeAfterMinutes: number | null;
  endBeforeMinutes: number | null;
  minimumWorkMinutes: number | null;
};

export type OrderPeriodAssignment = OrderPeriodDriver & {
  assignmentId: string;
  templateId: string;
  openNowEligible: boolean;
  attendanceExists: boolean;
  manualOverrideActive: boolean;
  manualOverrideId: string | null;
  manualOverrideScheduledBusinessDate: string | null;
  manualOverrideOpenedAt: string | null;
  manualOverrideExpiresAt: string | null;
  openNowState: "available" | "manually_opened" | "attendance_exists" | "occurrence_expired" | "no_current_occurrence";
  openNowUnavailableReason: "occurrence_expired" | "attendance_exists" | "no_current_occurrence" | "template_unavailable" | null;
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
  create: boolean;
  update: boolean;
  assign: boolean;
  openNow: boolean;
  reviewRequests: boolean;
  settings: boolean;
  archive: boolean;
  activityView: boolean;
};

export type OrderShiftHistoryFilters = {
  organizationCode: string;
  page: number;
  action: string;
  actorId: string;
  dateFrom: string;
  dateTo: string;
};

export type OrderShiftHistoryChange = {
  field: string;
  before: string | null;
  after: string | null;
};

export type OrderShiftHistoryDriverSnapshot = {
  id: string;
  name: string;
};

export type OrderShiftHistoryItem = {
  id: string;
  action: string;
  actorName: string | null;
  driverName: string | null;
  driverIdentifier: string | null;
  templateName: string | null;
  sourceTemplateName: string | null;
  targetTemplateName: string | null;
  requestStatus: string | null;
  requestNote: string | null;
  addedDrivers: OrderShiftHistoryDriverSnapshot[];
  removedDrivers: OrderShiftHistoryDriverSnapshot[];
  addedCount: number | null;
  removedCount: number | null;
  changes: OrderShiftHistoryChange[];
  createdAt: string;
};

export type OrderShiftHistoryResult =
  | {
      status: "success";
      items: OrderShiftHistoryItem[];
      page: number;
      pageSize: 25;
      total: number;
      totalPages: number;
      actorOptions: Array<{ id: string; name: string }>;
    }
  | { status: "unauthorized" | "error"; items: []; page: 1; pageSize: 25; total: 0; totalPages: 1; actorOptions: []; message: string };

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
  endDelay: string;
  hours: string;
  minutes: string;
  unconfigured: string;
  operationalSettings: string;
  operationalSettingsDescription: string;
  operationalPreview: string;
  opensAt: string;
  closesAt: string;
  openBeforeOptional: string;
  endDelayOptional: string;
  openBeforeHelper: string;
  endDelayHelper: string;
  endDelayPreview: string;
  endDelayNotConfigured: string;
  afterActualStart: string;
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
  cancelOpenNow: string;
  cancelOpenNowConfirm: string;
  openNowTitle: string;
  openNowConfirm: string;
  openNowSuccess: string;
  policySaved: string;
  lifecycleSuccess: string;
  moreActions: string;
  changeHistory: string;
  changeHistoryDescription: string;
  changeHistoryRefresh: string;
  changeHistoryLoading: string;
  changeHistoryEmpty: string;
  changeHistoryError: string;
  changeHistoryClose: string;
  changeHistoryPrevious: string;
  changeHistoryNext: string;
  changeHistoryPage: string;
  changeHistoryAction: string;
  changeHistoryActor: string;
  changeHistoryFrom: string;
  changeHistoryTo: string;
  changeHistoryAllActions: string;
  changeHistoryNoActor: string;
  changeHistoryAffectedDriver: string;
  changeHistoryAffectedShift: string;
  changeHistoryChanges: string;
  changeHistoryAddedDrivers: string;
  changeHistoryRemovedDrivers: string;
  changeHistoryAddedCount: string;
  changeHistoryRemovedCount: string;
  changeHistoryActions: Record<string, string>;
  changeHistoryFields: Record<string, string>;
};
