"use client";

import React, { useState, useTransition } from "react";
import { updateSupervisorOrganizations } from "@/features/supervisor-shifts/actions";
import type { ToastState } from "@/components/dashboard/users/user-toast";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supervisor: any | null;
  organizations: any[];
  currentOrgAssignments: any[];
  onToast: (toast: ToastState) => void;
};

export function EditOrganizationsDialog({ open, onOpenChange, supervisor, organizations, currentOrgAssignments, onToast }: Props) {
  const [isPending, startTransition] = useTransition();

  const [selectedOrgs, setSelectedOrgs] = useState<string[]>([]);
  const [startDate, setStartDate] = useState("");

  React.useEffect(() => {
    if (open && supervisor) {
      // Pre-select current organizations
      const activeOrgs = currentOrgAssignments
        .filter(a => a.supervisor_id === supervisor.id)
        .map(a => a.organization_id);
      
      setSelectedOrgs(activeOrgs);
      setStartDate(new Date().toISOString().split('T')[0]); // Default to today
    }
  }, [open, supervisor, currentOrgAssignments]);

  if (!open || !supervisor) return null;

  const handleOrgToggle = (orgId: string) => {
    setSelectedOrgs((prev) => 
      prev.includes(orgId) ? prev.filter(id => id !== orgId) : [...prev, orgId]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedOrgs.length === 0) {
      onToast({ message: "يجب اختيار مؤسسة واحدة على الأقل", tone: "error" });
      return;
    }
    if (!startDate) {
      onToast({ message: "يرجى اختيار تاريخ النفاذ", tone: "error" });
      return;
    }

    startTransition(async () => {
      try {
        await updateSupervisorOrganizations(supervisor.id, selectedOrgs, startDate);

        onToast({ message: "تم تحديث مؤسسات المشرف بنجاح", tone: "success" });
        onOpenChange(false);
      } catch (err: any) {
        console.error("Edit organizations error:", err);
        onToast({ message: err.message || "حدث خطأ أثناء تعديل المؤسسات", tone: "error" });
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-navy">تعديل مؤسسات المشرف</h2>
          <button 
            onClick={() => onOpenChange(false)} 
            disabled={isPending}
            className="text-muted hover:text-navy disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2">
          <form id="edit-orgs-form" onSubmit={handleSubmit} className="space-y-4">
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
              <label className="block text-sm font-medium text-navy mb-2">المؤسسات (متعدد الاختيار) *</label>
              <div className="space-y-2 border border-border rounded-md p-3 max-h-60 overflow-y-auto">
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

            <div>
              <label className="block text-sm font-medium text-navy mb-1">تاريخ النفاذ *</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={isPending}
                className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:opacity-50"
                required
              />
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
            form="edit-orgs-form"
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
