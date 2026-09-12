"use client";

import React, { useState, useTransition } from "react";
import { setSupervisorWeeklyOff } from "@/features/supervisor-shifts/actions";
import type { ToastState } from "@/components/dashboard/users/user-toast";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supervisor: any | null;
  allSupervisors: any[];
  currentWeeklyOff: any | null;
  onToast: (toast: ToastState) => void;
};

const DAYS_OF_WEEK = [
  { value: 0, label: "الأحد" },
  { value: 1, label: "الإثنين" },
  { value: 2, label: "الثلاثاء" },
  { value: 3, label: "الأربعاء" },
  { value: 4, label: "الخميس" },
  { value: 5, label: "الجمعة" },
  { value: 6, label: "السبت" },
];

export function EditWeeklyOffDialog({ open, onOpenChange, supervisor, allSupervisors, currentWeeklyOff, onToast }: Props) {
  const [isPending, startTransition] = useTransition();

  const [dayOfWeek, setDayOfWeek] = useState<number>(0);
  const [coverageId, setCoverageId] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [notes, setNotes] = useState("");

  React.useEffect(() => {
    if (open && supervisor) {
      if (currentWeeklyOff) {
        setDayOfWeek(currentWeeklyOff.day_of_week);
        setCoverageId(currentWeeklyOff.coverage_supervisor_id || "");
      } else {
        setDayOfWeek(5); // Default to Friday
        setCoverageId("");
      }
      setStartDate(new Date().toISOString().split('T')[0]);
      setNotes("");
    }
  }, [open, supervisor, currentWeeklyOff]);

  if (!open || !supervisor) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (dayOfWeek < 0 || dayOfWeek > 6) {
      onToast({ message: "يرجى اختيار يوم صحيح", tone: "error" });
      return;
    }
    if (!startDate) {
      onToast({ message: "يرجى اختيار تاريخ السريان", tone: "error" });
      return;
    }

    startTransition(async () => {
      try {
        await setSupervisorWeeklyOff({
          supervisor_id: supervisor.id,
          day_of_week: dayOfWeek,
          coverage_supervisor_id: coverageId || null,
          effective_from: startDate,
          notes: notes || undefined,
        });

        onToast({ message: "تم تحديث الراحة الأسبوعية بنجاح", tone: "success" });
        onOpenChange(false);
      } catch (err: any) {
        console.error("Edit weekly off error:", err);
        onToast({ message: err.message || "حدث خطأ أثناء حفظ الراحة الأسبوعية", tone: "error" });
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-navy">تعديل الراحة الأسبوعية</h2>
          <button 
            onClick={() => onOpenChange(false)} 
            disabled={isPending}
            className="text-muted hover:text-navy disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2">
          <form id="edit-weekly-off-form" onSubmit={handleSubmit} className="space-y-4">
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
              <label className="block text-sm font-medium text-navy mb-1">يوم الراحة *</label>
              <select
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(parseInt(e.target.value))}
                disabled={isPending}
                className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:opacity-50"
                required
              >
                {DAYS_OF_WEEK.map(d => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-navy mb-1">المشرف البديل (التغطية)</label>
              <select
                value={coverageId}
                onChange={(e) => setCoverageId(e.target.value)}
                disabled={isPending}
                className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:opacity-50"
              >
                <option value="">بدون تغطية</option>
                {allSupervisors
                  .filter(s => s.id !== supervisor.id)
                  .map(s => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-navy mb-1">تاريخ السريان *</label>
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
            form="edit-weekly-off-form"
            disabled={isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover transition disabled:opacity-50"
          >
            {isPending ? "جاري الحفظ..." : "حفظ التعديلات"}
          </button>
        </div>
      </div>
    </div>
  );
}
