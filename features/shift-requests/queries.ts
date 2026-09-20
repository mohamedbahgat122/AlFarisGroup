import "server-only";

import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { getOrganizationPermissions } from "@/features/permissions/server";

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
  derived_status:
    | "pending"
    | "rejected"
    | "scheduled"
    | "completed"
    | "review_needed";
  derived_status_label: string;
  derived_status_message: string;
};

export async function getShiftChangeRequestsPage(organizationId: string): Promise<ShiftChangeRequest[]> {
  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") {
    return [];
  }

  const permissions = await getOrganizationPermissions(
    admin.supabase,
    admin.profile,
    organizationId,
  );
  if (
    admin.profile.role !== "system_owner" &&
    !permissions.has("app_requests.view") &&
    !permissions.has("app_requests.shift_change.view") &&
    !permissions.has("app_requests.shift_change.review")
  ) {
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

  const today = getRiyadhDateString();
  const driverIds = Array.from(
    new Set((data || []).map((row) => row.driver_id).filter(Boolean)),
  );
  const assignmentByDriverId = new Map<string, { shift_template_id: string }>();

  if (driverIds.length > 0) {
    const { data: assignments, error: assignmentError } = await admin.supabase
      .from("organization_shift_assignments")
      .select("driver_id, shift_template_id, assignment_start_date, assignment_end_date, created_at")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .in("driver_id", driverIds)
      .or(`assignment_start_date.is.null,assignment_start_date.lte.${today}`)
      .or(`assignment_end_date.is.null,assignment_end_date.gte.${today}`)
      .order("assignment_start_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (assignmentError) {
      console.error("getShiftChangeRequestsPage assignment error:", {
        code: assignmentError.code,
        message: assignmentError.message,
        details: assignmentError.details,
        hint: assignmentError.hint
      });
    }

    for (const assignment of assignments ?? []) {
      if (!assignmentByDriverId.has(assignment.driver_id)) {
        assignmentByDriverId.set(assignment.driver_id, {
          shift_template_id: assignment.shift_template_id,
        });
      }
    }
  }

  return (data || []).map((row) => {
    const derived = deriveShiftRequestStatus({
      status: row.status as "pending" | "approved" | "rejected",
      requestedWeekStartDate: row.requested_week_start_date,
      requestedShiftId: row.requested_shift_id,
      effectiveShiftId:
        assignmentByDriverId.get(row.driver_id)?.shift_template_id ?? null,
      today,
    });

    return {
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
      derived_status: derived.status,
      derived_status_label: derived.label,
      derived_status_message: derived.message,
    };
  });
}

function deriveShiftRequestStatus({
  status,
  requestedWeekStartDate,
  requestedShiftId,
  effectiveShiftId,
  today,
}: {
  status: "pending" | "approved" | "rejected";
  requestedWeekStartDate: string;
  requestedShiftId: string;
  effectiveShiftId: string | null;
  today: string;
}) {
  if (status === "pending") {
    return {
      status: "pending" as const,
      label: "قيد المراجعة",
      message: "بانتظار مراجعة الإدارة.",
    };
  }

  if (status === "rejected") {
    return {
      status: "rejected" as const,
      label: "مرفوض",
      message: "تم رفض الطلب.",
    };
  }

  if (today < requestedWeekStartDate) {
    return {
      status: "scheduled" as const,
      label: "مقبول - مجدول",
      message: `سيتم التنفيذ في ${formatDisplayDate(requestedWeekStartDate)}.`,
    };
  }

  if (effectiveShiftId === requestedShiftId) {
    return {
      status: "completed" as const,
      label: "تم التنفيذ",
      message: `تم التنفيذ في ${formatDisplayDate(requestedWeekStartDate)}.`,
    };
  }

  return {
    status: "review_needed" as const,
    label: "مقبول - يحتاج مراجعة التنفيذ",
    message: "تاريخ التنفيذ وصل لكن الشيفت الفعلي لا يطابق الطلب.",
  };
}

function formatDisplayDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function getRiyadhDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}
