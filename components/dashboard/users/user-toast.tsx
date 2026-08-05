"use client";

import { useEffect } from "react";
import type { Locale } from "@/types/locale";

export type ToastState = {
  tone: "success" | "error";
  message: string;
};

type UserToastProps = {
  locale: Locale;
  toast: ToastState | null;
  onDismiss: () => void;
};

export function UserToast({ locale, toast, onDismiss }: UserToastProps) {
  useEffect(() => {
    if (!toast || toast.tone !== "success") {
      return;
    }

    const timeout = window.setTimeout(onDismiss, 4500);

    return () => window.clearTimeout(timeout);
  }, [onDismiss, toast]);

  if (!toast) {
    return null;
  }

  return (
    <div
      className={`fixed top-20 z-[70] max-w-sm px-4 ${
        locale === "ar" ? "left-4" : "right-4"
      }`}
    >
      <div
        role={toast.tone === "success" ? "status" : "alert"}
        aria-live={toast.tone === "success" ? "polite" : "assertive"}
        className={`flex items-start gap-3 rounded-xl border bg-surface p-4 shadow-[0_18px_45px_rgba(16,35,63,0.18)] ${
          toast.tone === "success" ? "border-emerald-200" : "border-danger/30"
        }`}
      >
        <div
          className={`mt-1 size-2 rounded-full ${
            toast.tone === "success" ? "bg-emerald-600" : "bg-danger"
          }`}
        />
        <p className="min-w-0 flex-1 text-sm font-semibold text-navy">
          {toast.message}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </div>
  );
}
