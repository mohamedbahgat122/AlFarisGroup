"use server";

import { getFuelReportDetailsData } from "@/features/fuel/queries";
import type { FuelReportDetails } from "@/features/fuel/types";
import { getAccessibleOrganizationByCode } from "@/features/organizations/queries";

export type FuelReportDetailsActionResult =
  | { status: "success"; details: FuelReportDetails }
  | { status: "error"; code: "unauthorized" | "invalid_request" | "load_failed" };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function loadFuelReportDetailsAction({
  driverId,
  fromDate,
  organizationCode,
  toDate,
}: {
  driverId: string;
  fromDate: string;
  organizationCode: string;
  toDate: string;
}): Promise<FuelReportDetailsActionResult> {
  if (
    !UUID_PATTERN.test(driverId) ||
    !DATE_PATTERN.test(fromDate) ||
    !DATE_PATTERN.test(toDate) ||
    !organizationCode
  ) {
    return { status: "error", code: "invalid_request" };
  }

  const organization = await getAccessibleOrganizationByCode(organizationCode);

  if (!organization || !organization.navigation.fuelReports) {
    return { status: "error", code: "unauthorized" };
  }

  const result = await getFuelReportDetailsData({
    organizationId: organization.id,
    driverId,
    fromDate,
    toDate,
  });

  if (result.status !== "success") {
    return {
      status: "error",
      code: result.status === "unauthorized" ? "unauthorized" : "load_failed",
    };
  }

  return { status: "success", details: result.details };
}
