import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { EntitlementsPublishClient } from "@/components/dashboard/entitlements/entitlements-publish-client";
import { RealtimeRefresh } from "@/components/dashboard/realtime-refresh";
import { getEntitlementsPublishData } from "@/features/entitlements/queries";
import { getOrganizationPageAccessByCode } from "@/features/organizations/queries";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/types/locale";

type SendEntitlementsPageProps = {
  params: Promise<{
    locale: string;
    organizationCode: string;
  }>;
  searchParams: Promise<{
    month?: string;
    search?: string;
    status?: string;
  }>;
};

export async function generateMetadata({
  params,
}: SendEntitlementsPageProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    return {};
  }

  const dictionary = getDictionary(locale).dashboard.entitlements;

  return {
    title: dictionary.sendTitle,
    description: dictionary.sendDescription,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function SendEntitlementsPage({
  params,
  searchParams,
}: SendEntitlementsPageProps) {
  const { locale, organizationCode } = await params;
  const { month, search, status } = await searchParams;

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

  const result = await getEntitlementsPublishData({
    organization: access.organization,
    month,
    search,
    statusFilter: status,
  });

  if (result.status === "unauthorized") {
    return <AccessDenied locale={locale} />;
  }

  if (result.status === "load_error") {
    return (
      <div className="min-h-full bg-background px-5 py-6 sm:px-7">
        <section className="rounded-lg border border-danger/20 bg-danger/5 p-5 text-danger">
          تعذر تحميل بيانات إرسال المستحقات.
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
        channelName={`entitlement-statements-${access.organization.id}`}
        table="driver_entitlement_statements"
        filter={`organization_id=eq.${access.organization.id}`}
        toast="تم تحديث حالة نشر المستحقات."
      />
      <EntitlementsPublishClient locale={locale} data={result.data} />
    </>
  );
}
