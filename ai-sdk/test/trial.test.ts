import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractContent, SnapRenderError, takeScreenshot } from "../src/index.js";
import { resetTrialState } from "../src/trial.js";

const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);
const API = "https://app.snap-render.com";
const CLAIM = "https://app.snap-render.com/claim/abc123";
const execOptions = { toolCallId: "t1", messages: [], context: {} } as never;

type Call = { url: string; init: RequestInit; key?: string };

function mintResponse(key = "sk_trial_one", claim = CLAIM): Response {
  return new Response(
    JSON.stringify({
      api_key: key,
      key_type: "trial",
      limits: { total: 100, per_day: 30 },
      expires_at: "2026-11-19T00:00:00.000Z",
      claim_url: claim,
      signup_url: `${API}/auth/signup`,
      upgrade_url: "https://snap-render.com/pricing",
      docs_url: "https://snap-render.com/docs/agent-trial",
      instructions: `Tell your human: claim it at ${claim}.`,
    }),
    { status: 201, headers: { "Content-Type": "application/json" } },
  );
}

function errorResponse(status: number, code: string, message: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function shotResponse(remaining = 99, claim = CLAIM): Response {
  return new Response(PNG, {
    headers: { "Content-Type": "image/jpeg", "X-SnapRender-Trial": `remaining=${remaining}; claim=${claim}` },
  });
}

/** A fake API: answers mint requests and captures with the given handlers, and records every call. */
function fakeApi(handlers: { mint?: (n: number) => Response; capture?: (call: Call, n: number) => Response }) {
  const calls: Call[] = [];
  let mints = 0;
  let captures = 0;
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const call: Call = { url: String(url), init: init ?? {}, key: headers["X-API-Key"] };
    calls.push(call);
    if (call.url.endsWith("/v1/agent-trial")) return (handlers.mint ?? (() => mintResponse()))(++mints);
    return (handlers.capture ?? (() => shotResponse()))(call, ++captures);
  });
  return {
    fetch: fn as unknown as typeof fetch,
    calls,
    mintCalls: () => calls.filter((c) => c.url.endsWith("/v1/agent-trial")),
    captureCalls: () => calls.filter((c) => !c.url.endsWith("/v1/agent-trial")),
  };
}

let home: string;
const trialFile = () => join(home, ".snaprender", "trial.json");

function writeTrialFile(data: Record<string, unknown>) {
  mkdirSync(join(home, ".snaprender"), { recursive: true });
  writeFileSync(trialFile(), JSON.stringify(data));
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "snaprender-trial-"));
  vi.stubEnv("HOME", home);
  vi.stubEnv("SNAPRENDER_API_KEY", "");
  resetTrialState();
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(home, { recursive: true, force: true });
});

