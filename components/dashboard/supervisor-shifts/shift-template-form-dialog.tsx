"use client";

import React, { useState, useTransition } from "react";
import { createShiftTemplate, updateShiftTemplate } from "@/features/supervisor-shifts/actions";
import type { ToastState } from "@/components/dashboard/users/user-toast";

type ShiftTemplateFormData = {
  name: string;
  start_time: string;
  end_time: string;
  work_days: number[];
  is_active: boolean;
  has_break: boolean;
  break_start_time: string;
  break_end_time: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shiftToEdit?: any | null;
  onToast: (toast: ToastState) => void;
};

const DAYS_OF_WEEK = [
  { value: 6, label: "السبت" },
  { value: 0, label: "الأحد" },
  { value: 1, label: "الإثنين" },
  { value: 2, label: "الثلاثاء" },
  { value: 3, label: "الأربعاء" },
  { value: 4, label: "الخميس" },
  { value: 5, label: "الجمعة" },
];

export function ShiftTemplateFormDialog({ open, onOpenChange, shiftToEdit, onToast }: Props) {
  const [isPending, startTransition] = useTransition();

  const isEdit = !!shiftToEdit;

  const [formData, setFormData] = useState<ShiftTemplateFormData>({
    name: shiftToEdit?.name || "",
    start_time: shiftToEdit?.start_time?.substring(0, 5) || "09:00",
    end_time: shiftToEdit?.end_time?.substring(0, 5) || "17:00",
    work_days: shiftToEdit?.work_days || [],
    is_active: shiftToEdit ? shiftToEdit.is_active : true,
    has_break: shiftToEdit?.break_start_time != null,
    break_start_time: shiftToEdit?.break_start_time?.substring(0, 5) || "12:00",
    break_end_time: shiftToEdit?.break_end_time?.substring(0, 5) || "13:00",
  });

  React.useEffect(() => {
    if (open) {
      setFormData({
        name: shiftToEdit?.name || "",
        start_time: shiftToEdit?.start_time?.substring(0, 5) || "09:00",
        end_time: shiftToEdit?.end_time?.substring(0, 5) || "17:00",
        work_days: shiftToEdit?.work_days || [],
        is_active: shiftToEdit ? shiftToEdit.is_active : true,
        has_break: shiftToEdit?.break_start_time != null,
        break_start_time: shiftToEdit?.break_start_time?.substring(0, 5) || "12:00",
        break_end_time: shiftToEdit?.break_end_time?.substring(0, 5) || "13:00",
      });
    }
  }, [open, shiftToEdit]);

  if (!open) return null;

  const handleDayToggle = (dayValue: number) => {
    setFormData((prev) => {
      const current = prev.work_days;
      if (current.includes(dayValue)) {
        return { ...prev, work_days: current.filter((d) => d !== dayValue) };
      } else {
        return { ...prev, work_days: [...current, dayValue].sort((a, b) => a - b) };
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      onToast({ message: "يرجى إدخال اسم الشيفت", tone: "error" });
      return;
    }
    if (formData.work_days.length === 0) {
      onToast({ message: "يرجى اختيار يوم عمل واحد على الأقل", tone: "error" });
      return;
    }

    startTransition(async () => {
      try {
        const submitData = {
          ...formData,
          break_start_time: formData.has_break ? formData.break_start_time : undefined,
          break_end_time: formData.has_break ? formData.break_end_time : undefined,
        };

        if (isEdit) {
          await updateShiftTemplate(shiftToEdit.id, submitData);
          onToast({ message: "تم تعديل الشيفت بنجاح", tone: "success" });
        } else {
          await createShiftTemplate(submitData);
          onToast({ message: "تم إنشاء الشيفت بنجاح", tone: "success" });
        }
        onOpenChange(false);
      } catch (err: any) {
        onToast({ message: err.message || "حدث خطأ غير متوقع", tone: "error" });
      }
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-navy">
            {isEdit ? "تعديل شيفت" : "إضافة شيفت جديد"}
          </h2>
          <button
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="text-muted hover:text-navy"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-navy">الاسم</label>
            <input
              type="text"
              required
              disabled={isPending}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              placeholder="مثال: شيفت صباحي"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-navy">وقت البداية</label>
              <input
                type="time"
                required
                disabled={isPending}
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-navy">وقت النهاية</label>
              <input
                type="time"
                required
                disabled={isPending}
                value={formData.end_time}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t mt-4">
            <input
              type="checkbox"
              id="hasBreakToggle"
              disabled={isPending}
              checked={formData.has_break}
              onChange={(e) => setFormData({ ...formData, has_break: e.target.checked })}
              className="rounded border-border text-primary focus:ring-primary"
            />
            <label htmlFor="hasBreakToggle" className="text-sm font-medium text-navy">
              يوجد بريك
            </label>
          </div>

          {formData.has_break && (
            <div className="grid grid-cols-2 gap-4 bg-surface p-3 rounded-lg border border-border">
              <div>
                <label className="mb-1 block text-sm font-medium text-navy">بداية البريك *</label>
                <input
                  type="time"
                  required
                  disabled={isPending}
                  value={formData.break_start_time}
                  onChange={(e) => setFormData({ ...formData, break_start_time: e.target.value })}
                  className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-navy">نهاية البريك *</label>
                <input
                  type="time"
                  required
                  disabled={isPending}
                  value={formData.break_end_time}
                  onChange={(e) => setFormData({ ...formData, break_end_time: e.target.value })}
                  className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                />
              </div>
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-medium text-navy mt-4">أيام العمل</label>
            <div className="flex flex-wrap gap-2">
              {DAYS_OF_WEEK.map((day) => {
                const isSelected = formData.work_days.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    disabled={isPending}
                    onClick={() => handleDayToggle(day.value)}
                    className={"rounded-full px-3 py-1 text-sm transition-colors disabled:opacity-50 " + (isSelected ? "bg-primary text-white" : "bg-surface text-navy hover:bg-surface/80")}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="isActiveToggle"
              disabled={isPending}
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="rounded border-border text-primary focus:ring-primary"
            />
            <label htmlFor="isActiveToggle" className="text-sm font-medium text-navy">
              نشط (متاح للاستخدام)
            </label>
          </div>

          <div className="mt-6 flex justify-end gap-3 border-t pt-4">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              className="rounded-md bg-surface px-4 py-2 text-sm font-medium text-navy hover:bg-surface/80 disabled:opacity-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
            >
              {isPending ? "جاري الحفظ..." : "حفظ"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
