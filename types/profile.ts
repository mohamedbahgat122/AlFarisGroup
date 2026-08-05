import type { Database } from "@/types/database";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfileRole = Database["public"]["Enums"]["app_role"];
