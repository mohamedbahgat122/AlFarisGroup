import type {
  AppRequestsDictionary,
  OilMaintenanceStatus,
  OilMaintenanceTrackingRow,
} from "@/features/app-requests/types";
import type { Locale } from "@/types/locale";

export function OilMaintenanceTrackingTable({
  locale,
  dictionary,
  rows,
}: {
  locale: Locale;
  dictionary: AppRequestsDictionary;
  rows: OilMaintenanceTrackingRow[];
}) {
  return (
    <div className="overflow-x-auto border border-border bg-surface">
      <table className="min-w-[1500px] table-fixed border-collapse text-start">
        <thead className="bg-background text-xs font-bold uppercase text-muted">
          <tr>
            <Header className="w-72">{dictionary.driver}</Header>
            <Header className="w-40">{dictionary.driverId}</Header>
            <Header className="w-52">{dictionary.vehicle}</Header>
            <Header className="w-36">{dictionary.plate}</Header>
            <Header className="w-40">{dictionary.columns.lastOilChangeOdometer}</Header>
            <Header className="w-36">{dictionary.columns.oilIntervalKm}</Header>
            <Header className="w-40">{dictionary.columns.nextOilChangeAt}</Header>
            <Header className="w-40">{dictionary.columns.latestShiftOdometer}</Header>
            <Header className="w-40">{dictionary.columns.drivenSinceOilChange}</Header>
            <Header className="w-36">{dictionary.columns.remainingKm}</Header>
            <Header className="w-40">{dictionary.columns.totalDistance}</Header>
            <Header className="w-36">{dictionary.status}</Header>
            <Header className="w-56">{dictionary.columns.latestOilRequest}</Header>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.driverId}>
              <Cell strong>
                <div className="min-w-0">
                  <div className="whitespace-normal leading-5" title={row.driverName}>
                    {row.driverName}
                  </div>
                  {row.driverIdentifier ? (
                    <div className="mt-0.5 text-xs font-semibold text-muted" dir="ltr">
                      {row.driverIdentifier}
                    </div>
                  ) : null}
                </div>
              </Cell>
              <Cell nowrap>{row.driverIdentifier ?? dictionary.notAvailable}</Cell>
              <Cell>{formatVehicleLabel(row.vehicleLabel, dictionary)}</Cell>
              <Cell nowrap>{row.vehiclePlate ?? dictionary.notAvailable}</Cell>
              <Cell nowrap>{formatKm(row.lastOilChangeOdometer, locale, dictionary)}</Cell>
              <Cell nowrap>{formatKm(row.oilIntervalKm, locale, dictionary)}</Cell>
              <Cell nowrap>{formatKm(row.nextOilChangeAt, locale, dictionary)}</Cell>
              <Cell nowrap>{formatKm(row.latestOdometer, locale, dictionary)}</Cell>
              <Cell nowrap>{formatKm(row.drivenSinceOilChange, locale, dictionary)}</Cell>
              <Cell nowrap>{formatSignedKm(row.remainingKm, locale, dictionary)}</Cell>
              <Cell nowrap>{formatKm(row.totalDistanceKm, locale, dictionary)}</Cell>
              <Cell nowrap>
                <OilStatusBadge status={row.oilStatus} dictionary={dictionary} />
              </Cell>
              <Cell>
                {row.latestRequest ? (
                  <div className="space-y-1 text-xs font-semibold leading-5">
                    <div>
                      <span className="font-bold text-navy">
                        {dictionary.statuses[row.latestRequest.status]}
                      </span>
                    </div>
                    <div>{formatDateTime(row.latestRequest.submittedAt, locale)}</div>
                    <div>
                      {dictionary.columns.odometerReading}:{" "}
                      {formatKm(
                        asNumber(row.latestRequest.detail.current_odometer_reading),
                        locale,
                        dictionary,
                      )}
                    </div>
                  </div>
                ) : (
                  dictionary.notAvailable
                )}
              </Cell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Header({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <th className={`px-4 py-3 text-start ${className}`}>{children}</th>;
}

function Cell({
  children,
  strong,
  nowrap,
}: {
  children: React.ReactNode;
  strong?: boolean;
  nowrap?: boolean;
}) {
  return (
    <td
      className={`px-4 py-3 text-sm ${strong ? "font-bold text-navy" : "text-muted"} ${nowrap ? "whitespace-nowrap" : ""}`}
    >
      {children}
    </td>
  );
}

function OilStatusBadge({
  status,
  dictionary,
}: {
  status: OilMaintenanceStatus;
  dictionary: AppRequestsDictionary;
}) {
  const className = {
    ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
    due_soon: "border-amber-200 bg-amber-50 text-amber-700",
    due: "border-red-200 bg-red-50 text-red-700",
    incomplete: "border-slate-200 bg-slate-50 text-slate-700",
    no_vehicle: "border-slate-200 bg-slate-50 text-slate-700",
  }[status];

  return (
    <span className={`rounded-full border px-2 py-1 text-xs font-bold ${className}`}>
      {dictionary.oilStatuses[status]}
    </span>
  );
}

function formatVehicleLabel(
  value: string | null,
  dictionary: AppRequestsDictionary,
) {
  if (!value) return dictionary.notAvailable;

  return dictionary.vehicleTypes[value as keyof typeof dictionary.vehicleTypes] ?? value;
}

function formatKm(
  value: number | null,
  locale: Locale,
  dictionary: AppRequestsDictionary,
) {
  return value === null
    ? dictionary.notAvailable
    : value.toLocaleString(locale);
}

function formatSignedKm(
  value: number | null,
  locale: Locale,
  dictionary: AppRequestsDictionary,
) {
  if (value === null) return dictionary.notAvailable;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString(locale)}`;
}

function formatDateTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
  }).format(new Date(value));
}

function asNumber(value: unknown) {
  return typeof value === "number" ? value : null;
}
