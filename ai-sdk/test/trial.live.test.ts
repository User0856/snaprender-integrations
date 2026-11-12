// Live agent-trial smoke test against production. It mints ONE real trial key
// (there is a small per-network daily cap), so it runs only when
// SNAPRENDER_LIVE_TRIAL=1. The key is saved under SNAPRENDER_TRIAL_HOME (or a
// fresh temp directory), never in your real ~/.snaprender.
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { takeScreenshot, type ScreenshotResult } from "../src/index.js";
import { getTrialKey, resetTrialState } from "../src/trial.js";

const run = describe.skipIf(process.env.SNAPRENDER_LIVE_TRIAL !== "1");
const opts = { toolCallId: "live", messages: [], context: {} } as never;

run("live agent trial", { timeout: 180_000 }, () => {
  it("mints one trial key, captures a watermarked page with it, and saves it for reuse", async () => {
    const home = process.env.SNAPRENDER_TRIAL_HOME || mkdtempSync(join(tmpdir(), "snaprender-live-trial-"));
    vi.stubEnv("HOME", home);
    vi.stubEnv("SNAPRENDER_API_KEY", "");
    resetTrialState();

    const urls: string[] = [];
    const countingFetch: typeof fetch = (input, init) => {
      urls.push(String(input));
      return fetch(input, init);
    };

    const shot = takeScreenshot({ fetch: countingFetch, trialAgent: "snaprender-ai-sdk-ci" });
    const out = (await shot.execute!({ url: "https://example.com" }, opts)) as ScreenshotResult;

    expect(urls.filter((u) => u.endsWith("/v1/agent-trial"))).toHaveLength(1);
    expect(out.image).toBeTruthy();
    expect(out.bytes).toBeGreaterThan(5_000);
    expect(out.trialNote).toMatch(/Trial key: \d+ captures left\. Ask your human to claim it at https:\/\//);

    const file = join(home, ".snaprender", "trial.json");
    const saved = JSON.parse(readFileSync(file, "utf8"));
    expect(saved.api_key).toMatch(/^sk_trial_/);
    expect(saved.base_url).toBe("https://app.snap-render.com");
    expect(saved.claim_url).toMatch(/^https:\/\//);
    expect(statSync(file).mode & 0o777).toBe(0o600);

    // A fresh process would reuse the saved key: no second mint.
    resetTrialState();
    const noNetwork = (() => {
      throw new Error("unexpected request");
    }) as unknown as typeof fetch;
    const again = await getTrialKey({ baseUrl: "https://app.snap-render.com", fetch: noNetwork, agent: "x", timeoutMs: 1000 });
    expect(again.api_key).toBe(saved.api_key);

    console.log(`trial home: ${home}; claim: ${saved.claim_url}; note: ${out.trialNote?.split("\n").pop()}`);
    vi.unstubAllEnvs();
  });
});