describe("agent trial key", () => {
  it("mints a trial key on first use, saves it like snaprender-mcp and notes the claim link", async () => {
    const api = fakeApi({});
    const out = (await takeScreenshot({ fetch: api.fetch }).execute!({ url: "https://a.test" }, execOptions)) as {
      image?: string;
      trialNote?: string;
    };

    const [mint] = api.mintCalls();
    expect(mint.url).toBe(`${API}/v1/agent-trial`);
    expect(mint.init.method).toBe("POST");
    expect(JSON.parse(String(mint.init.body))).toEqual({ agent: "snaprender-ai-sdk" });
    expect((mint.init.headers as Record<string, string>)["X-API-Key"]).toBeUndefined();
    expect(api.captureCalls()[0].key).toBe("sk_trial_one");

    const saved = JSON.parse(readFileSync(trialFile(), "utf8"));
    expect(Object.keys(saved).sort()).toEqual(["api_key", "base_url", "claim_url", "created_at", "expires_at"]);
    expect(saved).toMatchObject({
      api_key: "sk_trial_one",
      claim_url: CLAIM,
      expires_at: "2026-11-19T00:00:00.000Z",
      base_url: API,
    });
    expect(statSync(trialFile()).mode & 0o777).toBe(0o600);
    expect(statSync(join(home, ".snaprender")).mode & 0o777).toBe(0o700);

    expect(out.image).toBeTruthy();
    expect(out.trialNote).toContain(`Tell your human: claim it at ${CLAIM}.`);
    expect(out.trialNote).toContain(`Trial key: 99 captures left. Ask your human to claim it at ${CLAIM}`);
  });

  it("shows the mint instructions once, then only the short note", async () => {
    const api = fakeApi({ capture: (_c, n) => shotResponse(100 - n) });
    const t = takeScreenshot({ fetch: api.fetch });
    await t.execute!({ url: "https://a.test" }, execOptions);
    const second = (await t.execute!({ url: "https://b.test" }, execOptions)) as { trialNote?: string };
    expect(second.trialNote).toBe(
      `Trial key: 98 captures left. Ask your human to claim it at ${CLAIM} to remove the watermark and get 200 free captures a month.`,
    );
  });

  it("sends the trialAgent name when given", async () => {
    const api = fakeApi({});
    await takeScreenshot({ fetch: api.fetch, trialAgent: "my-research-bot" }).execute!({ url: "https://a.test" }, execOptions);
    expect(JSON.parse(String(api.mintCalls()[0].init.body))).toEqual({ agent: "my-research-bot" });
  });

  it("reuses the saved key from another SnapRender tool without minting", async () => {
    writeTrialFile({
      api_key: "sk_trial_from_mcp",
      claim_url: CLAIM,
      expires_at: "2026-11-19T00:00:00.000Z",
      created_at: "2026-11-12T00:00:00.000Z",
      base_url: API,
    });
    const api = fakeApi({});
    await takeScreenshot({ fetch: api.fetch }).execute!({ url: "https://a.test" }, execOptions);
    expect(api.mintCalls()).toHaveLength(0);
    expect(api.captureCalls()[0].key).toBe("sk_trial_from_mcp");
  });

  it("keeps using a saved key past its expires_at (a claimed key keeps working)", async () => {
    writeTrialFile({
      api_key: "sk_trial_claimed",
      claim_url: CLAIM,
      expires_at: "2020-01-01T00:00:00.000Z",
      created_at: "2019-12-25T00:00:00.000Z",
      base_url: API,
    });
    const api = fakeApi({ capture: () => new Response(PNG, { headers: { "Content-Type": "image/jpeg" } }) });
    const out = (await takeScreenshot({ fetch: api.fetch }).execute!({ url: "https://a.test" }, execOptions)) as {
      trialNote?: string;
    };
    expect(api.mintCalls()).toHaveLength(0);
    expect(api.captureCalls()[0].key).toBe("sk_trial_claimed");
    expect(out.trialNote).toBeUndefined(); // claimed keys get no trial header
  });

  it("ignores a saved key for a different base URL", async () => {
    writeTrialFile({ api_key: "sk_trial_staging", claim_url: CLAIM, expires_at: "", created_at: "", base_url: "https://staging.test" });
    const api = fakeApi({});
    await takeScreenshot({ fetch: api.fetch }).execute!({ url: "https://a.test" }, execOptions);
    expect(api.mintCalls()).toHaveLength(1);
    expect(api.captureCalls()[0].key).toBe("sk_trial_one");
  });

  it("ignores an unreadable trial file and mints", async () => {
    mkdirSync(join(home, ".snaprender"), { recursive: true });
    writeFileSync(trialFile(), "{not json");
    const api = fakeApi({});
    await takeScreenshot({ fetch: api.fetch }).execute!({ url: "https://a.test" }, execOptions);
    expect(api.mintCalls()).toHaveLength(1);
  });

  it("mints once for concurrent calls and shares the key across both tools", async () => {
    const api = fakeApi({
      capture: (call) =>
        call.url.endsWith("/v1/extract")
          ? new Response(JSON.stringify({ url: "https://a.test", type: "markdown", content: "# Hi" }), {
              headers: { "Content-Type": "application/json", "X-SnapRender-Trial": `remaining=97; claim=${CLAIM}` },
            })
          : shotResponse(),
    });
    const shot = takeScreenshot({ fetch: api.fetch });
    const extract = extractContent({ fetch: api.fetch });
    await Promise.all([
      shot.execute!({ url: "https://a.test" }, execOptions),
      shot.execute!({ url: "https://b.test" }, execOptions),
      extract.execute!({ url: "https://a.test" }, execOptions),
    ]);
    expect(api.mintCalls()).toHaveLength(1);
    expect(api.captureCalls().map((c) => c.key)).toEqual(["sk_trial_one", "sk_trial_one", "sk_trial_one"]);
  });

  it("works without a writable home directory (key kept in memory)", async () => {
    writeFileSync(join(home, ".snaprender"), "a file where the directory should be");
    const api = fakeApi({});
    const t = takeScreenshot({ fetch: api.fetch });
    await t.execute!({ url: "https://a.test" }, execOptions);
    await t.execute!({ url: "https://b.test" }, execOptions);
    expect(api.mintCalls()).toHaveLength(1);
    expect(api.captureCalls().map((c) => c.key)).toEqual(["sk_trial_one", "sk_trial_one"]);
  });

  it("puts the trial note in what the model sees, for both tools", async () => {
    const api = fakeApi({
      capture: (call) =>
        call.url.endsWith("/v1/extract")
          ? new Response(JSON.stringify({ url: "https://a.test", type: "markdown", content: "# Hi" }), {
              headers: { "Content-Type": "application/json", "X-SnapRender-Trial": `remaining=97; claim=${CLAIM}` },
            })
          : shotResponse(98),
    });
    const shot = takeScreenshot({ fetch: api.fetch });
    const shotOut = await shot.execute!({ url: "https://a.test" }, execOptions);
    const shotModel = (await shot.toModelOutput!({ toolCallId: "t1", input: { url: "https://a.test" }, output: shotOut as never })) as {
      value: Array<{ type: string; text?: string }>;
    };
    expect(shotModel.value[0].text).toContain(`Trial key: 98 captures left. Ask your human to claim it at ${CLAIM}`);
    expect(shotModel.value[1].type).toBe("file");

    const extract = extractContent({ fetch: api.fetch });
    const exOut = await extract.execute!({ url: "https://a.test" }, execOptions);
    const exModel = (await extract.toModelOutput!({ toolCallId: "t1", input: { url: "https://a.test" }, output: exOut as never })) as {
      value: string;
    };
    expect(exModel.value).toContain("# Hi");
    expect(exModel.value).toContain(`Trial key: 97 captures left. Ask your human to claim it at ${CLAIM}`);
  });

  it("reports TRIAL_EXPIRED with the claim link and keeps the key (claiming revives it)", async () => {
    writeTrialFile({ api_key: "sk_trial_old", claim_url: CLAIM, expires_at: "", created_at: "", base_url: API });
    const message = `This SnapRender trial key expired. Ask your human to claim it at ${CLAIM} (a free account, 200 captures a month): the same key then works again with no watermark.`;
    const api = fakeApi({ capture: () => errorResponse(401, "TRIAL_EXPIRED", message) });
    const err = (await Promise.resolve(
      takeScreenshot({ fetch: api.fetch }).execute!({ url: "https://a.test" }, execOptions),
    ).catch((e: unknown) => e)) as SnapRenderError;
    expect(err).toBeInstanceOf(SnapRenderError);
    expect(err.status).toBe(401);
    expect(err.code).toBe("TRIAL_EXPIRED");
    expect(err.message).toContain(CLAIM);
    expect(api.mintCalls()).toHaveLength(0);
    expect(api.captureCalls()).toHaveLength(1);
    expect(existsSync(trialFile())).toBe(true);
  });

  it("mints a new key once when the API no longer knows the saved one", async () => {
    writeTrialFile({ api_key: "sk_trial_gone", claim_url: CLAIM, expires_at: "", created_at: "", base_url: API });
    const api = fakeApi({
      mint: () => mintResponse("sk_trial_new"),
      capture: (call) => (call.key === "sk_trial_gone" ? errorResponse(401, "UNAUTHORIZED", "Invalid API key") : shotResponse()),
    });
    const out = (await takeScreenshot({ fetch: api.fetch }).execute!({ url: "https://a.test" }, execOptions)) as { image?: string };
    expect(out.image).toBeTruthy();
    expect(api.mintCalls()).toHaveLength(1);
    expect(api.captureCalls().map((c) => c.key)).toEqual(["sk_trial_gone", "sk_trial_new"]);
    expect(JSON.parse(readFileSync(trialFile(), "utf8")).api_key).toBe("sk_trial_new");
  });

  it("does not loop when a fresh key is also refused", async () => {
    const api = fakeApi({ capture: () => errorResponse(401, "UNAUTHORIZED", "Invalid API key") });
    await expect(
      takeScreenshot({ fetch: api.fetch }).execute!({ url: "https://a.test" }, execOptions),
    ).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    expect(api.mintCalls()).toHaveLength(2);
    expect(api.captureCalls()).toHaveLength(2);
  });

  it("explains a refused mint (429 AGENT_TRIAL_LIMIT) and does not ask again before Retry-After", async () => {
    const api = fakeApi({
      mint: () =>
        errorResponse(
          429,
          "AGENT_TRIAL_LIMIT",
          `This network already started 3 trial keys today. Ask your human to create a free account at ${API}/auth/signup (200 captures a month, no card) and use that key.`,
          { "Retry-After": "3600" },
        ),
    });
    const t = takeScreenshot({ fetch: api.fetch });
    const err = (await Promise.resolve(t.execute!({ url: "https://a.test" }, execOptions)).catch((e: unknown) => e)) as SnapRenderError;
    expect(err).toBeInstanceOf(SnapRenderError);
    expect(err.status).toBe(429);
    expect(err.code).toBe("AGENT_TRIAL_LIMIT");
    expect(err.message).toContain("create a free account");
    expect(err.message).toContain("SNAPRENDER_API_KEY");
    expect(err.retryAfterSeconds).toBe(3600);

    await expect(t.execute!({ url: "https://b.test" }, execOptions)).rejects.toMatchObject({ code: "AGENT_TRIAL_LIMIT" });
    expect(api.mintCalls()).toHaveLength(1);
    expect(api.captureCalls()).toHaveLength(0);
    expect(existsSync(trialFile())).toBe(false);
  });

  it("explains 503 AGENT_TRIAL_UNAVAILABLE and tries again on the next call when there is no Retry-After", async () => {
    const api = fakeApi({
      mint: (n) =>
        n === 1
          ? errorResponse(503, "AGENT_TRIAL_UNAVAILABLE", "Trial keys are not available right now. Ask your human to create a free account.")
          : mintResponse(),
    });
    const t = takeScreenshot({ fetch: api.fetch });
    await expect(t.execute!({ url: "https://a.test" }, execOptions)).rejects.toMatchObject({
      status: 503,
      code: "AGENT_TRIAL_UNAVAILABLE",
    });
    await t.execute!({ url: "https://a.test" }, execOptions);
    expect(api.mintCalls()).toHaveLength(2);
    expect(api.captureCalls()).toHaveLength(1);
  });

  it("explains a mint that cannot reach the API", async () => {
    const fetchFail = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(takeScreenshot({ fetch: fetchFail }).execute!({ url: "https://a.test" }, execOptions)).rejects.toMatchObject({
      code: "AGENT_TRIAL_UNAVAILABLE",
      message: expect.stringContaining("auth/signup"),
    });
  });

  it("passes on 429 TRIAL_LIMIT_REACHED without retrying", async () => {
    const api = fakeApi({
      capture: () =>
        errorResponse(429, "TRIAL_LIMIT_REACHED", `This trial key used its 30 captures for today. Claim it at ${CLAIM}.`, {
          "Retry-After": "5",
        }),
    });
    await expect(takeScreenshot({ fetch: api.fetch }).execute!({ url: "https://a.test" }, execOptions)).rejects.toMatchObject({
      status: 429,
      code: "TRIAL_LIMIT_REACHED",
      message: expect.stringContaining(CLAIM),
    });
    expect(api.captureCalls()).toHaveLength(1);
  });

  it("passes on 503 TRIAL_BUSY without retrying", async () => {
    const api = fakeApi({
      capture: () => errorResponse(503, "TRIAL_BUSY", `Trial captures are busy. Claim the key at ${CLAIM}.`, { "Retry-After": "30" }),
    });
    await expect(takeScreenshot({ fetch: api.fetch }).execute!({ url: "https://a.test" }, execOptions)).rejects.toMatchObject({
      status: 503,
      code: "TRIAL_BUSY",
    });
    expect(api.captureCalls()).toHaveLength(1);
  });
});

