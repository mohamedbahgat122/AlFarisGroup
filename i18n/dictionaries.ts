import { ar } from "@/i18n/messages/ar";
import { en } from "@/i18n/messages/en";
import type { Locale } from "@/types/locale";

export const dictionaries = {
  ar,
  en,
} as const;

export type Dictionary = (typeof dictionaries)[Locale];

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
