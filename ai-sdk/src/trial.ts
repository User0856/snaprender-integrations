// Keyless agent trial. When no API key is configured, the tools mint a free
// trial key (POST /v1/agent-trial) on first use and keep it in
// ~/.snaprender/trial.json, the same file and format as snaprender-mcp and
// llama-index-tools-snaprender, so every SnapRender tool on a machine shares
// one trial key. The key is reused until the API says otherwise: a claimed key
// keeps working after its trial expiry, so expires_at is informational only.
// Docs: https://snap-render.com/docs/agent-trial
import { SIGNUP_URL, SnapRenderError, VERSION } from "./client.js";

export const TRIAL_DOCS_URL = "https://snap-render.com/docs/agent-trial";
export const DEFAULT_TRIAL_AGENT = "snaprender-ai-sdk";

/** The shape of ~/.snaprender/trial.json (shared with snaprender-mcp). */
export interface TrialCache {
  api_key: string;
  claim_url: string;
  expires_at: string;
  created_at: string;
  base_url: string;
}

export interface TrialContext {
  baseUrl: string;
  fetch: typeof fetch;
  agent: string;
  timeoutMs: number;
}

interface BaseState {
  active: TrialCache | null;
  inFlight: Promise<TrialCache> | null;
  /** The mint response's instructions, added once to the first result after minting. */
  pendingInstructions: string | null;
  /** After a refused mint (per-network or daily cap), do not ask again before this time. */
  blockedUntil: number;
  blockedError: SnapRenderError | null;
}

const states = new Map<string, BaseState>();

function stateFor(baseUrl: string): BaseState {
  let s = states.get(baseUrl);
  if (!s) {
    s = { active: null, inFlight: null, pendingInstructions: null, blockedUntil: 0, blockedError: null };
    states.set(baseUrl, s);
  }
  return s;
}

/** Test hook: forget every in-memory trial key. */
export function resetTrialState(): void {
  states.clear();
}

type Fs = typeof import("node:fs/promises");
type NodeDeps = { fs: Fs; join: (...parts: string[]) => string; homedir: () => string };

/**
 * Node built-ins, loaded without a static import so edge and browser bundles
 * still build. Returns null where there is no file system: the trial key then
 * lives in memory for the life of the process.
 */
async function nodeDeps(): Promise<NodeDeps | null> {
  try {
    const proc = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process;
    let fs: Fs | undefined;
    let path: typeof import("node:path") | undefined;
    let os: typeof import("node:os") | undefined;
    if (typeof proc?.getBuiltinModule === "function") {
      fs = proc.getBuiltinModule("node:fs/promises") as Fs | undefined;
      path = proc.getBuiltinModule("node:path") as typeof import("node:path") | undefined;
      os = proc.getBuiltinModule("node:os") as typeof import("node:os") | undefined;
    }
    if (!fs || !path || !os) {
      const load = (id: string) => import(/* webpackIgnore: true */ /* @vite-ignore */ id);
      [fs, path, os] = await Promise.all([load("node:fs/promises"), load("node:path"), load("node:os")]);
    }
    if (!fs || !path || !os) return null;
    return { fs, join: path.join, homedir: os.homedir };
  } catch {
    return null;
  }
}

function trialPaths(deps: NodeDeps): { dir: string; file: string } {
  const dir = deps.join(deps.homedir(), ".snaprender");
  return { dir, file: deps.join(dir, "trial.json") };
}

async function readCache(baseUrl: string): Promise<TrialCache | null> {
  const deps = await nodeDeps();
  if (!deps) return null;
  try {
    const data = JSON.parse(await deps.fs.readFile(trialPaths(deps).file, "utf8")) as Partial<TrialCache>;
    if (data && typeof data.api_key === "string" && data.api_key && data.base_url === baseUrl) {
      return data as TrialCache;
    }
  } catch {
    // Missing or unreadable: mint a new one.
  }
  return null;
}

async function writeCache(trial: TrialCache): Promise<void> {
  const deps = await nodeDeps();
  if (!deps) return;
  const { dir, file } = trialPaths(deps);
  try {
    await deps.fs.mkdir(dir, { recursive: true, mode: 0o700 });
    await deps.fs.chmod(dir, 0o700).catch(() => {});
    await deps.fs.writeFile(file, JSON.stringify(trial, null, 2) + "\n", { mode: 0o600 });
    await deps.fs.chmod(file, 0o600).catch(() => {});
  } catch {
    // Read-only home or similar: keep the key in memory only.
  }
}

async function deleteCache(): Promise<void> {
  const deps = await nodeDeps();
  if (!deps) return;
  await deps.fs.unlink(trialPaths(deps).file).catch(() => {});
}

