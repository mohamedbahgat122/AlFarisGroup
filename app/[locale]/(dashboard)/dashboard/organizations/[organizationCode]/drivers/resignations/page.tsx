import { redirect } from "next/navigation";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/types/locale";
import { createClient } from "@/lib/supabase/server";
import { requireOrganizationPermission } from "@/features/permissions/server";
import { getAccessibleOrganizationByCode } from "@/features/organizations/queries";
import { getDriverResignations } from "@/features/driver-resignations/queries";
import { DriverResignationsClient } from "@/components/dashboard/driver-resignations/driver-resignations-client";

type PageProps = {
  params: Promise<{
    locale: Locale;
    organizationCode: string;
  }>;
  searchParams?: Promise<{
    page?: string;
    search?: string;
  }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);
  return {
    title: dictionary.dashboard.drivers.resignationsTitle,
    description: dictionary.dashboard.drivers.resignationsDescription,
  };
}

export default async function DriverResignationsPage({
  params,
  searchParams,
}: PageProps) {
  const { locale, organizationCode } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const organization = await getAccessibleOrganizationByCode(organizationCode);
  if (!organization) {
    redirect(`/${locale}/dashboard`);
  }

  // Require drivers.view permission (or update if needed)
  const hasPermission = await requireOrganizationPermission({ organizationId: organization.id, permissionKey: "drivers.view" });
  if (!hasPermission) redirect(`/${locale}/dashboard`);

  const dictionary = await getDictionary(locale);
  
  const page = query?.page ? parseInt(query.page, 10) : 1;
  const limit = 20;
  const search = query?.search || "";

  const [resignations, { data: activeDrivers }] = await Promise.all([
    getDriverResignations(supabase, organization.id, page, limit, search),
    supabase
      .from("drivers")
      .select("id, full_name, iqama_number, keeta_driver_id")
      .eq("organization_id", organization.id)
      .is("deleted_at", null)
      .order("full_name", { ascending: true }),
  ]);

  const mappedDrivers = (activeDrivers || []).map((d: { id: string, full_name: string, iqama_number: string, keeta_driver_id: string | null }) => ({
    id: d.id,
    fullName: d.full_name,
    iqamaNumber: d.iqama_number,
    keetaDriverId: d.keeta_driver_id,
  }));

  return (
    <div className="p-6">
      <DriverResignationsClient
        dictionary={dictionary.dashboard.drivers}
        organizationCode={organizationCode}
        organizationId={organization.id}
        resignations={resignations}
        drivers={mappedDrivers}
        page={page}
        searchTerm={search}
      />
    </div>
  );
}
