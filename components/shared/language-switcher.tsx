"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/types/locale";

type LanguageSwitcherProps = {
  locale: Locale;
  label: string;
};

export function LanguageSwitcher({ locale, label }: LanguageSwitcherProps) {
  const pathname = usePathname();
  const nextLocale: Locale = locale === "ar" ? "en" : "ar";
  const localizedPath = pathname.replace(/^\/(ar|en)(?=\/|$)/, `/${nextLocale}`);

  return (
    <Link
      href={localizedPath}
      className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-navy shadow-sm transition hover:border-primary/35 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      hrefLang={nextLocale}
    >
      {label}
    </Link>
  );
}
