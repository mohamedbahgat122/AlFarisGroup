import { redirect } from "next/navigation";
import { isLocale } from "@/types/locale";

type FleetRouteProps = {
  params: Promise<{
    locale: string;
  }>;
};

export default async function FleetRoute({ params }: FleetRouteProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    return null;
  }

  redirect(`/${locale}/dashboard/fleet/cars`);
}
