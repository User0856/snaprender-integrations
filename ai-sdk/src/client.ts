export const VERSION = "0.1.0";
export const DEFAULT_BASE_URL = "https://app.snap-render.com";
export const SIGNUP_URL = "https://app.snap-render.com/auth/signup";

export interface SnapRenderOptions {
  /** API key. Defaults to the SNAPRENDER_API_KEY environment variable. */
  apiKey?: string;
  /**
   * Custom key provider, called once per request when `apiKey` is not set.
   * Use it to read the key from a secret store at call time.
   *
   * TODO(agent-trial): when the keyless agent trial key ships
   * (POST /v1/agent-trial, returns an sk_trial_ key), the default key
   * resolution in `resolveApiKey` will fall back to minting and caching a
   * trial key here instead of throwing. Nothing else in the tools changes.
   */
  getApiKey?: () => string | Promise<string>;
  /** API base URL. Defaults to https://app.snap-render.com. */
  baseUrl?: string;
  /** Request timeout in milliseconds. Defaults to 90000 (full-page captures can be slow). */
  timeoutMs?: number;
  /** Custom fetch implementation (tests, proxies). Defaults to global fetch. */
  fetch?: typeof fetch;
  /**
   * Retries after a per-minute rate limit (HTTP 429 RATE_LIMITED), waiting as
   * long as the Retry-After header says (up to 30 s). Monthly quota errors are
   * never retried. Default 1.
   */
  maxRetries?: number;
}

export class SnapRenderError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfterSeconds?: number;

  constructor(status: number, code: string, message: string, retryAfterSeconds?: number) {
    super(`SnapRender ${status} ${code}: ${message}`);
    this.name = "SnapRenderError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function resolveApiKey(options: SnapRenderOptions): Promise<string> {
  if (options.apiKey) return options.apiKey;
  if (options.getApiKey) {
    const key = await options.getApiKey();
    if (key) return key;
  }
  const envKey = typeof process !== "undefined" ? process.env?.SNAPRENDER_API_KEY : undefined;
  if (envKey) return envKey;
  // TODO(agent-trial): mint a trial key here once POST /v1/agent-trial is live.
  throw new SnapRenderError(
    401,
    "MISSING_API_KEY",
    `No API key. Set SNAPRENDER_API_KEY or pass { apiKey }. Get a free key (200 captures a month) at ${SIGNUP_URL}`,
  );
}

export interface SnapRenderResponse {
  response: Response;
  bytes: Uint8Array;
}

/** Sends one request and turns non-2xx answers into SnapRenderError with the API's own message. */
export async function snaprenderRequest(
  options: SnapRenderOptions,
  path: string,
  body: Record<string, unknown>,
  abortSignal?: AbortSignal,
): Promise<SnapRenderResponse> {
  let retriesLeft = options.maxRetries ?? 1;
  for (;;) {
    try {
      return await requestOnce(options, path, body, abortSignal);
    } catch (error) {
      const wait = error instanceof SnapRenderError && error.code === "RATE_LIMITED" ? error.retryAfterSeconds ?? 5 : 0;
      if (!wait || wait > 60 || retriesLeft <= 0 || abortSignal?.aborted) throw error;
      retriesLeft -= 1;
      await new Promise((resolve) => setTimeout(resolve, wait * 1000));
    }
  }
}

async function requestOnce(
  options: SnapRenderOptions,
  path: string,
  body: Record<string, unknown>,
  abortSignal?: AbortSignal,
): Promise<SnapRenderResponse> {
  const apiKey = await resolveApiKey(options);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 90_000);
  const signal = abortSignal ? AbortSignal.any([abortSignal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
        "User-Agent": `snaprender-ai-sdk/${VERSION}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      if (abortSignal?.aborted) throw error;
      throw new SnapRenderError(408, "TIMEOUT", `No answer within ${options.timeoutMs ?? 90_000} ms.`);
    }
    throw error;
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!response.ok) {
    let code = `HTTP_${response.status}`;
    let message = response.statusText || "Request failed.";
    try {
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as {
        error?: { code?: string; message?: string };
      };
      if (parsed.error?.code) code = parsed.error.code;
      if (parsed.error?.message) message = parsed.error.message;
    } catch {
      // Non-JSON body (for example an edge proxy page): keep the status text.
    }
    const retryAfter = Number(response.headers.get("Retry-After"));
    throw new SnapRenderError(
      response.status,
      code,
      message,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    );
  }
  return { response, bytes };
}

/** Drops undefined values so the API applies its own defaults. */
export function compact(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}
