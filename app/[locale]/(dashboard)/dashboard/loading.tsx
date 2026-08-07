/**
 * Dashboard page loading skeleton.
 *
 * Next.js renders this component immediately while the page Server Component
 * is fetching data. It fills the `<main>` slot inside DashboardShell so the
 * sidebar and header remain visible and interactive during navigation.
 *
 * Design mirrors the standard page layout: a top title/subtitle block followed
 * by a grid of placeholder cards — generic enough to match any section.
 */
export default function DashboardLoading() {
  return (
    <div className="min-h-full animate-pulse bg-background px-5 py-6 sm:px-7">
      {/* Page header skeleton */}
      <div className="mb-6">
        <div className="h-7 w-48 rounded-lg bg-border" />
        <div className="mt-2 h-4 w-80 rounded-lg bg-border opacity-60" />
      </div>

      {/* Toolbar / filter row skeleton */}
      <div className="mb-5 flex flex-wrap gap-2">
        <div className="h-10 w-32 rounded-xl bg-border" />
        <div className="h-10 w-32 rounded-xl bg-border opacity-70" />
        <div className="h-10 w-24 rounded-xl bg-border opacity-50" />
      </div>

      {/* Content card skeleton */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[0_16px_45px_rgba(16,35,63,0.04)]">
        {/* Card header */}
        <div className="border-b border-border px-5 py-4 sm:px-6">
          <div className="h-5 w-40 rounded-md bg-border" />
        </div>

        {/* Table rows */}
        <div className="divide-y divide-border">
          {Array.from({ length: 7 }).map((_, i) => (
            <SkeletonRow key={i} dimmed={i % 2 === 1} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SkeletonRow({ dimmed }: { dimmed: boolean }) {
  return (
    <div
      className={`flex items-center gap-4 px-5 py-4 sm:px-6 ${dimmed ? "opacity-60" : ""}`}
    >
      {/* Avatar / icon placeholder */}
      <div className="size-9 shrink-0 rounded-lg bg-border" />

      {/* Primary text */}
      <div className="flex-1 space-y-2">
        <div className="h-4 w-36 rounded-md bg-border" />
        <div className="h-3 w-24 rounded-md bg-border opacity-70" />
      </div>

      {/* Badge / status placeholder */}
      <div className="h-6 w-20 rounded-full bg-border opacity-60" />

      {/* Action button placeholder */}
      <div className="h-8 w-16 rounded-lg bg-border opacity-50" />
    </div>
  );
}
