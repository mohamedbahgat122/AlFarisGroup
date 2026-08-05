"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { isLocale } from "@/types/locale";

export async function issueDriverWarningAction(formData: FormData) {
  const locale = getString(formData, "locale");
  const organizationCode = getString(formData, "organizationCode");
  const organizationId = getString(formData, "organizationId");
  const driverId = getString(formData, "driverId");
  const category = getString(formData, "category");
  const severity = getString(formData, "severity");
  const title = getString(formData, "title");
  const description = getString(formData, "description");
  const incidentAt = getString(formData, "incidentAt");

  if (
    !isLocale(locale) ||
    !organizationCode ||
    !organizationId ||
    !driverId ||
    !category ||
    !severity ||
    !title ||
    !description ||
    !incidentAt
  ) {
    return;
  }

  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return;
  }

  const incidentDate = new Date(incidentAt);

  if (!Number.isFinite(incidentDate.getTime())) {
    return;
  }

  await admin.supabase.rpc("issue_driver_warning", {
    p_organization_id: organizationId,
    p_driver_id: driverId,
    p_category: category,
    p_severity: severity,
    p_title: title,
    p_description: description,
    p_incident_at: incidentDate.toISOString(),
  });

  revalidatePath(`/${locale}/dashboard/organizations/${organizationCode}/driver-warnings`);
}

export async function revokeDriverWarningAction(formData: FormData) {
  const locale = getString(formData, "locale");
  const organizationCode = getString(formData, "organizationCode");
  const warningId = getString(formData, "warningId");
  const revokeReason = getString(formData, "revokeReason");

  if (!isLocale(locale) || !organizationCode || !warningId || !revokeReason) {
    return;
  }

  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return;
  }

  await admin.supabase.rpc("revoke_driver_warning", {
    p_warning_id: warningId,
    p_revoke_reason: revokeReason,
  });

  revalidatePath(`/${locale}/dashboard/organizations/${organizationCode}/driver-warnings`);
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
