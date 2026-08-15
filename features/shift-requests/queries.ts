import "server-only";

import { getAuthenticatedAdmin } from "@/lib/auth/authorization";

export type ShiftChangeRequest = {
  id: string;
  driver_id: string;
  driver_name: string;
  driver_identifier: string | null;
  organization_id: string;
  current_shift_id: string;
  current_shift_name: string;
  requested_shift_id: string;
  requested_shift_name: string;
  requested_week_start_date: string;
  status: "pending" | "approved" | "rejected";
  driver_note: string | null;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export async function getShiftChangeRequestsPage(organizationId: string): Promise<ShiftChangeRequest[]> {
  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") {
    return [];
  }

  const { data, error } = await admin.supabase
    .from("driver_shift_change_requests")
    .select(`
      id,
      driver_id,
      organization_id,
      current_shift_id,
      requested_shift_id,
      requested_week_start_date,
      status,
      driver_note,
      review_note,
      reviewed_by,
      reviewed_at,
      created_at,
      driver:drivers!driver_shift_change_requests_driver_id_fkey(
        full_name,
        keeta_driver_id
      ),
      current_shift:organization_shift_templates!driver_shift_change_requests_current_shift_id_fkey(
        name
      ),
      requested_shift:organization_shift_templates!driver_shift_change_requests_requested_shift_id_fkey(
        name
      )
    `)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getShiftChangeRequestsPage error:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint
    });
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id,
    driver_id: row.driver_id,
    driver_name: row.driver?.full_name || "",
    driver_identifier: row.driver?.keeta_driver_id || null,
    organization_id: row.organization_id,
    current_shift_id: row.current_shift_id,
    current_shift_name: row.current_shift?.name || "",
    requested_shift_id: row.requested_shift_id,
    requested_shift_name: row.requested_shift?.name || "",
    requested_week_start_date: row.requested_week_start_date,
    status: row.status as "pending" | "approved" | "rejected",
    driver_note: row.driver_note,
    review_note: row.review_note,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at,
    created_at: row.created_at,
  }));
}
