"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CreateUserForm } from "@/components/dashboard/users/create-user-form";
import type { Dictionary } from "@/i18n/dictionaries";
import type { ActiveOrganizationOption } from "@/features/user-management/types";
import type { Locale } from "@/types/locale";
import type { ToastState } from "@/components/dashboard/users/user-toast";

type CreateUserDialogProps = {
  locale: Locale;
  dictionary: Dictionary["dashboard"]["userManagement"];
  organizations: ActiveOrganizationOption[];
  disabled: boolean;
  onToast: (toast: ToastState) => void;
};

export function CreateUserDialog({
  locale,
  dictionary,
  organizations,
  disabled,
  onToast,
}: CreateUserDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const firstInput = dialogRef.current?.querySelector<HTMLElement>(
      "input, select, button",
    );
    firstInput?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      triggerRef.current?.focus();
    }
  }, [open]);

  function handleSuccess() {
    onToast({ tone: "success", message: dictionary.success });
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen(true);
        }}
        className="w-full gap-2 sm:w-auto"
      >
        <PlusIcon />
        {dictionary.addUser}
      </Button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy/45 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setOpen(false);
            }
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-user-title"
            aria-describedby="create-user-description"
            className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-surface shadow-[0_24px_80px_rgba(16,35,63,0.22)]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h2
                  id="create-user-title"
                  className="text-xl font-bold text-navy"
                >
                  {dictionary.formTitle}
                </h2>
                <p
                  id="create-user-description"
                  className="mt-1 text-sm leading-6 text-muted"
                >
                  {dictionary.formDescription}
                </p>
              </div>
              <button
                type="button"
                aria-label={dictionary.closeDialog}
                onClick={() => setOpen(false)}
                className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <CloseIcon />
              </button>
            </div>
            <CreateUserForm
              locale={locale}
              dictionary={dictionary}
              organizations={organizations}
              onCancel={() => setOpen(false)}
              onSuccess={handleSuccess}
              onError={(message) => onToast({ tone: "error", message })}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path
        d="m6 6 12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
