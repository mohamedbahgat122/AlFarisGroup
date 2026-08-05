type SupabaseConfig = {
  url: string;
  publishableKey: string;
};

export function getSupabaseConfig(): SupabaseConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error("Missing Supabase environment configuration.");
  }

  return { url, publishableKey };
}