describe("explicit keys are unchanged", () => {
  beforeEach(() => {
    writeTrialFile({ api_key: "sk_trial_saved", claim_url: CLAIM, expires_at: "", created_at: "", base_url: API });
  });

  it("an apiKey option never mints or reads the trial file", async () => {
    const api = fakeApi({ capture: () => new Response(PNG, { headers: { "Content-Type": "image/jpeg" } }) });
    const out = (await takeScreenshot({ apiKey: "sk_live_mine", fetch: api.fetch }).execute!(
      { url: "https://a.test" },
      execOptions,
    )) as unknown as Record<string, unknown>;
    expect(api.mintCalls()).toHaveLength(0);
    expect(api.captureCalls()[0].key).toBe("sk_live_mine");
    expect("trialNote" in out).toBe(false);
  });

  it("SNAPRENDER_API_KEY wins over the trial", async () => {
    vi.stubEnv("SNAPRENDER_API_KEY", "sk_live_env");
    const api = fakeApi({ capture: () => new Response(PNG, { headers: { "Content-Type": "image/jpeg" } }) });
    await Promise.resolve(extractContent({ fetch: api.fetch }).execute!({ url: "https://a.test" }, execOptions)).catch(() => {});
    expect(api.mintCalls()).toHaveLength(0);
    expect(api.captureCalls()[0].key).toBe("sk_live_env");
  });

  it("getApiKey wins over the trial", async () => {
    const api = fakeApi({ capture: () => new Response(PNG, { headers: { "Content-Type": "image/jpeg" } }) });
    await takeScreenshot({ fetch: api.fetch, getApiKey: () => "sk_live_provider" }).execute!({ url: "https://a.test" }, execOptions);
    expect(api.mintCalls()).toHaveLength(0);
    expect(api.captureCalls()[0].key).toBe("sk_live_provider");
  });

  it("a 401 on an explicit key is passed on, never reminted", async () => {
    const api = fakeApi({ capture: () => errorResponse(401, "UNAUTHORIZED", "Invalid API key") });
    await expect(
      takeScreenshot({ apiKey: "sk_live_bad", fetch: api.fetch }).execute!({ url: "https://a.test" }, execOptions),
    ).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    expect(api.mintCalls()).toHaveLength(0);
    expect(api.captureCalls()).toHaveLength(1);
  });

  it("trial: false throws MISSING_API_KEY without any request", async () => {
    const api = fakeApi({});
    await expect(takeScreenshot({ fetch: api.fetch, trial: false }).execute!({ url: "https://a.test" }, execOptions)).rejects.toMatchObject({
      code: "MISSING_API_KEY",
    });
    expect(api.calls).toHaveLength(0);
  });
});
