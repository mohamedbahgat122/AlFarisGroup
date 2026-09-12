"use client";

import React, { useState, useTransition } from "react";
import { transferSupervisorShift } from "@/features/supervisor-shifts/actions";
import type { ToastState } from "@/components/dashboard/users/user-toast";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supervisor: any | null;
  currentShiftName?: string;
  currentAssignmentStartDate?: string | null;
  shifts: any[];
  onToast: (toast: ToastState) => void;
};

export function TransferShiftDialog({
  open,
  onOpenChange,
  supervisor,
  currentShiftName,
  currentAssignmentStartDate,
  shifts,
  onToast,
}: Props) {
  const [isPending, startTransition] = useTransition();

  const [newShiftId, setNewShiftId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [notes, setNotes] = useState("");

  React.useEffect(() => {
    if (open) {
      setNewShiftId("");
      setStartDate("");
      setNotes("");
    }
  }, [open]);

  if (!open || !supervisor) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!newShiftId) {
      onToast({ message: "يرجى اختيار الشيفت الجديد", tone: "error" });
      return;
    }
    if (!startDate) {
      onToast({ message: "يرجى اختيار تاريخ النفاذ", tone: "error" });
      return;
    }

    startTransition(async () => {
      try {
        const result = await transferSupervisorShift({
          supervisor_id: supervisor.id,
          new_shift_id: newShiftId,
          start_date: startDate,
          notes: notes || null,
        });

        if (!result.success) {
          onToast({ message: result.message, tone: "error" });
          return;
        }

        onToast({ message: "تم نقل المشرف بنجاح", tone: "success" });
        onOpenChange(false);
      } catch (err) {
        console.error("Transfer shift error:", err);
        onToast({ message: "حدث خطأ أثناء نقل المشرف", tone: "error" });
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-navy">نقل مشرف</h2>
          <button 
            onClick={() => onOpenChange(false)} 
            disabled={isPending}
            className="text-muted hover:text-navy disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2">
          <form id="transfer-shift-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-navy mb-1">المشرف</label>
              <input
                type="text"
                value={supervisor.full_name}
                readOnly
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted focus:outline-none cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-navy mb-1">الشيفت الحالي</label>
              <input
                type="text"
                value={currentShiftName || "غير مُعين"}
                readOnly
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted focus:outline-none cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-navy mb-1">الشيفت الجديد *</label>
              <select
                value={newShiftId}
                onChange={(e) => setNewShiftId(e.target.value)}
                disabled={isPending}
                className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:opacity-50"
                required
              >
                <option value="">اختر الشيفت الجديد...</option>
                {shifts.filter(s => s.is_active).map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.start_time.substring(0,5)} - {s.end_time.substring(0,5)})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-navy mb-1">تاريخ النفاذ *</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                min={currentAssignmentStartDate ?? undefined}
                disabled={isPending}
                className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:opacity-50"
                required
              />
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
            form="transfer-shift-form"
            disabled={isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover transition disabled:opacity-50"
          >
            {isPending ? "جاري النقل..." : "نقل المشرف"}
          </button>
        </div>
      </div>
    </div>
  );
}
