"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { hasOrganizationPermission } from "@/features/permissions/server";
import { addDriverResignation as addResignationService } from "./service";
import { addDriverResignationSchema } from "./validations";
import type { AddDriverResignationInput } from "./validations";

export async function addDriverResignationAction(
  organizationId: string,
  input: AddDriverResignationInput,
) {
  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") {
    return { success: false, error: "unauthorized", message: "Unauthorized" };
  }

  const hasPermission = await hasOrganizationPermission({
    organizationId,
    permissionKey: "drivers.update"
  });

  if (!hasPermission) {
    return { success: false, error: "unauthorized", message: "Unauthorized" };
  }

  const validation = addDriverResignationSchema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      error: "validation_error",
      message: "Invalid input provided",
    };
  }

  const adminClient = createAdminClient();
  const result = await addResignationService(
    adminClient,
    organizationId,
    validation.data,
    admin.profile.id,
  );

  if (!result.success) {
    return {
      success: false,
      error: result.code,
      message: result.message,
    };
  }

  revalidatePath(`/[locale]/dashboard/organizations/${organizationId}/drivers/resignations`, "page");
  
  return { success: true };
}

export async function updateDriverResignationAction(
  organizationId: string,
  resignationId: string,
  input: {
    resignationDate: string;
    ordersCount: number;
    rating: string;
    notes: string | null;
    newKeetaDriverId: string | null;
  },
) {
  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") {
    return { success: false, error: "unauthorized", message: "Unauthorized" };
  }

  const hasPermission = await hasOrganizationPermission({
    organizationId,
    permissionKey: "drivers.update"
  });

  if (!hasPermission) {
    return { success: false, error: "unauthorized", message: "Unauthorized" };
  }

  const adminClient = createAdminClient();
  const { updateDriverResignation } = await import("./service");
  
  const result = await updateDriverResignation(
    adminClient,
    organizationId,
    resignationId,
    input,
    admin.profile.id
  );

  if (!result.success) {
    return {
      success: false,
      error: result.code,
      message: result.message,
    };
  }

  revalidatePath(`/[locale]/dashboard/organizations/${organizationId}/drivers/resignations`, "page");
  return { success: true };
}

export async function settleDriverResignationAction(
  organizationId: string,
  resignationId: string,
) {
  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") {
    return { success: false, error: "unauthorized", message: "Unauthorized" };
  }

  const hasPermission = await hasOrganizationPermission({
    organizationId,
    permissionKey: "drivers.update"
  });

  if (!hasPermission) {
    return { success: false, error: "unauthorized", message: "Unauthorized" };
  }

  const adminClient = createAdminClient();
  const { settleDriverResignation } = await import("./service");
  
  const result = await settleDriverResignation(
    adminClient,
    organizationId,
    resignationId,
    admin.profile.id,
    admin.profile.id
  );

  if (!result.success) {
    return {
      success: false,
      error: result.code,
      message: result.message,
    };
  }

  revalidatePath(`/[locale]/dashboard/organizations/${organizationId}/drivers/resignations`, "page");
  return { success: true };
}

export async function unsettleDriverResignationAction(
  organizationId: string,
  resignationId: string,
) {
  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") {
    return { success: false, error: "unauthorized", message: "Unauthorized" };
  }

  const hasPermission = await hasOrganizationPermission({
    organizationId,
    permissionKey: "drivers.update"
  });

  if (!hasPermission) {
    return { success: false, error: "unauthorized", message: "Unauthorized" };
  }

  const adminClient = createAdminClient();
  const { unsettleDriverResignation } = await import("./service");
  
  const result = await unsettleDriverResignation(
    adminClient,
    organizationId,
    resignationId,
    admin.profile.id
  );

  if (!result.success) {
    return {
      success: false,
      error: result.code,
      message: result.message,
    };
  }

  revalidatePath(`/[locale]/dashboard/organizations/${organizationId}/drivers/resignations`, "page");
  return { success: true };
}

export async function deleteDriverResignationAction(
  organizationId: string,
  resignationId: string,
) {
  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") {
    return { success: false, error: "unauthorized", message: "Unauthorized" };
  }

  const hasPermission = await hasOrganizationPermission({
    organizationId,
    permissionKey: "drivers.update"
  });

  if (!hasPermission) {
    return { success: false, error: "unauthorized", message: "Unauthorized" };
  }

  const adminClient = createAdminClient();
  const { deleteDriverResignation } = await import("./service");
  
  const result = await deleteDriverResignation(
    adminClient,
    organizationId,
    resignationId,
    admin.profile.id
  );

  if (!result.success) {
    return {
      success: false,
      error: result.code,
      message: result.message,
    };
  }

  revalidatePath(`/[locale]/dashboard/organizations/${organizationId}/drivers/resignations`, "page");
  return { success: true };
}
