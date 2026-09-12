"use client";

import React, { useState, useTransition } from "react";
import { ShiftTemplateFormDialog } from "./shift-template-form-dialog";
import { toggleShiftTemplateStatus } from "@/features/supervisor-shifts/actions";
import { calculateShiftDurations } from "@/features/supervisor-shifts/utils";
import type { ToastState } from "@/components/dashboard/users/user-toast";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shifts: any[];
  onToast: (toast: ToastState) => void;
};

export function ManageShiftsDialog({ open, onOpenChange, shifts, onToast }: Props) {
  const [isPending, startTransition] = useTransition();
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<any | null>(null);

  if (!open) return null;

  const handleCreate = () => {
    setEditingShift(null);
    setIsFormOpen(true);
  };

  const handleEdit = (shift: any) => {
    setEditingShift(shift);
    setIsFormOpen(true);
  };

  const handleToggleStatus = (shift: any) => {
    startTransition(async () => {
      try {
        await toggleShiftTemplateStatus(shift.id, !shift.is_active);
        onToast({
          message: `تم ${shift.is_active ? "تعطيل" : "تفعيل"} الشيفت بنجاح`,
          tone: "success",
        });
      } catch (err: any) {
        onToast({
          message: err.message || "حدث خطأ غير متوقع",
          tone: "error",
        });
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-navy">إدارة الشيفتات</h2>
          <button onClick={() => onOpenChange(false)} className="text-muted hover:text-navy">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          <table className="w-full text-start text-sm">
            <thead className="border-b border-border bg-surface/50 text-muted sticky top-0">
              <tr>
                <th className="px-4 py-2 font-semibold">الاسم</th>
                <th className="px-4 py-2 font-semibold">من</th>
                <th className="px-4 py-2 font-semibold">إلى</th>
                <th className="px-4 py-2 font-semibold">أيام العمل</th>
                <th className="px-4 py-2 font-semibold text-end">الحالة</th>
                <th className="px-4 py-2 font-semibold text-end">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shifts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted">
                    لا يوجد شيفتات
                  </td>
                </tr>
              ) : (
                shifts.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 text-navy">
                      <div className="font-medium">{s.name}</div>
                      {s.break_start_time && s.break_end_time && (
                        <div className="text-xs text-muted mt-1">
                          بريك: {s.break_start_time.substring(0, 5)} - {s.break_end_time.substring(0, 5)}
                          <br />
                          صافي: {calculateShiftDurations(s.start_time, s.end_time, s.break_start_time, s.break_end_time).formattedNet}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted align-top">{s.start_time.substring(0, 5)}</td>
                    <td className="px-4 py-3 text-muted align-top">{s.end_time.substring(0, 5)}</td>
                    <td className="px-4 py-3 text-muted align-top">
                      {s.work_days.length} أيام
                    </td>
                    <td className="px-4 py-3 text-end align-top">
                      {s.is_active ? (
                        <span className="text-xs bg-success/10 text-success px-2 py-1 rounded">مفعل</span>
                      ) : (
                        <span className="text-xs bg-muted/10 text-muted px-2 py-1 rounded">معطل</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-end space-x-2 space-x-reverse align-top">
                      <button
                        type="button"
                        onClick={() => handleEdit(s)}
                        disabled={isPending}
                        className="text-xs font-medium text-primary hover:text-primary-hover disabled:opacity-50"
                      >
                        تعديل
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(s)}
                        disabled={isPending}
                        className={`text-xs font-medium disabled:opacity-50 ${
                          s.is_active ? "text-danger hover:text-danger-hover" : "text-success hover:text-success"
                        }`}
                      >
                        {s.is_active ? "تعطيل" : "تفعيل"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        <div className="mt-6 border-t pt-4 flex justify-between">
          <button
            type="button"
            onClick={handleCreate}
            className="text-sm font-medium text-primary hover:text-primary-hover"
          >
            + شيفت جديد
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md bg-surface px-4 py-2 text-sm font-medium text-navy hover:bg-surface/80"
          >
            إغلاق
          </button>
        </div>
      </div>
      
      <ShiftTemplateFormDialog 
        open={isFormOpen} 
        onOpenChange={setIsFormOpen} 
        shiftToEdit={editingShift} 
        onToast={onToast}
      />
    </div>
  );
}
