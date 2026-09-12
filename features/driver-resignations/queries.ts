import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { DriverResignationListResponse, DriverResignation } from "./types";

export async function getDriverResignations(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  page: number,
  limit: number,
  searchTerm: string,
): Promise<DriverResignationListResponse> {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("driver_resignations")
    .select(
      `
      id,
      organization_id,
      driver_id,
      keeta_driver_id,
      new_keeta_driver_id,
      resignation_date,
      orders_count,
      rating,
      notes,
      is_settled,
      settled_at,
      created_at,
      updated_at,
      driver:drivers(
        full_name,
        iqama_number,
        mobile_number
      ),
      creator:profiles!driver_resignations_created_by_fkey(
        id,
        full_name
      ),
      settler:profiles!driver_resignations_settled_by_fkey(
        id,
        full_name
      )
    `,
      { count: "exact" }
    )
    .eq("organization_id", organizationId);

  if (searchTerm) {
    const term = `%${searchTerm}%`;
    query = query.or(
      `keeta_driver_id.ilike.${term},new_keeta_driver_id.ilike.${term},drivers.full_name.ilike.${term},drivers.iqama_number.ilike.${term}`
    );
  }

  query = query.order("created_at", { ascending: false });
  query = query.range(from, to);

  const { data, count, error } = await query;

  if (error) {
    console.error("Error fetching driver resignations:", error);
    throw new Error("Failed to fetch driver resignations");
  }

  const items: DriverResignation[] = (data || []).map((row: any) => ({
    id: row.id,
    organizationId: row.organization_id,
    driverId: row.driver_id,
    keetaDriverId: row.keeta_driver_id,
    newKeetaDriverId: row.new_keeta_driver_id,
    resignationDate: row.resignation_date,
    ordersCount: row.orders_count,
    rating: row.rating as "A" | "B" | "C" | "D",
    notes: row.notes,
    isSettled: row.is_settled,
    settledAt: row.settled_at,
    settledBy: row.settler 
      ? { id: row.settler.id, fullName: row.settler.full_name }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    driver: {
      fullName: row.driver?.full_name || "",
      iqamaNumber: row.driver?.iqama_number || "",
      mobileNumber: row.driver?.mobile_number || "",
    },
    createdBy: row.creator ? { id: row.creator.id, fullName: row.creator.full_name } : null,
  }));

  return {
    items,
    total: count || 0,
    hasMore: count ? from + items.length < count : false,
  };
}
