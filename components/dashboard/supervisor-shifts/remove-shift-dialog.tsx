"use client";

import React, { useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeSupervisorFromShiftAction } from "@/features/supervisor-shifts/actions";
import type { ToastState } from "@/components/dashboard/users/user-toast";
import type { Dictionary } from "@/i18n/dictionaries";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supervisor: any | null;
  currentShiftName?: string | null;
  onToast: (toast: ToastState) => void;
  dictionary?: Dictionary["dashboard"]["supervisorShifts"];
};

export function RemoveShiftDialog({
  open,
  onOpenChange,
  supervisor,
  currentShiftName,
  onToast,
  dictionary,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (!open || !supervisor) return null;
  const text = dictionary!.dialogs;

  const handleConfirm = () => {
    startTransition(async () => {
      try {
        await removeSupervisorFromShiftAction(supervisor.id);
        onToast({ message: text.success, tone: "success" });
        onOpenChange(false);
        router.refresh();
      } catch (err: any) {
        console.error("Remove supervisor shift error:", err);
        onToast({
          message: err.message || text.unexpectedError,
          tone: "error",
        });
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-navy">{text.removeTitle}</h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="text-muted hover:text-navy disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <div className="space-y-4 text-sm text-navy">
          <p>{text.confirmRemove}</p>

          <div className="rounded-lg border border-border bg-surface p-4">
            <p>
              <span className="font-semibold">{dictionary!.supervisor}:</span> {supervisor.full_name}
            </p>
            <p className="mt-2">
              <span className="font-semibold">{text.currentShift}:</span>{" "}
              {currentShiftName || text.noActiveShift}
            </p>
          </div>

          <p className="text-muted">
            {text.removeDescription}
          </p>
        </div>

        <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="rounded-md bg-surface px-4 py-2 text-sm font-medium text-navy transition hover:bg-surface/80 disabled:opacity-50"
          >
            {text.cancel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            className="rounded-md bg-danger px-4 py-2 text-sm font-medium text-white transition hover:bg-danger/80 disabled:opacity-50"
          >
            {isPending ? text.processing : text.remove}
          </button>
        </div>
      </div>
    </div>
  );
}
