import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { RealtimeRefresh } from "@/components/dashboard/realtime-refresh";
import { OrderPeriodManagementClient } from "@/components/dashboard/order-periods/order-period-management-client";
import { getOrganizationPageAccessByCode } from "@/features/organizations/queries";
import { getOrderPeriodManagementData } from "@/features/order-periods/queries";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/types/locale";

type RouteProps = { params: Promise<{ locale: string; organizationCode: string }> };

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dictionary = getDictionary(locale).dashboard.orderPeriods;
  return { title: dictionary.title, description: dictionary.description, robots: { index: false, follow: false } };
}

export default async function OrderPeriodManagementPage({ params }: RouteProps) {
  const { locale, organizationCode } = await params;
  if (!isLocale(locale)) notFound();
  const access = await getOrganizationPageAccessByCode(organizationCode);
  if (access.status === "unauthenticated") redirect(`/${locale}/login`);
  if (access.status === "not_found") notFound();
  if (access.status !== "success") return <AccessDenied locale={locale} />;

  const organization = access.organization;
  if (!organization.navigation.orderPeriods) return <AccessDenied locale={locale} />;
  const dictionary = getDictionary(locale).dashboard.orderPeriods;
  const result = await getOrderPeriodManagementData({ organizationId: organization.id });
  if (result.status === "unauthorized") return <AccessDenied locale={locale} />;
  if (result.status === "load_error") {
    return <div className="min-h-full bg-background px-5 py-6 sm:px-7"><div className="rounded-lg border border-border bg-surface px-6 py-10 text-center shadow-sm"><h1 className="text-lg font-bold text-navy">{dictionary.title}</h1><p className="mt-2 text-sm leading-6 text-muted">{dictionary.loadError}</p></div></div>;
  }
  if (!result.weeks) return <AccessDenied locale={locale} />;

  return (
    <>
      <RealtimeRefresh channelName={`dashboard-order-period-templates-${organization.id}`} table="organization_order_period_templates" filter={`organization_id=eq.${organization.id}`} toast={dictionary.description} />
      <RealtimeRefresh channelName={`dashboard-order-period-assignments-${organization.id}`} table="organization_order_period_assignments" filter={`organization_id=eq.${organization.id}`} toast={dictionary.description} />
      <OrderPeriodManagementClient
        locale={locale}
        organizationCode={organization.code}
        dictionary={dictionary}
        templates={result.templates}
        drivers={result.drivers}
        weeks={result.weeks}
        permissions={result.permissions}
        orderShiftChangeSettings={result.orderShiftChangeSettings}
        orderShiftChangeRequests={result.orderShiftChangeRequests}
      />
    </>
  );
}
