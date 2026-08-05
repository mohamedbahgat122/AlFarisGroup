import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getSupabaseConfig } from "@/lib/supabase/env";

export function createAdminClient() {
  const { url } = getSupabaseConfig();
  const secret =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error("Missing Supabase server secret configuration.");
  }

  return createSupabaseClient<Database>(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
