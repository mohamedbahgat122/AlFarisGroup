import "server-only";

const defaultBaseUrl = "https://kafaratplus.com";
const requestTimeoutMs = 15_000;

type KafaratplusErrorCode =
  | "missing_credentials"
  | "unauthorized"
  | "bad_request"
  | "timeout"
  | "network_error"
  | "malformed_response"
  | "api_error";

export type KafaratplusResult<T> =
  | { success: true; data: T }
  | { success: false; code: KafaratplusErrorCode; message: string; status?: number };

export async function kafaratplusGet<T>(
  path: string,
  params: Record<string, string | number | boolean | null | undefined>,
): Promise<KafaratplusResult<T>> {
  const clientId = process.env.KAFARATPLUS_CLIENT_ID?.trim();
  const secretKey = process.env.KAFARATPLUS_SECRET_KEY?.trim();
  const baseUrl = (process.env.KAFARATPLUS_BASE_URL?.trim() || defaultBaseUrl).replace(/\/+$/, "");

  if (!clientId || !secretKey) {
    return {
      success: false,
      code: "missing_credentials",
      message: "Kafaratplus credentials are not configured.",
    };
  }

  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        clientId,
        secretKey,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    const body = await readJson(response);

    if (response.status === 401) {
      logKafaratplusError("unauthorized", path, response.status, body);
      return {
        success: false,
        code: "unauthorized",
        message: "Kafaratplus credentials are invalid or inactive.",
        status: response.status,
      };
    }

    if (response.status === 400) {
      logKafaratplusError("bad_request", path, response.status, body);
      return {
        success: false,
        code: "bad_request",
        message: getResponseMessage(body) ?? "Kafaratplus rejected the request.",
        status: response.status,
      };
    }

    if (!response.ok) {
      logKafaratplusError("api_error", path, response.status, body);
      return {
        success: false,
        code: "api_error",
        message: getResponseMessage(body) ?? "Kafaratplus request failed.",
        status: response.status,
      };
    }

    if (!isRecord(body)) {
      logKafaratplusError("malformed_response", path, response.status, body);
      return {
        success: false,
        code: "malformed_response",
        message: "Kafaratplus returned an unreadable response.",
        status: response.status,
      };
    }

    if (body.success === false) {
      logKafaratplusError("api_error", path, response.status, body);
      return {
        success: false,
        code: "api_error",
        message: getResponseMessage(body) ?? "Kafaratplus returned success:false.",
        status: response.status,
      };
    }

    return { success: true, data: body as T };
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "AbortError";
    logKafaratplusError(isTimeout ? "timeout" : "network_error", path);
    return {
      success: false,
      code: isTimeout ? "timeout" : "network_error",
      message: isTimeout ? "Kafaratplus request timed out." : "Kafaratplus network request failed.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function readJson(response: Response): Promise<unknown> {
  return response.text().then((text) => {
    if (!text) return {};

    try {
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getResponseMessage(body: unknown) {
  if (!isRecord(body)) return null;
  const message = body.message ?? body.error ?? body.errorMessage;
  return typeof message === "string" ? message : null;
}

function logKafaratplusError(
  code: KafaratplusErrorCode,
  path: string,
  status?: number,
  body?: unknown,
) {
  console.error("[kafaratplus:request_failed]", {
    code,
    path,
    status,
    message: getResponseMessage(body),
  });
}
