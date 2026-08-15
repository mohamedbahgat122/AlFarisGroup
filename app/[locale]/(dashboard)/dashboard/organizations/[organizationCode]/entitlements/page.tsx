import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { EntitlementsManagementClient } from "@/components/dashboard/entitlements/entitlements-management-client";
import { RealtimeRefresh } from "@/components/dashboard/realtime-refresh";
import { getEntitlementsManagementData } from "@/features/entitlements/queries";
import { getOrganizationPageAccessByCode } from "@/features/organizations/queries";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/types/locale";

type EntitlementsPageProps = {
  params: Promise<{
    locale: string;
    organizationCode: string;
  }>;
  searchParams: Promise<{
    month?: string;
  }>;
};

export async function generateMetadata({
  params,
}: EntitlementsPageProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    return {};
  }

  const dictionary = getDictionary(locale).dashboard.entitlements;

  return {
    title: dictionary.metadataTitle,
    description: dictionary.metadataDescription,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function EntitlementsPage({
  params,
  searchParams,
}: EntitlementsPageProps) {
  const { locale, organizationCode } = await params;
  const { month } = await searchParams;

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

  if (access.status !== "success" || !access.organization.navigation.entitlements) {
    return <AccessDenied locale={locale} />;
  }

  const result = await getEntitlementsManagementData({
    organization: access.organization,
    month,
  });

  if (result.status === "unauthorized") {
    return <AccessDenied locale={locale} />;
  }

  if (result.status === "load_error") {
    return (
      <div className="min-h-full bg-background px-5 py-6 sm:px-7">
        <section className="rounded-lg border border-danger/20 bg-danger/5 p-5 text-danger">
          تعذر تحميل المستحقات.
        </section>
      </div>
    );
  }

  if (result.status !== "success") {
    return <AccessDenied locale={locale} />;
  }

  return (
    <>
      <RealtimeRefresh
        channelName={`entitlements-${access.organization.id}`}
        table="driver_entitlement_transactions"
        filter={`organization_id=eq.${access.organization.id}`}
        toast="تم تحديث المستحقات."
      />
      <EntitlementsManagementClient locale={locale} data={result.data} />
    </>
  );
}
