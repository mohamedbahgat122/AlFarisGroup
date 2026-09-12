"use client";

import { useState } from "react";
import { ManageShiftsDialog } from "./manage-shifts-dialog";
import { AssignSupervisorDialog } from "./assign-supervisor-dialog";
import { CancelLeaveDialog } from "./cancel-leave-dialog";
import { TransferShiftDialog } from "./transfer-shift-dialog";
import { EditOrganizationsDialog } from "./edit-organizations-dialog";
import { EditWeeklyOffDialog } from "./edit-weekly-off-dialog";
import { RemoveShiftDialog } from "./remove-shift-dialog";
import { startSupervisorWorkSession, endSupervisorWorkSession } from "@/features/supervisor-shifts/actions";
import { calculateShiftDurations } from "@/features/supervisor-shifts/utils";
import { UserToast, type ToastState } from "@/components/dashboard/users/user-toast";

interface SupervisorShiftsClientProps {
  data: {
    supervisors: any[];
    orgAssignments: any[];
    shiftAssignments: any[];
    leaves: any[];
    shifts: any[];
    allOrganizations: any[];
    weeklyOffs?: any[];
    workSessions?: any[];
  };
  locale: string;
}

// Helper to determine if a shift is currently active in Riyadh timezone
function isCurrentlyOnDuty(shift: any | null, leaves: any[], supervisorId: string): boolean {
  if (!shift) return false;
  
  // Check if on leave
  const isOnLeave = leaves.some(l => l.supervisor_id === supervisorId);
  if (isOnLeave) return false;

  const now = new Date();
  
  // Get time in Riyadh
  const riyadhTimeParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Riyadh',
    hour12: false,
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'long'
  }).formatToParts(now);

  let currentHour = 0;
  let currentMinute = 0;
  let currentWeekday = '';

  for (const part of riyadhTimeParts) {
    if (part.type === 'hour') currentHour = parseInt(part.value, 10);
    if (part.type === 'minute') currentMinute = parseInt(part.value, 10);
    if (part.type === 'weekday') currentWeekday = part.value;
  }
  
  if (currentHour === 24) currentHour = 0; // Intl sometimes returns 24 instead of 0

  const currentTotalMins = currentHour * 60 + currentMinute;
  
  // Map weekday to our system (0=Sunday ... 6=Saturday)
  const weekdaysMap: Record<string, number> = {
    'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
    'Thursday': 4, 'Friday': 5, 'Saturday': 6
  };
  const sysDay = weekdaysMap[currentWeekday];

  if (!shift.work_days.includes(sysDay)) return false;

  const [startH, startM] = shift.start_time.split(':').map(Number);
  const [endH, endM] = shift.end_time.split(':').map(Number);
  
  const startMins = startH * 60 + startM;
  const endMins = endH * 60 + endM;

  if (startMins <= endMins) {
    return currentTotalMins >= startMins && currentTotalMins <= endMins;
  } else {
    // Crosses midnight
    return currentTotalMins >= startMins || currentTotalMins <= endMins;
  }
}

