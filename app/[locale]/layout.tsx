import type { Metadata, Viewport } from "next";
import { Geist_Mono, IBM_Plex_Sans_Arabic } from "next/font/google";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getDirection, isLocale, locales } from "@/types/locale";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { getDictionary } from "@/i18n/dictionaries";
import "../globals.css";

const arabicUi = IBM_Plex_Sans_Arabic({
  variable: "--font-arabic-ui",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Al Faris Group",
  description: "Logistics Management System",
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#f5f8fc",
};

type LocaleLayoutProps = {
  children: ReactNode;
  params: Promise<{
    locale: string;
  }>;
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  return (
    <html
      lang={locale}
      dir={getDirection(locale)}
      className={`${arabicUi.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <LocaleProvider locale={locale} loading={getDictionary(locale).dashboard.loading}>
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
