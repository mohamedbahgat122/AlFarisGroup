"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Dictionary } from "@/i18n/dictionaries";
import type { AccessibleOrganization } from "@/features/organizations/types";
import type { Locale } from "@/types/locale";

type OrganizationSwitcherProps = {
  locale: Locale;
  dictionary: Dictionary["dashboard"]["organizations"];
  organizations: AccessibleOrganization[];
};

export function OrganizationSwitcher({
  locale,
  dictionary,
  organizations,
}: OrganizationSwitcherProps) {
  const pathname = usePathname();
  const router = useRouter();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const currentCode = getCurrentOrganizationCode(pathname, locale);
  const currentOrganization = organizations.find(
    (organization) => organization.code === currentCode,
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target;

      if (
        target instanceof Node &&
        !buttonRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open]);

  if (!currentOrganization) {
    return null;
  }

  return (
    <div className="relative min-w-0">
      <button
        ref={buttonRef}
        type="button"
        aria-label={dictionary.switchOrganization}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-11 max-w-[280px] items-center gap-3 rounded-xl border border-border bg-surface px-3 text-start shadow-sm transition hover:border-primary/35 hover:bg-primary-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:max-w-[360px]"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <BuildingIcon />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-navy">
            {currentOrganization.name}
          </span>
          <span className="block truncate text-xs font-medium text-muted">
            {currentOrganization.isHomeOrganization
              ? `${dictionary.homeOrganization} - `
              : ""}
            {currentOrganization.isSystemOwnerAccess
              ? dictionary.accessLabels.full
              : dictionary.accessLabels[currentOrganization.accessLevel]}
          </span>
        </span>
        <ChevronIcon open={open} />
      </button>

      {open ? (
        <div
          ref={panelRef}
          className="absolute z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-surface p-2 shadow-[0_22px_70px_rgba(16,35,63,0.16)] ltr:left-0 rtl:right-0"
        >
          <p className="px-3 py-2 text-xs font-bold uppercase text-muted">
            {dictionary.currentOrganization}
          </p>
          <div className="space-y-1">
            {organizations.map((organization) => {
              const selected = organization.code === currentOrganization.code;

              return (
                <button
                  key={organization.id}
                  type="button"
                  aria-current={selected ? "page" : undefined}
                  onClick={() => {
                    setOpen(false);
                    router.push(
                      `/${locale}/dashboard/organizations/${organization.code}`,
                    );
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                    selected
                      ? "bg-primary-soft text-primary"
                      : "text-navy hover:bg-primary-soft"
                  }`}
                >
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                      selected
                        ? "bg-primary text-white"
                        : "bg-background text-muted"
                    }`}
                  >
                    <BuildingIcon />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {organization.name}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {organization.isHomeOrganization
                        ? `${dictionary.homeOrganization} - `
                        : ""}
                      {organization.isSystemOwnerAccess
                        ? dictionary.accessLabels.full
                        : dictionary.accessLabels[organization.accessLevel]}
                    </span>
                  </span>
                  {selected ? (
                    <span className="ms-auto flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                      <span className="sr-only">
                        {dictionary.currentOrganization}
                      </span>
                      <CheckIcon />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function getCurrentOrganizationCode(pathname: string, locale: Locale) {
  const prefix = `/${locale}/dashboard/organizations/`;

  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const code = pathname.slice(prefix.length).split("/")[0];

  return code || null;
}

function BuildingIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none">
      <path
        d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h8A1.5 1.5 0 0 1 15 5.5V21M8 8h3M8 12h3M8 16h3M15 10h3.5A1.5 1.5 0 0 1 20 11.5V21M18 14h-1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none">
      <path
        d="m5 12.5 4.2 4.2L19 7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`size-4 shrink-0 text-muted transition ${
        open ? "rotate-180" : ""
      }`}
      fill="none"
    >
      <path
        d="m6 9 6 6 6-6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
