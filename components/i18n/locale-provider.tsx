"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Locale } from "@/types/locale";

type LoadingCopy = {
  message: string;
  subtext: string;
  saving: string;
};

type LocaleContextValue = {
  locale: Locale;
  loading: LoadingCopy;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  locale,
  loading,
  children,
}: LocaleContextValue & { children: ReactNode }) {
  return (
    <LocaleContext.Provider value={{ locale, loading }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocaleContext() {
  return useContext(LocaleContext);
}
