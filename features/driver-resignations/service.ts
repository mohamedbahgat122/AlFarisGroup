import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { AddDriverResignationInput } from "./validations";

export async function addDriverResignation(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  input: AddDriverResignationInput,
  createdBy: string,
): Promise<{ success: boolean; code?: string; message?: string }> {
  // 1. Fetch current driver keeta_driver_id
  const { data: driver, error: driverError } = await supabase
    .from("drivers")
    .select("keeta_driver_id")
    .eq("id", input.driverId)
    .eq("organization_id", organizationId)
    .single();

  if (driverError || !driver) {
    return { success: false, code: "driver_not_found", message: "Driver not found" };
  }

  // 2. Insert resignation record
  const { error: insertError } = await supabase.from("driver_resignations").insert({
    organization_id: organizationId,
    driver_id: input.driverId,
    keeta_driver_id: driver.keeta_driver_id,
    resignation_date: input.resignationDate,
    orders_count: input.ordersCount,
    rating: input.rating as any,
    notes: input.notes || null,
    new_keeta_driver_id: input.newKeetaDriverId || null,
    created_by: createdBy,
  } as any);

  if (insertError) {
    console.error("Failed to insert driver resignation:", insertError);
    return { success: false, code: "database_error", message: "Failed to save driver resignation" };
  }

  return { success: true };
}

export async function updateDriverResignation(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  resignationId: string,
  input: {
    resignationDate: string;
    ordersCount: number;
    rating: string;
    notes: string | null;
    newKeetaDriverId: string | null;
  },
  actorId: string
): Promise<{ success: boolean; code?: string; message?: string }> {
  const { error } = await supabase
    .from("driver_resignations")
    .update({
      resignation_date: input.resignationDate,
      orders_count: input.ordersCount,
      rating: input.rating as any,
      notes: input.notes,
      new_keeta_driver_id: input.newKeetaDriverId || null,
    } as any)
    .eq("id", resignationId)
    .eq("organization_id", organizationId);

  if (error) {
    console.error("Failed to update driver resignation:", error);
    return { success: false, code: "database_error", message: "Failed to update driver resignation" };
  }

  await supabase.from("activity_logs").insert({
    action: "driver_resignation_updated",
    actor_user_id: actorId,
    organization_id: organizationId,
    entity_type: "driver_resignation",
    entity_id: resignationId,
  });

  return { success: true };
}

export async function settleDriverResignation(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  resignationId: string,
  settledBy: string,
  actorId: string
): Promise<{ success: boolean; code?: string; message?: string }> {
  const { error } = await supabase
    .from("driver_resignations")
    .update({
      is_settled: true,
      settled_at: new Date().toISOString(),
      settled_by: settledBy,
    } as any)
    .eq("id", resignationId)
    .eq("organization_id", organizationId);

  if (error) {
    console.error("Failed to settle driver resignation:", error);
    return { success: false, code: "database_error", message: "Failed to settle driver resignation" };
  }

  await supabase.from("activity_logs").insert({
    action: "driver_resignation_settled",
    actor_user_id: actorId,
    organization_id: organizationId,
    entity_type: "driver_resignation",
    entity_id: resignationId,
  });

  return { success: true };
}

export async function unsettleDriverResignation(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  resignationId: string,
  actorId: string
): Promise<{ success: boolean; code?: string; message?: string }> {
  const { error } = await supabase
    .from("driver_resignations")
    .update({
      is_settled: false,
      settled_at: null,
      settled_by: null,
    } as any)
    .eq("id", resignationId)
    .eq("organization_id", organizationId);

  if (error) {
    console.error("Failed to unsettle driver resignation:", error);
    return { success: false, code: "database_error", message: "Failed to unsettle driver resignation" };
  }

  await supabase.from("activity_logs").insert({
    action: "driver_resignation_unsettled",
    actor_user_id: actorId,
    organization_id: organizationId,
    entity_type: "driver_resignation",
    entity_id: resignationId,
  });

  return { success: true };
}

export async function deleteDriverResignation(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  resignationId: string,
  actorId: string
): Promise<{ success: boolean; code?: string; message?: string }> {
  const { error } = await supabase
    .from("driver_resignations")
    .delete()
    .eq("id", resignationId)
    .eq("organization_id", organizationId);

  if (error) {
    console.error("Failed to delete driver resignation:", error);
    return { success: false, code: "database_error", message: "Failed to delete driver resignation" };
  }

  await supabase.from("activity_logs").insert({
    action: "driver_resignation_deleted",
    actor_user_id: actorId,
    organization_id: organizationId,
    entity_type: "driver_resignation",
    entity_id: resignationId,
  });

  return { success: true };
}

