import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { DriverWarningsPageClient } from "@/components/dashboard/driver-warnings/driver-warnings-page-client";
import { RealtimeRefresh } from "@/components/dashboard/realtime-refresh";
import {
  getDriverWarningsForOrganization,
  type DriverWarningsFilters,
} from "@/features/driver-warnings/queries";
import type {
  DriverWarningSeverity,
  DriverWarningStatus,
} from "@/features/driver-warnings/types";
import { getOrganizationPageAccessByCode } from "@/features/organizations/queries";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/types/locale";

type DriverWarningsRouteProps = {
  params: Promise<{
    locale: string;
    organizationCode: string;
  }>;
  searchParams?: Promise<DriverWarningsFilters>;
};

export async function generateMetadata({
  params,
}: DriverWarningsRouteProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    return {};
  }

  const dictionary = getDictionary(locale).dashboard.driverWarnings;

  return {
    title: dictionary.metadataTitle,
    description: dictionary.metadataDescription,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function DriverWarningsRoute({
  params,
  searchParams,
}: DriverWarningsRouteProps) {
  const { locale, organizationCode } = await params;
  const filters = (await searchParams) ?? {};

  if (!isLocale(locale)) {
    notFound();
  }

  const access = await getOrganizationPageAccessByCode(organizationCode);

  if (access.status === "unauthenticated") {
    redirect(`/${locale}/login`);
  }

  if (access.status === "not_found") {
    notFound();
  }

  if (access.status !== "success") {
    return <AccessDenied locale={locale} />;
  }

  const organization = access.organization;

  if (!organization.navigation.driverWarnings) {
    return <AccessDenied locale={locale} />;
  }

  const dictionary = getDictionary(locale).dashboard.driverWarnings;
  const result = await getDriverWarningsForOrganization({
    organizationId: organization.id,
    filters,
  });

  if (result.status === "unauthorized") {
    return <AccessDenied locale={locale} />;
  }

  if (result.status === "load_error") {
    return (
      <div className="min-h-full bg-background px-5 py-6 sm:px-7">
        <div className="border border-border bg-surface px-6 py-10 text-center shadow-[0_16px_45px_rgba(16,35,63,0.06)]">
          <h1 className="text-lg font-bold text-navy">
            {dictionary.loadErrorTitle}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            {dictionary.loadErrorDescription}
          </p>
        </div>
      </div>
    );
  }

  const canIssue = organization.permissionKeys.includes("driver_warnings.issue");
  const canRevoke = organization.permissionKeys.includes("driver_warnings.revoke");
  const activeCount = result.warnings.filter((warning) => warning.status === "active").length;
  const unseenCount = result.warnings.filter((warning) => !warning.driverSeenAt).length;
  const highCount = result.warnings.filter((warning) => warning.severity === "high").length;
  const revokedCount = result.warnings.filter((warning) => warning.status === "revoked").length;

  return (
    <div className="min-h-full bg-background px-4 py-6 sm:px-6 xl:px-8">
      <RealtimeRefresh
        channelName={`dashboard-driver-warnings-${organization.id}`}
        table="driver_warnings"
        filter={`organization_id=eq.${organization.id}`}
        toast={dictionary.realtime.updated}
      />

      <DriverWarningsPageClient
        locale={locale}
        organization={{
          id: organization.id,
          code: organization.code,
          name: organization.name,
        }}
        dictionary={dictionary}
        warnings={result.warnings}
        drivers={result.drivers}
        filters={{
          status: isWarningStatus(filters.status) ? filters.status : "",
          severity: isWarningSeverity(filters.severity) ? filters.severity : "",
          driverId: filters.driverId ?? "",
        }}
        summary={{
          active: activeCount,
          unseen: unseenCount,
          high: highCount,
          revoked: revokedCount,
        }}
        canIssue={canIssue}
        canRevoke={canRevoke}
      />
    </div>
  );
}

function isWarningStatus(value: string | undefined): value is DriverWarningStatus {
  return value === "active" || value === "revoked";
}

function isWarningSeverity(value: string | undefined): value is DriverWarningSeverity {
  return value === "low" || value === "medium" || value === "high";
}
