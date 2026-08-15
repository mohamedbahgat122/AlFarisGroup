import { notFound, redirect } from "next/navigation";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { FleetManagementClient } from "@/components/dashboard/fleet/fleet-management-client";
import { getBusinessDateString } from "@/features/drivers/expiry";
import { getFleetPageData } from "@/features/fleet/queries";
import type { FleetVehicleCategory } from "@/features/fleet/types";
import { getOrganizationPageAccessByCode } from "@/features/organizations/queries";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/types/locale";

export async function FleetPage({
  locale,
  organizationCode,
  category,
  includeArchived,
}: {
  locale: Locale;
  organizationCode: string;
  category: FleetVehicleCategory;
  includeArchived: boolean;
}) {
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

  if (
    (category === "car" && !organization.navigation.fleetCars) ||
    (category === "motorcycle" && !organization.navigation.fleetMotorcycles)
  ) {
    return <AccessDenied locale={locale} />;
  }

  const result = await getFleetPageData({
    organizationId: organization.id,
    category,
    includeArchived,
  });

  if (result.status === "unauthorized") {
    return <AccessDenied locale={locale} />;
  }

  const dictionary = getDictionary(locale).dashboard.fleet;

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

  return (
    <FleetManagementClient
      locale={locale}
      dictionary={dictionary}
      organization={organization}
      category={category}
      vehicles={result.vehicles}
      drivers={result.drivers}
      today={getBusinessDateString()}
      includeArchived={includeArchived}
    />
  );
}
