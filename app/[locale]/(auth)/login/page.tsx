import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { LoginPage } from "@/components/auth/login-page";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/types/locale";

export const dynamic = "force-dynamic";

type LoginRouteProps = {
  params: Promise<{
    locale: string;
  }>;
};

export async function generateMetadata({
  params,
}: LoginRouteProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    return {};
  }

  const dictionary = getDictionary(locale);

  return {
    title: dictionary.login.metadataTitle,
    description: dictionary.login.metadataDescription,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function LoginRoute({ params }: LoginRouteProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const admin = await getAuthenticatedAdmin();

  if (admin.status === "authorized") {
    redirect(`/${locale}/dashboard`);
  }

  return <LoginPage locale={locale} dictionary={getDictionary(locale)} />;
}
