import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { DriversManagementClient } from "@/components/dashboard/drivers/drivers-management-client";
import { getBusinessDateString } from "@/features/drivers/expiry";
import { getDriversForOrganization } from "@/features/drivers/queries";
import type { DriverStatus } from "@/features/drivers/types";
import { getOrganizationPageAccessByCode } from "@/features/organizations/queries";
import { getDictionary } from "@/i18n/dictionaries";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { isLocale } from "@/types/locale";

type DriversRouteProps = {
  params: Promise<{
    locale: string;
    organizationCode: string;
  }>;
  searchParams?: Promise<{
    driver?: string;
    search?: string;
    status?: string;
    nationality?: string;
    sponsorship?: string;
    archived?: string;
    page?: string;
  }>;
};

export async function generateMetadata({
  params,
}: DriversRouteProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    return {};
  }

  const dictionary = getDictionary(locale).dashboard.drivers;

  return {
    title: dictionary.metadataTitle,
    description: dictionary.metadataDescription,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function DriversRoute({
  params,
  searchParams,
}: DriversRouteProps) {
  const { locale, organizationCode } = await params;
  const query = await searchParams;

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

  if (access.status === "forbidden") {
    return <AccessDenied locale={locale} />;
  }

  if (access.status !== "success") {
    return <AccessDenied locale={locale} />;
  }

  const organization = access.organization;

  if (!organization.navigation.drivers) {
    return <AccessDenied locale={locale} />;
  }

  const dictionary = getDictionary(locale).dashboard.drivers;
  const driversResult = await getDriversForOrganization(
    organization.id,
    organization.name,
    {
      search: query?.search,
      status: query?.status as DriverStatus,
      nationality: query?.nationality,
      sponsorship: query?.sponsorship,
      archived: query?.archived,
      page: query?.page ? parseInt(query.page, 10) : 1,
      pageSize: 20,
    }
  );

  if (driversResult.status === "unauthorized") {
    return <AccessDenied locale={locale} />;
  }

  if (driversResult.status === "load_error") {
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

  const admin = await getAuthenticatedAdmin();
  let fleetVehicles: { id: string; plateNumber: string; vehicleType: string; category: "car" | "motorcycle" }[] = [];
  if (admin.status === "authorized") {
    const { data: fleetData } = await admin.supabase
      .from("fleet_vehicles")
      .select("id, plate_number, vehicle_type, vehicle_category")
      .eq("assigned_organization_id", organization.id)
      .is("archived_at", null)
      .order("plate_number");

    if (fleetData) {
      fleetVehicles = fleetData.map(v => ({
        id: v.id,
        plateNumber: v.plate_number,
        vehicleType: v.vehicle_type,
        category: v.vehicle_category as "car" | "motorcycle"
      }));
    }
  }

  return (
    <DriversManagementClient
      locale={locale}
      dictionary={dictionary}
      organization={organization}
      drivers={driversResult.drivers}
      pagination={driversResult.status === "success" ? driversResult.pagination : undefined}
      summary={driversResult.status === "success" ? driversResult.summary : undefined}
      today={getBusinessDateString()}
      initialDriverId={query?.driver ?? null}
      fleetVehicles={fleetVehicles}
    />
  );
}