const SET_KEY_HINT = "Then set SNAPRENDER_API_KEY or pass { apiKey }.";

async function mint(ctx: TrialContext): Promise<TrialCache> {
  const state = stateFor(ctx.baseUrl);
  if (state.blockedError && Date.now() < state.blockedUntil) throw state.blockedError;

  let response: Response;
  try {
    response = await ctx.fetch(`${ctx.baseUrl}/v1/agent-trial`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": `snaprender-ai-sdk/${VERSION}` },
      body: JSON.stringify({ agent: ctx.agent }),
      signal: AbortSignal.timeout(ctx.timeoutMs),
    });
  } catch {
    throw new SnapRenderError(
      503,
      "AGENT_TRIAL_UNAVAILABLE",
      `Could not reach SnapRender to start a free trial key. Ask your human to create a free account at ${SIGNUP_URL} (200 captures a month). ${SET_KEY_HINT}`,
    );
  }

  let data: Record<string, unknown> | null = null;
  try {
    data = JSON.parse(await response.text()) as Record<string, unknown>;
  } catch {
    // Not JSON (for example an edge proxy page).
  }

  if (!response.ok || !data || typeof data.api_key !== "string" || !data.api_key) {
    const err = (data?.error ?? {}) as { code?: string; message?: string; signup_url?: string };
    const signup = err.signup_url || SIGNUP_URL;
    const message =
      err.message ||
      `The free trial key is not available right now. Ask your human to create a free account at ${signup} (200 captures a month).`;
    const retryAfter = Number(response.headers.get("Retry-After"));
    const error = new SnapRenderError(
      response.ok ? 502 : response.status,
      err.code || `HTTP_${response.status}`,
      `${message} ${SET_KEY_HINT}`,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    );
    if (error.retryAfterSeconds) {
      state.blockedError = error;
      state.blockedUntil = Date.now() + error.retryAfterSeconds * 1000;
    }
    throw error;
  }

  const trial: TrialCache = {
    api_key: data.api_key,
    claim_url: typeof data.claim_url === "string" ? data.claim_url : SIGNUP_URL,
    expires_at: typeof data.expires_at === "string" ? data.expires_at : "",
    created_at: new Date().toISOString(),
    base_url: ctx.baseUrl,
  };
  await writeCache(trial);
  state.pendingInstructions = typeof data.instructions === "string" ? data.instructions : null;
  return trial;
}

/** The cached trial key, or a new one. Concurrent callers share one in-flight request. */
export function getTrialKey(ctx: TrialContext): Promise<TrialCache> {
  const state = stateFor(ctx.baseUrl);
  if (state.active) return Promise.resolve(state.active);
  if (!state.inFlight) {
    state.inFlight = (async () => {
      const trial = (await readCache(ctx.baseUrl)) ?? (await mint(ctx));
      state.active = trial;
      return trial;
    })().finally(() => {
      state.inFlight = null;
    });
  }
  return state.inFlight;
}

/** The API no longer knows the cached key: drop it and mint once more (shared by concurrent callers). */
export function remintTrialKey(stale: TrialCache, ctx: TrialContext): Promise<TrialCache> {
  const state = stateFor(ctx.baseUrl);
  if (state.active && state.active.api_key !== stale.api_key) return Promise.resolve(state.active);
  if (!state.inFlight) {
    state.inFlight = (async () => {
      state.active = null;
      await deleteCache();
      const trial = await mint(ctx);
      state.active = trial;
      return trial;
    })().finally(() => {
      state.inFlight = null;
    });
  }
  return state.inFlight;
}

/**
 * The note an agent should pass to its human, built from the X-SnapRender-Trial
 * header (`remaining=<n>; claim=<url>`). Undefined when the header is absent,
 * which is always the case for account keys and claimed trial keys.
 */
export function trialNote(header: string | null, baseUrl: string, usedTrial: boolean): string | undefined {
  const state = states.get(baseUrl);
  const lines: string[] = [];
  if (usedTrial && state?.pendingInstructions) {
    lines.push(state.pendingInstructions);
    state.pendingInstructions = null;
  }
  if (header) {
    const remaining = /remaining=(\d+)/.exec(header)?.[1];
    const claim = /claim=(\S+?);?\s*$/.exec(header)?.[1] ?? state?.active?.claim_url ?? SIGNUP_URL;
    if (remaining !== undefined) {
      lines.push(
        `Trial key: ${remaining} captures left. Ask your human to claim it at ${claim} to remove the watermark and get 200 free captures a month.`,
      );
    }
  }
  return lines.length ? lines.join("\n") : undefined;
}
