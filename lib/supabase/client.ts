import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { getSupabaseConfig } from "@/lib/supabase/env";

export function createClient() {
  const { url, publishableKey } = getSupabaseConfig();

  return createBrowserClient<Database>(url, publishableKey);
}
