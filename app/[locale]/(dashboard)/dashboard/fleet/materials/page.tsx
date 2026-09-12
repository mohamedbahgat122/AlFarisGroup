import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { MaintenanceStockClient } from "@/components/dashboard/fleet/maintenance-stock-client";
import { RealtimeRefresh } from "@/components/dashboard/realtime-refresh";
import { getMaintenanceStockLabels } from "@/features/maintenance-stock/labels";
import { getMaintenanceStockPage } from "@/features/maintenance-stock/queries";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/types/locale";
import { isLocale } from "@/types/locale";

type RouteProps = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | undefined>>;
};

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dictionary = getDictionary(locale).dashboard.fleet;

  return {
    title: dictionary.materialsMetadataTitle,
    robots: { index: false, follow: false },
  };
}

export default async function MaintenanceMaterialsRoute({
  params,
  searchParams,
}: RouteProps) {
  const { locale } = await params;
  const query = await searchParams;
  if (!isLocale(locale)) notFound();

  const data = await getMaintenanceStockPage({
    filters: {
      category: query?.category,
      organizationId: query?.organizationId,
      providerId: query?.providerId,
      search: query?.search,
      status: query?.status,
      page: query?.page,
    },
  });

  if (data.status === "unauthorized") {
    return <AccessDenied locale={locale} />;
  }

  if (data.status !== "success") {
    return <AccessDenied locale={locale} />;
  }

  const labels = getMaintenanceStockLabels(locale);
  const baseHref = `/${locale}/dashboard/fleet/materials`;

  return (
    <div className="min-h-full bg-background">
      <RealtimeRefresh
        channelName="dashboard-maintenance-stock-items"
        table="maintenance_stock_items"
        toast={labels.realtime}
      />
      <RealtimeRefresh
        channelName="dashboard-maintenance-stock-movements"
        table="maintenance_stock_movements"
        toast={labels.realtime}
      />
      <RealtimeRefresh
        channelName="dashboard-maintenance-stock-allocations"
        table="maintenance_stock_allocations"
        toast={labels.realtime}
      />
      <div className="border-b border-border bg-surface px-5 py-6 sm:px-7">
        <h1 className="text-2xl font-bold text-navy">{labels.title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          {labels.description}
        </p>
      </div>

      <MaintenanceStockClient
        locale={locale as Locale}
        baseHref={baseHref}
        rows={data.rows}
        movements={data.movements}
        allocations={data.allocations}
        allocationMovements={data.allocationMovements}
        allocationOrganizationOptions={data.allocationOrganizationOptions}
        organizations={data.organizations}
        providers={data.providers}
        summary={data.summary}
        page={data.page}
        totalRows={data.totalRows}
        totalPages={data.totalPages}
        selectedCategory={data.selectedCategory}
        selectedStatus={data.selectedStatus}
        filters={{
          organizationId: query?.organizationId,
          providerId: query?.providerId,
          category: query?.category,
          search: query?.search,
          status: query?.status,
        }}
      />
    </div>
  );
}