export const SupervisorShiftsClient = ({ data, locale }: SupervisorShiftsClientProps) => {
  const [toast, setToast] = useState<ToastState | null>(null);

  // Dialog states
  const [manageShiftsDialogOpen, setManageShiftsDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [cancelLeaveDialogOpen, setCancelLeaveDialogOpen] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [editOrgsDialogOpen, setEditOrgsDialogOpen] = useState(false);
  const [editWeeklyOffDialogOpen, setEditWeeklyOffDialogOpen] = useState(false);
  const [removeShiftDialogOpen, setRemoveShiftDialogOpen] = useState(false);
  
  // Selected state for row actions
  const [selectedSupervisor, setSelectedSupervisor] = useState<any>(null);
  const [selectedLeaveId, setSelectedLeaveId] = useState<string | null>(null);

  const totalSupervisors = data.supervisors?.length || 0;
  
  // Calculate today's day of week
  const todayStr = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Riyadh' })).toISOString().split('T')[0];
  
  const onLeaveCount = data.leaves?.filter(l => l.status === 'active' && l.start_date <= todayStr && l.end_date >= todayStr).length || 0;
  
  const now = new Date();
  const riyadhTimeParts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Riyadh', weekday: 'long' }).formatToParts(now);
  let currentWeekday = '';
  for (const part of riyadhTimeParts) { if (part.type === 'weekday') currentWeekday = part.value; }
  const sysDay = { 'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6 }[currentWeekday] || 0;

  const weeklyOffTodayCount = data.weeklyOffs?.filter(w => w.day_of_week === sysDay).length || 0;
  const activeSessionsCount = data.workSessions?.filter(s => s.ended_at === null).length || 0;

  const handleStartWork = async (supervisorId: string) => {
    try {
      await startSupervisorWorkSession(supervisorId);
      setToast({ message: "تم بدء العمل بنجاح", tone: "success" });
    } catch (err: any) {
      setToast({ message: err.message || "حدث خطأ أثناء بدء العمل", tone: "error" });
    }
  };

  const handleEndWork = async (supervisorId: string) => {
    try {
      await endSupervisorWorkSession(supervisorId);
      setToast({ message: "تم إنهاء العمل بنجاح", tone: "success" });
    } catch (err: any) {
      setToast({ message: err.message || "حدث خطأ أثناء إنهاء العمل", tone: "error" });
    }
  };

  return (
    <>
      <div className="flex flex-col gap-4 border-b border-border bg-surface px-5 py-6 sm:px-7 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-bold tracking-normal text-navy">
            شيفتات المشرفين
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            إدارة جداول دوام المشرفين والإجازات والتغطيات.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          <button 
            type="button" 
            onClick={() => setManageShiftsDialogOpen(true)}
            className="inline-flex min-h-12 w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-border bg-white px-5 text-sm font-semibold text-navy transition hover:bg-surface focus-visible:outline focus-visible:outline-offset-2"
          >
            تعيين شيفت
          </button>
           <button 
            type="button" 
            onClick={() => setAssignDialogOpen(true)}
            className="inline-flex min-h-12 w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-transparent bg-primary px-5 text-sm font-semibold text-white transition hover:bg-primary-hover focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            + تعيين مشرف
          </button>
        </div>
      </div>

      <div className="border-b border-border bg-surface px-5 py-6 sm:px-7">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <h3 className="text-sm font-medium text-muted">إجمالي المشرفين</h3>
            <p className="mt-2 text-3xl font-bold text-navy">{totalSupervisors}</p>
          </div>
          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <h3 className="text-sm font-medium text-muted">يعملون الآن</h3>
            <p className="mt-2 text-3xl font-bold text-navy text-primary">{activeSessionsCount}</p>
          </div>
          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <h3 className="text-sm font-medium text-muted">راحة أسبوعية اليوم</h3>
            <p className="mt-2 text-3xl font-bold text-navy">{weeklyOffTodayCount}</p>
          </div>
          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <h3 className="text-sm font-medium text-muted">في إجازة اليوم</h3>
            <p className="mt-2 text-3xl font-bold text-navy">{onLeaveCount}</p>
          </div>
        </div>
      </div>

      <div className="px-5 py-6 sm:px-7">
        <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="border-b border-border bg-surface/50 text-muted">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3.5 text-start font-semibold">المشرف</th>
                  <th className="whitespace-nowrap px-4 py-3.5 text-start font-semibold">الشيفت / المؤسسات</th>
                  <th className="whitespace-nowrap px-4 py-3.5 text-start font-semibold">حالة اليوم (تشغيلي)</th>
                  <th className="whitespace-nowrap px-4 py-3.5 text-start font-semibold">حالة الدوام (حضور)</th>
                  <th className="whitespace-nowrap px-4 py-3.5 text-start font-semibold">الراحة الأسبوعية</th>
                  <th className="whitespace-nowrap px-4 py-3.5 text-start font-semibold">وقت العمل</th>
                  <th className="whitespace-nowrap px-4 py-3.5 text-end font-semibold">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-white">
                {(data.supervisors || []).map((row) => {
                  const activeLeave = data.leaves?.find(l => l.supervisor_id === row.id && l.status === 'active' && l.start_date <= todayStr && l.end_date >= todayStr);
                  const weeklyOff = data.weeklyOffs?.find(w => w.supervisor_id === row.id);
                  const workSession = data.workSessions?.find(s => s.supervisor_id === row.id);
                  const activeSession = workSession?.ended_at === null;

                  const shiftAssignment = data.shiftAssignments?.find(s => s.supervisor_id === row.id);
                  const shift = shiftAssignment ? data.shifts?.find(s => s.id === shiftAssignment.shift_id) : null;
                  const orgs = data.orgAssignments?.filter(o => o.supervisor_id === row.id) || [];
                  
                  // Deterministic Status Logic - Separated!
                  let operationalBadge = null;
                  if (activeLeave) {
                    operationalBadge = <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10">في إجازة</span>;
                  } else if (weeklyOff && weeklyOff.day_of_week === sysDay) {
                    operationalBadge = <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-600/10">راحة أسبوعية</span>;
                  } else if (!shift) {
                    operationalBadge = <span className="inline-flex items-center rounded-full bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10">بدون شيفت</span>;
                  } else {
                    operationalBadge = <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/10">يوم عمل</span>;
                  }

                  let attendanceBadge = null;
                  if (activeSession) {
                    attendanceBadge = <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary ring-1 ring-inset ring-primary/20">يعمل الآن</span>;
                  } else if (workSession && workSession.ended_at !== null) {
                    attendanceBadge = <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">أنهى العمل</span>;
                  } else {
                    attendanceBadge = <span className="inline-flex items-center rounded-full bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10">لم يبدأ</span>;
                  }

                  // Weekly Off Coverage resolution
                  let weeklyCoverageName = null;
                  if (weeklyOff && weeklyOff.coverage_supervisor_id) {
                    const c = (data.supervisors || []).find(s => s.id === weeklyOff.coverage_supervisor_id);
                    if (c) weeklyCoverageName = c.full_name;
                  }

                  // Is this supervisor covering someone else's weekly off today?
                  const coveringForWeeklyOff = data.weeklyOffs?.filter(w => w.coverage_supervisor_id === row.id && w.day_of_week === sysDay) || [];
                  
                  // Calculate Work Session Duration
                  let durationStr = "-";
                  if (workSession) {
                    const startT = new Date(workSession.started_at);
                    if (workSession.ended_at) {
                      const endT = new Date(workSession.ended_at);
                      const diffMs = endT.getTime() - startT.getTime();
                      const hours = Math.floor(diffMs / 3600000);
                      const minutes = Math.floor((diffMs % 3600000) / 60000);
                      durationStr = `${hours} س و ${minutes} د`;
                    } else {
                      durationStr = "قيد العمل...";
                    }
                  }

                  const formatTime = (ts: string) => {
                    return new Date(ts).toLocaleTimeString('en-US', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit', hour12: false });
                  };

                  const DAYS_LABELS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

                  return (
                    <tr key={row.id} className="transition-colors hover:bg-surface/30">
                      <td className="whitespace-nowrap px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
                            {(row.full_name || "M").charAt(0)}
                          </div>
                          <div>
                            <div className="font-medium text-navy">{row.full_name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-navy">
                        <div className="flex flex-col gap-1">
                          {shift ? (
                            <div className="flex flex-col gap-1">
                              <span><span className="font-semibold">{shift.name}</span> ({shift.start_time.substring(0,5)} - {shift.end_time.substring(0,5)})</span>
                              {shift.break_start_time && shift.break_end_time && (
                                <span className="text-xs text-muted">
                                  بريك: {shift.break_start_time.substring(0, 5)} - {shift.break_end_time.substring(0, 5)} (صافي {calculateShiftDurations(shift.start_time, shift.end_time, shift.break_start_time, shift.break_end_time).formattedNet})
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted">بدون شيفت</span>
                          )}
                          <span className="text-xs text-muted max-w-[200px] truncate mt-1 border-t pt-1">
                            {orgs.length > 0 
                              ? orgs.map(o => o.organizations?.name || o.organization_id).join("، ") 
                              : "بدون مؤسسات"}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        {operationalBadge}
                        {coveringForWeeklyOff.length > 0 && (
                          <div className="mt-1">
                            <span className="text-xs text-primary font-medium">يغطي اليوم</span>
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        {attendanceBadge}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-navy">
                        {weeklyOff ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium">{DAYS_LABELS[weeklyOff.day_of_week]}</span>
                            {weeklyCoverageName && <span className="text-xs text-muted">بديل: {weeklyCoverageName}</span>}
                          </div>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-navy">
                        {workSession ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium">{formatTime(workSession.started_at)} → {workSession.ended_at ? formatTime(workSession.ended_at) : '...'}</span>
                            <span className="text-xs text-muted">المدة: {durationStr}</span>
                          </div>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-end">
                        <div className="flex justify-end gap-2 items-center flex-wrap max-w-[200px]">
                          {activeSession ? (
                            <button 
                              type="button" 
                              onClick={() => handleEndWork(row.id)}
                              className="text-sm font-medium text-danger hover:bg-danger/10 px-2 py-1 rounded transition"
                            >
                              إنهاء العمل
                            </button>
                          ) : (
                            <button 
                              type="button" 
                              onClick={() => handleStartWork(row.id)}
                              disabled={workSession?.ended_at !== null && !!workSession}
                              className="text-sm font-medium text-primary hover:bg-primary/10 px-2 py-1 rounded transition disabled:opacity-50"
                            >
                              بدء العمل
                            </button>
                          )}
                          <div className="w-full h-[1px] bg-border my-1"></div>
                          <button 
                            type="button" 
                            onClick={() => { setSelectedSupervisor(row); setTransferDialogOpen(true); }}
                            className="text-xs font-medium text-muted hover:text-navy px-1"
                          >
                            نقل
                          </button>
                          <button 
                            type="button" 
                            onClick={() => { setSelectedSupervisor(row); setEditOrgsDialogOpen(true); }}
                            className="text-xs font-medium text-muted hover:text-navy px-1"
                          >
                            مؤسسات
                          </button>
                          <button 
                            type="button" 
                            onClick={() => { setSelectedSupervisor(row); setEditWeeklyOffDialogOpen(true); }}
                            className="text-xs font-medium text-muted hover:text-navy px-1"
                          >
                            الراحة
                          </button>
                          {activeLeave ? (
                            <button 
                              type="button" 
                              onClick={() => { setSelectedLeaveId(activeLeave.id); setCancelLeaveDialogOpen(true); }}
                              className="text-xs font-medium text-danger hover:text-danger/80 px-1"
                            >
                              إلغاء إجازة
                            </button>
                          ) : shiftAssignment ? (
                            <button 
                              type="button" 
                              onClick={() => { setSelectedSupervisor(row); setRemoveShiftDialogOpen(true); }}
                              className="text-xs font-medium text-danger hover:text-danger/80 px-1"
                            >
                              إزالة من الشيفت
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ManageShiftsDialog 
        open={manageShiftsDialogOpen}
        onOpenChange={setManageShiftsDialogOpen}
        shifts={data.shifts || []}
        onToast={setToast}
      />
      
      <UserToast locale={locale as "ar" | "en"} toast={toast} onDismiss={() => setToast(null)} />
      
      <AssignSupervisorDialog 
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        supervisors={data.supervisors || []}
        shifts={data.shifts || []}
        organizations={data.allOrganizations || []}
        onToast={setToast}
      />

      <CancelLeaveDialog
        open={cancelLeaveDialogOpen}
        onOpenChange={setCancelLeaveDialogOpen}
        leaveId={selectedLeaveId}
        onToast={setToast}
      />

      <TransferShiftDialog
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
        supervisor={selectedSupervisor}
        currentShiftName={data.shifts?.find(s => s.id === data.shiftAssignments?.find(a => a.supervisor_id === selectedSupervisor?.id)?.shift_id)?.name}
        currentAssignmentStartDate={data.shiftAssignments?.find(a => a.supervisor_id === selectedSupervisor?.id)?.start_date}
        shifts={data.shifts || []}
        onToast={setToast}
      />

      <RemoveShiftDialog
        open={removeShiftDialogOpen}
        onOpenChange={setRemoveShiftDialogOpen}
        supervisor={selectedSupervisor}
        currentShiftName={data.shifts?.find(s => s.id === data.shiftAssignments?.find(a => a.supervisor_id === selectedSupervisor?.id)?.shift_id)?.name}
        onToast={setToast}
      />

      <EditOrganizationsDialog
        open={editOrgsDialogOpen}
        onOpenChange={setEditOrgsDialogOpen}
        supervisor={selectedSupervisor}
        organizations={data.allOrganizations || []}
        currentOrgAssignments={data.orgAssignments || []}
        onToast={setToast}
      />
      <EditWeeklyOffDialog
        open={editWeeklyOffDialogOpen}
        onOpenChange={setEditWeeklyOffDialogOpen}
        supervisor={selectedSupervisor}
        allSupervisors={data.supervisors || []}
        currentWeeklyOff={data.weeklyOffs?.find(w => w.supervisor_id === selectedSupervisor?.id)}
        onToast={setToast}
      />
    </>
  );
};
