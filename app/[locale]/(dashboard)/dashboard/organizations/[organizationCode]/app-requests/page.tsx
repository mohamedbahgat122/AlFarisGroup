import { redirect } from "next/navigation";
import { isLocale } from "@/types/locale";

type AppRequestsParentRouteProps = {
  params: Promise<{
    locale: string;
    organizationCode: string;
  }>;
};

export default async function AppRequestsParentRoute({ params }: AppRequestsParentRouteProps) {
  const { locale, organizationCode } = await params;

  if (!isLocale(locale)) {
    return null;
  }

  // Sidebar physically renders odometer first, so we redirect there
  redirect(`/${locale}/dashboard/organizations/${organizationCode}/app-requests/odometer`);
}
