"use client";

import React, { useState, useTransition } from "react";
import { createSupervisorLeave } from "@/features/supervisor-shifts/actions";
import type { ToastState } from "@/components/dashboard/users/user-toast";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supervisor: any | null;
  allSupervisors: any[];
  activeLeaves: any[];
  onToast: (toast: ToastState) => void;
};

export function LeaveDialog({ open, onOpenChange, supervisor, allSupervisors, activeLeaves, onToast }: Props) {
  const [isPending, startTransition] = useTransition();

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [leaveType, setLeaveType] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [coveredBy, setCoveredBy] = useState("");

  React.useEffect(() => {
    if (open) {
      setStartDate("");
      setEndDate("");
      setLeaveType("");
      setReason("");
      setNotes("");
      setCoveredBy("");
    }
  }, [open]);

  if (!open || !supervisor) return null;

  // Filter available coverage supervisors
  // Exclude self, and exclude supervisors who have active leave overlapping with selected dates.
  const availableCoverage = allSupervisors.filter(s => {
    if (s.id === supervisor.id) return false;
    
    // Check overlap if dates are selected
    if (startDate && endDate) {
      const sLeave = activeLeaves.find(l => l.supervisor_id === s.id && l.status === 'active');
      if (sLeave) {
        // Overlap condition: start1 <= end2 && start2 <= end1
        if (startDate <= sLeave.end_date && sLeave.start_date <= endDate) {
          return false;
        }
      }
    }
    return true;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!startDate || !endDate) {
      onToast({ message: "يرجى اختيار تاريخ البداية والنهاية", tone: "error" });
      return;
    }

    if (startDate > endDate) {
      onToast({ message: "تاريخ البداية يجب أن يكون قبل تاريخ النهاية", tone: "error" });
      return;
    }

    startTransition(async () => {
      try {
        await createSupervisorLeave({
          supervisor_id: supervisor.id,
          start_date: startDate,
          end_date: endDate,
          leave_type: leaveType || undefined,
          reason: reason || undefined,
          notes: notes || undefined,
          covered_by_supervisor_id: coveredBy || undefined,
        });

        onToast({ message: "تم تسجيل إجازة المشرف بنجاح", tone: "success" });
        onOpenChange(false);
      } catch (err: any) {
        console.error("Leave error:", err);
        onToast({ message: err.message || "حدث خطأ أثناء حفظ الإجازة", tone: "error" });
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-navy">تسجيل إجازة</h2>
          <button 
            onClick={() => onOpenChange(false)} 
            disabled={isPending}
            className="text-muted hover:text-navy disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2">
          <form id="leave-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-navy mb-1">المشرف</label>
              <input
                type="text"
                value={supervisor.full_name}
                readOnly
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted focus:outline-none cursor-not-allowed"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-navy mb-1">من تاريخ *</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={isPending}
                  className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:opacity-50"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy mb-1">إلى تاريخ *</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={isPending}
                  className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:opacity-50"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-navy mb-1">المشرف البديل / التغطية (اختياري)</label>
              <select
                value={coveredBy}
                onChange={(e) => setCoveredBy(e.target.value)}
                disabled={isPending}
                className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:opacity-50"
              >
                <option value="">بدون تغطية...</option>
                {availableCoverage.map(s => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-navy mb-1">نوع الإجازة</label>
                <input
                  type="text"
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value)}
                  disabled={isPending}
                  className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:opacity-50"
                  placeholder="مثال: سنوية، مرضية..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy mb-1">السبب</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={isPending}
                  className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-navy mb-1">ملاحظات</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isPending}
                className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:opacity-50 min-h-20 resize-none"
              ></textarea>
            </div>
          </form>
        </div>

        <div className="pt-4 flex justify-end gap-3 border-t border-border mt-6">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="rounded-md bg-surface px-4 py-2 text-sm font-medium text-navy hover:bg-surface/80 transition disabled:opacity-50"
          >
            إلغاء
          </button>
          <button
            type="submit"
            form="leave-form"
            disabled={isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover transition disabled:opacity-50"
          >
            {isPending ? "جاري الحفظ..." : "حفظ الإجازة"}
          </button>
        </div>
      </div>
    </div>
  );
}
