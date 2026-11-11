// Live tests against the real API. They run only when a key is in the
// environment (SNAPRENDER_TEST_KEY or SNAPRENDER_API_KEY) and use about 12 captures.
import { describe, expect, it } from "vitest";
import { DEVICES, extractContent, SnapRenderError, takeScreenshot } from "../src/index.js";
import type { ScreenshotResult } from "../src/index.js";

const apiKey = process.env.SNAPRENDER_TEST_KEY || process.env.SNAPRENDER_API_KEY;
const opts = { toolCallId: "live", messages: [], context: {} } as never;
const run = describe.skipIf(!apiKey);

// The free plan allows 10 requests a minute: space requests 6.5 s apart.
let last = 0;
const pacedFetch: typeof fetch = async (input, init) => {
  const wait = last + 6500 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  return fetch(input, init);
};

run("live API", { timeout: 120_000 }, () => {
  const shot = takeScreenshot({ apiKey, fetch: pacedFetch });
  const extract = extractContent({ apiKey, fetch: pacedFetch });

  it("captures a page as jpeg and returns it as an image part", async () => {
    const out = (await shot.execute!({ url: "https://example.com" }, opts)) as ScreenshotResult;
    expect(out.mediaType).toBe("image/jpeg");
    expect(out.width).toBe(2560); // 1280 css px at 2x
    expect(out.height).toBe(1600);
    expect(out.bytes).toBeGreaterThan(10_000);
    expect(out.image).toBeTruthy();
    expect(typeof out.remainingCredits).toBe("number");
    const model = (await shot.toModelOutput!({ toolCallId: "x", input: { url: "https://example.com" }, output: out })) as {
      type: string;
      value: Array<{ type: string; mediaType?: string }>;
    };
    expect(model.type).toBe("content");
    expect(model.value[1]).toMatchObject({ type: "file", mediaType: "image/jpeg" });
  });

  it("captures png and webp with the right media types", async () => {
    const png = (await shot.execute!({ url: "https://example.com", format: "png", width: 800, height: 600 }, opts)) as ScreenshotResult;
    expect(png.mediaType).toBe("image/png");
    expect(png.width).toBe(1600);
    const webp = (await shot.execute!({ url: "https://example.com", format: "webp", quality: 60 }, opts)) as ScreenshotResult;
    expect(webp.mediaType).toBe("image/webp");
    expect(webp.width).toBe(2560);
  });

  it("renders raw html", async () => {
    const out = (await shot.execute!(
      { html: "<h1 style='font:48px sans-serif'>Hello from the AI SDK</h1>", width: 640, height: 360 },
      opts,
    )) as ScreenshotResult;
    expect(out.source).toBe("html");
    expect(out.image).toBeTruthy();
  });

  it("accepts every device preset in the schema", { timeout: 300_000 }, async () => {
    for (const device of DEVICES) {
      const out = (await shot.execute!({ url: "https://example.com", device }, opts)) as ScreenshotResult;
      expect(out.image, device).toBeTruthy();
      expect(out.width, device).toBeGreaterThan(0);
    }
  });

  it("captures a full page with dark mode, hidden selectors and ad blocking options", async () => {
    const out = (await shot.execute!(
      {
        url: "https://example.com",
        full_page: true,
        lazy_load: true,
        dark_mode: true,
        hide_selectors: "p",
        block_ads: true,
        block_cookie_banners: true,
        delay: 200,
      },
      opts,
    )) as ScreenshotResult;
    expect(out.image).toBeTruthy();
  });

  it("returns the API's reason for an unreachable site", async () => {
    const err = (await Promise.resolve(
      shot.execute!({ url: "https://nonexistent-domain-snaprender-test-123.com" }, opts),
    ).catch((e: unknown) => e)) as SnapRenderError;
    expect(err).toBeInstanceOf(SnapRenderError);
    expect(err.code).toBe("TARGET_UNREACHABLE");
  });

  it("rejects a bad key with 401", async () => {
    const err = (await Promise.resolve(
      takeScreenshot({ apiKey: "sk_live_invalid", fetch: pacedFetch }).execute!({ url: "https://example.com" }, opts),
    ).catch((e: unknown) => e)) as SnapRenderError;
    expect(err.status).toBe(401);
  });

  it("extracts markdown and links", async () => {
    const md = await extract.execute!({ url: "https://example.com", max_length: 5000 }, opts);
    expect(md).toMatchObject({ type: "markdown" });
    expect(String((md as { content: string }).content)).toContain("documentation examples");
    const links = await extract.execute!({ url: "https://example.com", type: "links" }, opts);
    expect(Array.isArray((links as { content: unknown }).content)).toBe(true);
    const meta = await extract.execute!({ url: "https://example.com", type: "metadata" }, opts);
    expect((meta as { type: string }).type).toBe("metadata");
  });
});
