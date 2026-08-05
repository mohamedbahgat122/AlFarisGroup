"use server";

import { redirect } from "next/navigation";
import { getProfileForUser, validateAdminProfile } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale, type Locale } from "@/types/locale";
import type { AccessDeniedReason } from "@/lib/auth/authorization";
import type { LoginActionState } from "@/features/auth/login-state";

function getFormLocale(formData: FormData): Locale {
  const locale = formData.get("locale");
  return typeof locale === "string" && isLocale(locale) ? locale : "ar";
}

function getDeniedMessage(locale: Locale, reason: AccessDeniedReason) {
  const messages = getDictionary(locale).login;

  if (reason === "missing_profile") {
    return messages.profileMissing;
  }

  if (reason === "suspended") {
    return messages.accountSuspended;
  }

  if (reason === "driver") {
    return messages.driverAccount;
  }

  return messages.unexpectedError;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function signInAction(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const locale = getFormLocale(formData);
  const messages = getDictionary(locale).login;
  const emailValue = formData.get("email");
  const passwordValue = formData.get("password");
  const email = typeof emailValue === "string" ? emailValue.trim() : "";
  const password = typeof passwordValue === "string" ? passwordValue : "";

  if (!email || !isValidEmail(email) || !password) {
    return {
      message: messages.invalidCredentials,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return {
      message: messages.invalidCredentials,
    };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    await supabase.auth.signOut();
    return {
      message: messages.invalidCredentials,
    };
  }

  const profile = await getProfileForUser(supabase, user.id);
  const access = validateAdminProfile(profile);

  if (!access.allowed) {
    await supabase.auth.signOut();
    return {
      message: getDeniedMessage(locale, access.reason),
    };
  }

  redirect(`/${locale}/dashboard`);
}
