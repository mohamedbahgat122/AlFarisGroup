import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { OrganizationDashboard } from "@/components/dashboard/home/organization-dashboard";
import { getOrganizationDashboardData } from "@/features/dashboard/queries";
import { getOrganizationPageAccessByCode } from "@/features/organizations/queries";
import type { AccessibleOrganization } from "@/features/organizations/types";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/types/locale";

type OrganizationRouteProps = {
  params: Promise<{
    locale: string;
    organizationCode: string;
  }>;
  searchParams?: Promise<{
    range?: string;
  }>;
};

export async function generateMetadata({
  params,
}: OrganizationRouteProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    return {};
  }

  const dictionary = getDictionary(locale).dashboard.organizations;

  return {
    title: dictionary.metadataTitle,
    description: dictionary.metadataDescription,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function OrganizationRoute({
  params,
  searchParams,
}: OrganizationRouteProps) {
  const { locale, organizationCode } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const dictionary = getDictionary(locale).dashboard.organizations;
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

  if (!organization.navigation.organizationHome) {
    return <AccessDenied locale={locale} />;
  }

  const filters = await searchParams;
  const dashboardData = await getOrganizationDashboardData({
    locale,
    organization,
    range: filters?.range,
  });

  if (dashboardData.status !== "success") {
    return <AccessDenied locale={locale} />;
  }

  return (
    <OrganizationDashboard
      data={dashboardData}
      locale={locale}
      accessLabel={getAccessLabel(organization, dictionary)}
      dictionary={getDictionary(locale).dashboard.organizationDashboard}
    />
  );
}

function getAccessLabel(
  organization: AccessibleOrganization,
  dictionary: ReturnType<typeof getDictionary>["dashboard"]["organizations"],
) {
  return organization.isSystemOwnerAccess
    ? dictionary.accessLabels.full
    : dictionary.accessLabels[organization.accessLevel];
}
