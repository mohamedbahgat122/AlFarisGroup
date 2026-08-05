import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAccessibleOrganizationsForCurrentUser } from "@/features/organizations/queries";
import type { AccessibleOrganization } from "@/features/organizations/types";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale, type Locale } from "@/types/locale";

type OrganizationsRouteProps = {
  params: Promise<{
    locale: string;
  }>;
};

export async function generateMetadata({
  params,
}: OrganizationsRouteProps): Promise<Metadata> {
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

export default async function OrganizationsRoute({
  params,
}: OrganizationsRouteProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const dictionary = getDictionary(locale).dashboard.organizations;
  const result = await getAccessibleOrganizationsForCurrentUser();

  if (result.status === "unauthorized") {
    redirect(`/${locale}/login`);
  }

  if (result.status === "load_error") {
    return (
      <StatePanel
        title={dictionary.loadErrorTitle}
        description={dictionary.loadErrorDescription}
      />
    );
  }

  return (
    <div className="min-h-full bg-background px-5 py-6 sm:px-7">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy">{dictionary.title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          {dictionary.description}
        </p>
      </div>

      {result.organizations.length === 0 ? (
        <StatePanel
          title={dictionary.title}
          description={dictionary.noOrganizations}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {result.organizations.map((organization) => (
            <OrganizationCard
              key={organization.id}
              locale={locale}
              organization={organization}
              dictionary={dictionary}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OrganizationCard({
  locale,
  organization,
  dictionary,
}: {
  locale: Locale;
  organization: AccessibleOrganization;
  dictionary: ReturnType<typeof getDictionary>["dashboard"]["organizations"];
}) {
  return (
    <article className="flex min-h-44 flex-col justify-between border border-border bg-surface p-5 shadow-[0_16px_45px_rgba(16,35,63,0.06)]">
      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-navy">
              {organization.name}
            </h2>
          </div>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <BuildingIcon />
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <AccessBadge
            accessLevel={organization.accessLevel}
            isSystemOwnerAccess={organization.isSystemOwnerAccess}
            dictionary={dictionary}
          />
          {organization.isHomeOrganization ? (
            <span className="rounded-full border border-primary/20 bg-primary-soft px-3 py-1 text-xs font-bold text-primary">
              {dictionary.homeOrganization}
            </span>
          ) : null}
        </div>
      </div>
      <Link
        href={`/${locale}/dashboard/organizations/${organization.code}`}
        aria-label={`${dictionary.openOrganization}: ${organization.name}`}
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(11,108,251,0.22)] transition hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {dictionary.openOrganization}
      </Link>
    </article>
  );
}

function StatePanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="border border-border bg-surface px-6 py-10 text-center shadow-[0_16px_45px_rgba(16,35,63,0.06)]">
      <h2 className="text-lg font-bold text-navy">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
    </div>
  );
}

function AccessBadge({
  accessLevel,
  isSystemOwnerAccess,
  dictionary,
}: {
  accessLevel: AccessibleOrganization["accessLevel"];
  isSystemOwnerAccess: AccessibleOrganization["isSystemOwnerAccess"];
  dictionary: ReturnType<typeof getDictionary>["dashboard"]["organizations"];
}) {
  const managed = accessLevel === "manage";
  const label = isSystemOwnerAccess
    ? dictionary.accessLabels.full
    : dictionary.accessLabels[accessLevel];

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

function BuildingIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
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
