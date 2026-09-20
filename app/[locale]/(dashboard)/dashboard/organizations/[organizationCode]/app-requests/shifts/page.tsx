import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { getOrganizationPageAccessByCode } from "@/features/organizations/queries";
import { getShiftChangeRequestsPage } from "@/features/shift-requests/queries";
import { ShiftRequestsTable } from "@/components/dashboard/app-requests/shift-requests-table";
import { isLocale } from "@/types/locale";
import { getDictionary } from "@/i18n/dictionaries";

type RouteProps = { params: Promise<{ locale: string; organizationCode: string }> };

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dictionary = getDictionary(locale).dashboard.appRequests.shiftRequests;
  return { title: dictionary.title, description: dictionary.description, robots: { index: false, follow: false } };
}

export default async function ShiftRequestsRoute({ params }: RouteProps) {
  const { locale, organizationCode } = await params;
  if (!isLocale(locale)) notFound();
  const dictionary = getDictionary(locale).dashboard.appRequests.shiftRequests;
  const access = await getOrganizationPageAccessByCode(organizationCode);
  if (access.status === "unauthenticated") redirect(`/${locale}/login`);
  if (access.status === "not_found") notFound();
  if (access.status !== "success") return <AccessDenied locale={locale} />;
  const organization = access.organization;
  if (!organization.navigation.appRequests) return <AccessDenied locale={locale} />;
  const requests = await getShiftChangeRequestsPage(organization.id);
  return (
    <div className="min-h-full bg-background">
      <div className="border-b border-border bg-surface px-5 py-6 sm:px-7">
        <h1 className="text-2xl font-bold text-navy">{dictionary.title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">{dictionary.description}</p>
      </div>
      <div className="px-5 py-6 sm:px-7">
        <ShiftRequestsTable rows={requests} canReview={organization.permissionKeys.includes("app_requests.review")} dictionary={dictionary} />
      </div>
    </div>
  );
}
