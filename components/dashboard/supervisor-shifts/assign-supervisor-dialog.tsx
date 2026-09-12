"use client";

import React, { useState, useTransition } from "react";
import { assignSupervisorAction } from "@/features/supervisor-shifts/actions";
import type { ToastState } from "@/components/dashboard/users/user-toast";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supervisors: any[];
  shifts: any[];
  organizations: any[];
  onToast: (toast: ToastState) => void;
};

export function AssignSupervisorDialog({ open, onOpenChange, supervisors, shifts, organizations, onToast }: Props) {
  const [isPending, startTransition] = useTransition();

  const [supervisorId, setSupervisorId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [selectedOrgs, setSelectedOrgs] = useState<string[]>([]);

  // Reset form when opened
  React.useEffect(() => {
    if (open) {
      setSupervisorId("");
      setShiftId("");
      setStartDate("");
      setSelectedOrgs([]);
    }
  }, [open]);

  if (!open) return null;

  const handleOrgToggle = (orgId: string) => {
    setSelectedOrgs((prev) => 
      prev.includes(orgId) ? prev.filter(id => id !== orgId) : [...prev, orgId]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!supervisorId) {
      onToast({ message: "يرجى اختيار المشرف", tone: "error" });
      return;
    }
    if (!shiftId) {
      onToast({ message: "يرجى اختيار الشيفت", tone: "error" });
      return;
    }
    if (!startDate) {
      onToast({ message: "يرجى اختيار تاريخ البداية", tone: "error" });
      return;
    }
    if (selectedOrgs.length === 0) {
      onToast({ message: "يجب اختيار مؤسسة واحدة على الأقل", tone: "error" });
      return;
    }

    startTransition(async () => {
      try {
        await assignSupervisorAction({
          supervisor_id: supervisorId,
          shift_id: shiftId,
          start_date: startDate,
          organization_ids: selectedOrgs,
        });

        onToast({ message: "تم تعيين المشرف بنجاح", tone: "success" });
        onOpenChange(false);
      } catch (err: any) {
        console.error("Assign error:", err);
        onToast({ message: err.message || "حدث خطأ أثناء التعيين", tone: "error" });
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-navy">تعيين مشرف</h2>
          <button 
            onClick={() => onOpenChange(false)} 
            disabled={isPending}
            className="text-muted hover:text-navy disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2">
          <form id="assign-supervisor-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-navy mb-1">المشرف *</label>
              <select
                value={supervisorId}
                onChange={(e) => setSupervisorId(e.target.value)}
                disabled={isPending}
                className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:opacity-50"
                required
              >
                <option value="">اختر المشرف...</option>
                {supervisors.map(s => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-navy mb-1">الشيفت *</label>
              <select
                value={shiftId}
                onChange={(e) => setShiftId(e.target.value)}
                disabled={isPending}
                className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:opacity-50"
                required
              >
                <option value="">اختر الشيفت...</option>
                {shifts.filter(s => s.is_active).map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.start_time.substring(0,5)} - {s.end_time.substring(0,5)})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-navy mb-1">تاريخ البداية *</label>
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
              <label className="block text-sm font-medium text-navy mb-2">المؤسسات *</label>
              <div className="space-y-2 border border-border rounded-md p-3 max-h-40 overflow-y-auto">
                {organizations.map(org => {
                  const isChecked = selectedOrgs.includes(org.id);
                  return (
                    <label key={org.id} className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={isChecked}
                        disabled={isPending}
                        onChange={() => handleOrgToggle(org.id)}
                        className="rounded border-border text-primary focus:ring-primary disabled:opacity-50"
                      />
                      <span className="text-sm text-navy">{org.name}</span>
                    </label>
                  );
                })}
                {organizations.length === 0 && (
                  <div className="text-sm text-muted text-center py-2">لا يوجد مؤسسات</div>
                )}
              </div>
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
            form="assign-supervisor-form"
            disabled={isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover transition disabled:opacity-50"
          >
            {isPending ? "جاري الحفظ..." : "تعيين"}
          </button>
        </div>
      </div>
    </div>
  );
}
