"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isLocale, type Locale } from "@/types/locale";

function getFormLocale(formData: FormData): Locale {
  const locale = formData.get("locale");
  return typeof locale === "string" && isLocale(locale) ? locale : "ar";
}

export async function signOutAction(formData: FormData) {
  const locale = getFormLocale(formData);
  const supabase = await createClient();

  await supabase.auth.signOut();
  redirect(`/${locale}/login`);
}
