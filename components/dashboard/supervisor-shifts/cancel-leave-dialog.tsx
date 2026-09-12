"use client";

import React, { useState, useTransition } from "react";
import { cancelSupervisorLeave } from "@/features/supervisor-shifts/actions";
import type { ToastState } from "@/components/dashboard/users/user-toast";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leaveId: string | null;
  onToast: (toast: ToastState) => void;
};

export function CancelLeaveDialog({ open, onOpenChange, leaveId, onToast }: Props) {
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState("");

  React.useEffect(() => {
    if (open) {
      setReason("");
    }
  }, [open]);

  if (!open || !leaveId) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!reason.trim()) {
      onToast({ message: "يرجى إدخال سبب الإلغاء", tone: "error" });
      return;
    }

    startTransition(async () => {
      try {
        await cancelSupervisorLeave(leaveId, reason);

        onToast({ message: "تم إلغاء الإجازة بنجاح", tone: "success" });
        onOpenChange(false);
      } catch (err: any) {
        console.error("Cancel leave error:", err);
        onToast({ message: err.message || "حدث خطأ أثناء الإلغاء", tone: "error" });
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-navy">إلغاء الإجازة</h2>
          <button 
            onClick={() => onOpenChange(false)} 
            disabled={isPending}
            className="text-muted hover:text-navy disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <form id="cancel-leave-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-navy mb-1">سبب الإلغاء *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isPending}
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:opacity-50 min-h-24 resize-none"
              required
            ></textarea>
          </div>
        </form>

        <div className="pt-4 flex justify-end gap-3 border-t border-border mt-6">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="rounded-md bg-surface px-4 py-2 text-sm font-medium text-navy hover:bg-surface/80 transition disabled:opacity-50"
          >
            تراجع
          </button>
          <button
            type="submit"
            form="cancel-leave-form"
            disabled={isPending}
            className="rounded-md bg-danger px-4 py-2 text-sm font-medium text-white hover:bg-danger/80 transition disabled:opacity-50"
          >
            {isPending ? "جاري الإلغاء..." : "تأكيد الإلغاء"}
          </button>
        </div>
      </div>
    </div>
  );
}
