import type { ReactNode } from "react";
import type { AppRequestsDictionary } from "@/features/app-requests/types";
import type { Locale } from "@/types/locale";

export type AppRequestSummaryCard = {
  label: string;
  value: number;
  tone?: "neutral" | "pending" | "success" | "danger" | "info" | "accent";
};

export function AppRequestSummaryCards({
  cards,
}: {
  cards: AppRequestSummaryCard[];
}) {
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <div key={card.label} className={`rounded-lg border px-4 py-3 ${getCardClassName(card.tone)}`}>
          <p className="text-xs font-bold leading-5">{card.label}</p>
          <p className="mt-1 text-2xl font-bold leading-none" dir="ltr">
            {card.value.toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}

export function AppRequestFiltersShell({
  children,
  actions,
}: {
  children: ReactNode;
  actions: ReactNode;
}) {
  return (
    <section className="mb-4 w-full rounded-lg border border-border bg-surface p-4 shadow-[0_16px_45px_rgba(16,35,63,0.04)]">
      <form className="w-full space-y-4">
        <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(320px,1fr)_repeat(4,minmax(150px,180px))]">
          {children}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2">{actions}</div>
      </form>
    </section>
  );
}

export function AppRequestFilterText({
  name,
  label,
  placeholder,
  defaultValue,
  wide = false,
}: {
  name: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  wide?: boolean;
}) {
  return (
    <label className={`min-w-0 space-y-2 ${wide ? "md:col-span-2 xl:col-span-1" : ""}`}>
      <span className="block text-sm font-semibold text-navy">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="min-h-12 w-full min-w-0 rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
      />
    </label>
  );
}

export function AppRequestFilterDate({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue?: string;
}) {
  return (
    <label className="min-w-0 space-y-2">
      <span className="block text-sm font-semibold text-navy">{label}</span>
      <input
        type="date"
        name={name}
        defaultValue={defaultValue}
        className="min-h-12 w-full min-w-0 rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
      />
    </label>
  );
}

export function AppRequestFilterSelect({
  name,
  label,
  defaultValue,
  children,
}: {
  name: string;
  label: string;
  defaultValue: string;
  children: ReactNode;
}) {
  return (
    <label className="min-w-0 space-y-2">
      <span className="block text-sm font-semibold text-navy">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="min-h-12 w-full min-w-0 rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
      >
        {children}
      </select>
    </label>
  );
}

export function AppRequestFilterActions({
  dictionary,
  resetHref,
}: {
  dictionary: AppRequestsDictionary;
  resetHref: string;
}) {
  return (
    <>
      <button className="inline-flex min-h-12 min-w-36 shrink-0 items-center justify-center whitespace-nowrap rounded-xl bg-primary px-5 text-sm font-bold text-white">
        {dictionary.filters.apply}
      </button>
      <a
        href={resetHref}
        className="inline-flex min-h-12 min-w-36 shrink-0 items-center justify-center whitespace-nowrap rounded-xl border border-border bg-surface px-5 text-sm font-bold text-navy transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary"
      >
        {dictionary.filters.reset}
      </a>
    </>
  );
}

export function AppRequestResultAndPagination({
  locale,
  dictionary,
  totalRows,
  pagination,
}: {
  locale: Locale;
  dictionary: AppRequestsDictionary;
  totalRows: number;
  pagination: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-muted">
      <span>
        {dictionary.filters.resultCount.replace(
          "{count}",
          totalRows.toLocaleString(locale),
        )}
      </span>
      {pagination}
    </div>
  );
}

export function AppRequestPagination({
  dictionary,
  page,
  totalPages,
  previousHref,
  nextHref,
}: {
  dictionary: AppRequestsDictionary;
  page: number;
  totalPages: number;
  previousHref?: string;
  nextHref?: string;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <a
        aria-disabled={!previousHref}
        href={previousHref}
        className={`inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-xs font-bold ${
          !previousHref ? "pointer-events-none opacity-50" : "hover:bg-primary-soft hover:text-primary"
        }`}
      >
        {dictionary.filters.previous}
      </a>
      <span className="text-xs font-bold text-muted" dir="ltr">
        {page} / {totalPages}
      </span>
      <a
        aria-disabled={!nextHref}
        href={nextHref}
        className={`inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-xs font-bold ${
          !nextHref ? "pointer-events-none opacity-50" : "hover:bg-primary-soft hover:text-primary"
        }`}
      >
        {dictionary.filters.next}
      </a>
    </div>
  );
}

function getCardClassName(tone: AppRequestSummaryCard["tone"] = "neutral") {
  switch (tone) {
    case "pending":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "danger":
      return "border-red-200 bg-red-50 text-red-700";
    case "info":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "accent":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "neutral":
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}
