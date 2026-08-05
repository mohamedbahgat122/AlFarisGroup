import type { Database } from "@/types/database";

export const driverAppProfileRole = "driver" satisfies Database["public"]["Enums"]["app_role"];

export function isDriverAppProfileRole(role: Database["public"]["Enums"]["app_role"]) {
  return role === driverAppProfileRole;
}
