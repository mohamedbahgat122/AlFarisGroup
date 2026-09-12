import { exportGlobalFleet } from "../../_global-fleet-export-route";

type RouteContext = {
  params: Promise<{ locale: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { locale } = await context.params;
  return exportGlobalFleet(request, locale, "car");
}
