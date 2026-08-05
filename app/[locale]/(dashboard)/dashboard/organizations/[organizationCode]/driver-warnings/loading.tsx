export default function DriverWarningsLoading() {
  return (
    <div className="min-h-full bg-background px-4 py-6 sm:px-6 xl:px-8">
      <div className="flex w-full max-w-none flex-col gap-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="h-4 w-40 rounded-lg bg-border" />
            <div className="h-8 w-72 rounded-lg bg-border" />
            <div className="h-4 w-full max-w-2xl rounded-lg bg-border" />
          </div>
          <div className="h-12 w-44 rounded-xl bg-border" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="flex min-h-28 items-center justify-between rounded-lg border border-border bg-surface px-5 py-4"
            >
              <div className="space-y-3">
                <div className="h-4 w-28 rounded-lg bg-border" />
                <div className="h-8 w-14 rounded-lg bg-border" />
              </div>
              <div className="size-11 rounded-lg bg-border" />
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex flex-wrap gap-3">
            <div className="h-11 w-44 rounded-lg bg-border" />
            <div className="h-11 w-44 rounded-lg bg-border" />
            <div className="h-11 min-w-64 flex-1 rounded-lg bg-border" />
            <div className="h-11 w-28 rounded-lg bg-border" />
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="hidden lg:block">
            <div className="grid grid-cols-9 gap-4 bg-primary-soft/45 px-4 py-3">
              {Array.from({ length: 9 }).map((_, index) => (
                <div key={index} className="h-3 rounded-lg bg-border" />
              ))}
            </div>
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="grid grid-cols-9 gap-4 border-t border-border px-4 py-4">
                {Array.from({ length: 9 }).map((__, cellIndex) => (
                  <div key={cellIndex} className="h-4 rounded-lg bg-border" />
                ))}
              </div>
            ))}
          </div>
          <div className="grid gap-3 p-3 lg:hidden">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="space-y-3 rounded-lg border border-border bg-white p-4">
                <div className="h-4 w-40 rounded-lg bg-border" />
                <div className="h-4 w-full rounded-lg bg-border" />
                <div className="h-4 w-2/3 rounded-lg bg-border" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
