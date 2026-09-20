import { redirect } from "next/navigation";
import { isLocale } from "@/types/locale";
import { getOrganizationPageAccessByCode } from "@/features/organizations/queries";
import { AccessDenied } from "@/components/dashboard/access-denied";

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

  const access = await getOrganizationPageAccessByCode(organizationCode);
  if (access.status === "unauthenticated") redirect(`/${locale}/login`);
  if (access.status === "not_found") return null;
  if (access.status !== "success") return <AccessDenied locale={locale} />;

  const keys = new Set(access.organization.permissionKeys);
  const target = keys.has("odometer.manage") || keys.has("odometer.view")
    ? "odometer"
    : keys.has("app_requests.leave.view") || keys.has("app_requests.view")
      ? "leave"
      : keys.has("app_requests.maintenance.view")
        ? "maintenance"
        : keys.has("app_requests.meeting.view")
          ? "meetings"
          : keys.has("app_requests.oil_change.view")
            ? "oil-change"
            : keys.has("app_requests.shift_change.view")
              ? "shifts"
              : null;

  if (!target) return <AccessDenied locale={locale} />;
  redirect(`/${locale}/dashboard/organizations/${organizationCode}/app-requests/${target}`);
}
