import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAccessibleOrganizationByCode } from "@/features/organizations/queries";
import type { AccessibleOrganization } from "@/features/organizations/types";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/types/locale";

type OrganizationRouteProps = {
  params: Promise<{
    locale: string;
    organizationCode: string;
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
}: OrganizationRouteProps) {
  const { locale, organizationCode } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const dictionary = getDictionary(locale).dashboard.organizations;
  const organization = await getAccessibleOrganizationByCode(organizationCode);

  if (!organization) {
    notFound();
  }

  if (!organization.navigation.organizationHome) {
    notFound();
  }

  return (
    <div className="min-h-full bg-background px-5 py-6 sm:px-7">
      <div className="max-w-3xl">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <AccessBadge organization={organization} dictionary={dictionary} />
          {organization.isHomeOrganization ? (
            <span className="rounded-full border border-primary/20 bg-primary-soft px-3 py-1 text-xs font-bold text-primary">
              {dictionary.homeOrganization}
            </span>
          ) : null}
        </div>
        <h1 className="text-2xl font-bold text-navy">{organization.name}</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          {dictionary.landingDescription}
        </p>
      </div>

      <div className="mt-7 border border-border bg-surface px-6 py-10 text-center shadow-[0_16px_45px_rgba(16,35,63,0.06)]">
        <p className="text-sm font-medium leading-6 text-muted">
          {dictionary.sectionsComingSoon}
        </p>
      </div>
    </div>
  );
}

function AccessBadge({
  organization,
  dictionary,
}: {
  organization: AccessibleOrganization;
  dictionary: ReturnType<typeof getDictionary>["dashboard"]["organizations"];
}) {
  const managed = organization.accessLevel === "manage";
  const label = organization.isSystemOwnerAccess
    ? dictionary.accessLabels.full
    : dictionary.accessLabels[organization.accessLevel];

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-bold ${
        managed
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-border bg-background text-muted"
      }`}
    >
      {label}
    </span>
  );
}
