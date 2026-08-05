import type { Metadata, Viewport } from "next";
import { Cairo, Geist_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getDirection, isLocale, locales } from "@/types/locale";
import "../globals.css";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800"],
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
      className={`${cairo.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
