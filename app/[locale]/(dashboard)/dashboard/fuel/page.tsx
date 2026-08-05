import { redirect } from "next/navigation";
import { isLocale } from "@/types/locale";

type FuelRouteProps = {
  params: Promise<{ locale: string }>;
};

export default async function FuelRoute({ params }: FuelRouteProps) {
  const { locale } = await params;

  redirect(`/${isLocale(locale) ? locale : "ar"}/dashboard/organizations`);
}
