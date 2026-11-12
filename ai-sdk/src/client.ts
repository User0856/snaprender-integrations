import { DEFAULT_TRIAL_AGENT, getTrialKey, remintTrialKey, trialNote, type TrialCache, type TrialContext } from "./trial.js";

export const VERSION = "0.2.0";
export const DEFAULT_BASE_URL = "https://app.snap-render.com";
export const SIGNUP_URL = "https://app.snap-render.com/auth/signup";
/** Response header on trial-key responses: `remaining=<n>; claim=<url>`. */
export const TRIAL_HEADER = "X-SnapRender-Trial";

export interface SnapRenderOptions {
  /** API key. Defaults to the SNAPRENDER_API_KEY environment variable. */
  apiKey?: string;
  /**
   * Custom key provider, called once per request when `apiKey` is not set.
   * Use it to read the key from a secret store at call time.
   */
  getApiKey?: () => string | Promise<string>;
  /**
   * With no key from `apiKey`, `getApiKey` or SNAPRENDER_API_KEY, use a free
   * agent trial key (100 watermarked captures over 7 days), minted on first use
   * and shared through ~/.snaprender/trial.json with other SnapRender tools.
   * Results then carry a claim link for your human. Set false to throw
   * MISSING_API_KEY instead. Default true. See https://snap-render.com/docs/agent-trial
   */
  trial?: boolean;
  /** Name sent when minting a trial key, shown on the claim page. Default "snaprender-ai-sdk". */
  trialAgent?: string;
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
  return (await resolveAuth(options)).apiKey;
}

interface ResolvedAuth {
  apiKey: string;
  /** Set when the key is the shared agent trial key. */
  trial?: TrialCache;
}

function configuredKey(options: SnapRenderOptions): Promise<string | undefined> | string | undefined {
  if (options.apiKey) return options.apiKey;
  const envKey = () => (typeof process !== "undefined" ? process.env?.SNAPRENDER_API_KEY : undefined) || undefined;
  if (options.getApiKey) {
    return Promise.resolve(options.getApiKey()).then((key) => key || envKey());
  }
  return envKey();
}

function trialContext(options: SnapRenderOptions): TrialContext {
  return {
    baseUrl: baseUrlOf(options),
    fetch: options.fetch ?? globalThis.fetch,
    agent: options.trialAgent || DEFAULT_TRIAL_AGENT,
    timeoutMs: options.timeoutMs ?? 90_000,
  };
}

function baseUrlOf(options: SnapRenderOptions): string {
  return (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

async function resolveAuth(options: SnapRenderOptions): Promise<ResolvedAuth> {
  const key = await configuredKey(options);
  if (key) return { apiKey: key };
  if (options.trial !== false) {
    const trial = await getTrialKey(trialContext(options));
    return { apiKey: trial.api_key, trial };
  }
  throw new SnapRenderError(
    401,
    "MISSING_API_KEY",
    `No API key. Set SNAPRENDER_API_KEY or pass { apiKey }. Get a free key (200 captures a month) at ${SIGNUP_URL}`,
  );
}

export interface SnapRenderResponse {
  response: Response;
  bytes: Uint8Array;
  /** Remaining trial captures and the claim link, for trial keys only. */
  trialNote?: string;
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
  const auth = await resolveAuth(options);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const baseUrl = baseUrlOf(options);

  const send = async (apiKey: string): Promise<Response> => {
    const timeout = AbortSignal.timeout(options.timeoutMs ?? 90_000);
    const signal = abortSignal ? AbortSignal.any([abortSignal, timeout]) : timeout;
    try {
      return await fetchImpl(`${baseUrl}${path}`, {
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
  };

  let response = await send(auth.apiKey);
  if (auth.trial && response.status === 401 && (await errorCode(response)) === "UNAUTHORIZED") {
    // The API no longer knows the cached trial key (not TRIAL_EXPIRED, which keeps the key claimable).
    const fresh = await remintTrialKey(auth.trial, trialContext(options));
    response = await send(fresh.api_key);
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
  const note = trialNote(response.headers.get(TRIAL_HEADER), baseUrl, Boolean(auth.trial));
  return note ? { response, bytes, trialNote: note } : { response, bytes };
}

async function errorCode(response: Response): Promise<string | undefined> {
  try {
    const parsed = JSON.parse(await response.clone().text()) as { error?: { code?: string } };
    return parsed.error?.code;
  } catch {
    return undefined;
  }
}

/** Drops undefined values so the API applies its own defaults. */
export function compact(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}
