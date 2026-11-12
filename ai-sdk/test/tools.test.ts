import { generateText, isStepCount } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { extractContent, snaprenderTools, SnapRenderError, takeScreenshot } from "../src/index.js";
import { imageSize } from "../src/image.js";

// 1x1 PNG
const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);

function pngOfSize(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = PNG.slice();
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

type Call = { url: string; init: RequestInit };

function mockFetch(respond: (call: Call) => Response) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    return respond(call);
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

const execOptions = { toolCallId: "t1", messages: [], context: {} } as never;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("takeScreenshot", () => {
  it("posts the input with jpeg defaults and the API key header", async () => {
    const { fetch, calls } = mockFetch(
      () =>
        new Response(PNG, {
          headers: { "Content-Type": "image/jpeg", "X-Cache": "MISS", "X-Remaining-Credits": "42" },
        }),
    );
    const t = takeScreenshot({ apiKey: "sk_test_1", fetch });
    const out = await t.execute!({ url: "https://example.com", full_page: true, device: "iphone_14" }, execOptions);

    expect(calls[0].url).toBe("https://app.snap-render.com/v1/screenshot");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["X-API-Key"]).toBe("sk_test_1");
    expect(headers["User-Agent"]).toMatch(/^snaprender-ai-sdk\//);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      url: "https://example.com",
      full_page: true,
      device: "iphone_14",
      format: "jpeg",
      quality: 80,
      response_type: "binary",
    });
    expect(out).toMatchObject({
      source: "https://example.com",
      mediaType: "image/jpeg",
      width: 1,
      height: 1,
      cache: "MISS",
      remainingCredits: 42,
    });
    expect((out as { image: string }).image).toBe(Buffer.from(PNG).toString("base64"));
  });

  it("does not send quality for png", async () => {
    const { fetch, calls } = mockFetch(() => new Response(PNG, { headers: { "Content-Type": "image/png" } }));
    await takeScreenshot({ apiKey: "k", fetch }).execute!({ url: "https://a.test", format: "png" }, execOptions);
    expect(JSON.parse(String(calls[0].init.body)).quality).toBeUndefined();
  });

  it("reads SNAPRENDER_API_KEY from the environment", async () => {
    vi.stubEnv("SNAPRENDER_API_KEY", "sk_env");
    const { fetch, calls } = mockFetch(() => new Response(PNG));
    await takeScreenshot({ fetch }).execute!({ url: "https://a.test" }, execOptions);
    expect((calls[0].init.headers as Record<string, string>)["X-API-Key"]).toBe("sk_env");
  });

  it("uses a custom key provider when given", async () => {
    vi.stubEnv("SNAPRENDER_API_KEY", "");
    const { fetch, calls } = mockFetch(() => new Response(PNG));
    await takeScreenshot({ fetch, getApiKey: async () => "sk_provider" }).execute!(
      { url: "https://a.test" },
      execOptions,
    );
    expect((calls[0].init.headers as Record<string, string>)["X-API-Key"]).toBe("sk_provider");
  });

  it("explains how to get a key when none is set and the trial is off", async () => {
    vi.stubEnv("SNAPRENDER_API_KEY", "");
    const { fetch, calls } = mockFetch(() => new Response(PNG));
    await expect(takeScreenshot({ fetch, trial: false }).execute!({ url: "https://a.test" }, execOptions)).rejects.toThrow(
      /SNAPRENDER_API_KEY.*200 captures a month/,
    );
    expect(calls).toHaveLength(0);
  });

  it("surfaces the API error code and message", async () => {
    const { fetch } = mockFetch(
      () =>
        new Response(
          JSON.stringify({ error: { code: "TARGET_UNREACHABLE", message: "The target website could not be reached." } }),
          { status: 422, headers: { "Content-Type": "application/json" } },
        ),
    );
    const err = await Promise.resolve(
      takeScreenshot({ apiKey: "k", fetch }).execute!({ url: "https://nope.test" }, execOptions),
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SnapRenderError);
    expect((err as SnapRenderError).code).toBe("TARGET_UNREACHABLE");
    expect((err as SnapRenderError).status).toBe(422);
    expect((err as Error).message).toContain("could not be reached");
  });

  it("keeps Retry-After on rate limits", async () => {
    const { fetch } = mockFetch(
      () =>
        new Response(JSON.stringify({ error: { code: "RATE_LIMITED", message: "Slow down." } }), {
          status: 429,
          headers: { "Retry-After": "7" },
        }),
    );
    const err = (await Promise.resolve(
      takeScreenshot({ apiKey: "k", fetch, maxRetries: 0 }).execute!({ url: "https://a.test" }, execOptions),
    ).catch((e: unknown) => e)) as SnapRenderError;
    expect(err.retryAfterSeconds).toBe(7);
  });

  it("retries once after a per-minute rate limit", async () => {
    let n = 0;
    const { fetch, calls } = mockFetch(() =>
      n++ === 0
        ? new Response(JSON.stringify({ error: { code: "RATE_LIMITED", message: "Slow down." } }), {
            status: 429,
            headers: { "Retry-After": "1" },
          })
        : new Response(PNG),
    );
    const out = await takeScreenshot({ apiKey: "k", fetch }).execute!({ url: "https://a.test" }, execOptions);
    expect(calls).toHaveLength(2);
    expect((out as { image?: string }).image).toBeTruthy();
  });

  it("never retries a monthly quota error", async () => {
    const { fetch, calls } = mockFetch(
      () =>
        new Response(JSON.stringify({ error: { code: "QUOTA_EXCEEDED", message: "Monthly limit reached." } }), {
          status: 429,
          headers: { "Retry-After": "1" },
        }),
    );
    await expect(
      takeScreenshot({ apiKey: "k", fetch }).execute!({ url: "https://a.test" }, execOptions),
    ).rejects.toThrow(/QUOTA_EXCEEDED/);
    expect(calls).toHaveLength(1);
  });

  it("handles non-JSON error bodies", async () => {
    const { fetch } = mockFetch(() => new Response("error code: 502", { status: 502, statusText: "Bad Gateway" }));
    await expect(
      takeScreenshot({ apiKey: "k", fetch }).execute!({ url: "https://a.test" }, execOptions),
    ).rejects.toThrow(/SnapRender 502 HTTP_502/);
  });

  it("leaves out images that are too tall for the model and says why", async () => {
    const { fetch } = mockFetch(() => new Response(pngOfSize(2560, 16000), { headers: { "Content-Type": "image/png" } }));
    const out = (await takeScreenshot({ apiKey: "k", fetch }).execute!(
      { url: "https://a.test", full_page: true },
      execOptions,
    )) as { image?: string; note?: string };
    expect(out.image).toBeUndefined();
    expect(out.note).toContain("2560x16000");
  });

  it("leaves out images over the byte limit", async () => {
    const { fetch } = mockFetch(() => new Response(PNG));
    const out = (await takeScreenshot({ apiKey: "k", fetch, maxImageBytes: 10 }).execute!(
      { url: "https://a.test" },
      execOptions,
    )) as { image?: string; note?: string };
    expect(out.image).toBeUndefined();
    expect(out.note).toContain("byte limit");
  });

  it("accepts html instead of url and rejects both or neither", async () => {
    const schema = takeScreenshot().inputSchema as unknown as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema.safeParse({ html: "<h1>Hi</h1>" }).success).toBe(true);
    expect(schema.safeParse({ url: "https://a.test", html: "<p>" }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ url: "https://a.test", device: "nokia_3310" }).success).toBe(false);
  });

  it("uses a custom base URL", async () => {
    const { fetch, calls } = mockFetch(() => new Response(PNG));
    await takeScreenshot({ apiKey: "k", fetch, baseUrl: "http://127.0.0.1:3001/" }).execute!(
      { url: "https://a.test" },
      execOptions,
    );
    expect(calls[0].url).toBe("http://127.0.0.1:3001/v1/screenshot");
  });
});

describe("extractContent", () => {
  it("posts to /v1/extract and formats markdown for the model", async () => {
    const { fetch, calls } = mockFetch(
      () =>
        new Response(
          JSON.stringify({ url: "https://a.test", type: "markdown", content: "# Hello", wordCount: 1, processingTimeMs: 900 }),
          { headers: { "Content-Type": "application/json" } },
        ),
    );
    const t = extractContent({ apiKey: "k", fetch });
    const out = await t.execute!({ url: "https://a.test", selector: "main" }, execOptions);
    expect(calls[0].url).toBe("https://app.snap-render.com/v1/extract");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ url: "https://a.test", selector: "main" });
    const model = await t.toModelOutput!({ toolCallId: "t1", input: { url: "https://a.test" }, output: out as never });
    expect(model).toEqual({ type: "text", value: "# Hello\n\n---\nSource: https://a.test (type markdown, 1 words)" });
  });

  it("serializes links as JSON text", async () => {
    const { fetch } = mockFetch(
      () => new Response(JSON.stringify({ url: "https://a.test", type: "links", content: [{ href: "https://b.test", text: "B" }] })),
    );
    const t = extractContent({ apiKey: "k", fetch });
    const out = await t.execute!({ url: "https://a.test", type: "links" }, execOptions);
    const model = (await t.toModelOutput!({ toolCallId: "t1", input: { url: "https://a.test" }, output: out as never })) as {
      value: string;
    };
    expect(model.value).toContain('"href": "https://b.test"');
  });
});

describe("imageSize", () => {
  it("reads PNG dimensions", () => {
    expect(imageSize(pngOfSize(1280, 800))).toEqual({ width: 1280, height: 800 });
  });
  it("returns undefined for unknown bytes", () => {
    expect(imageSize(new Uint8Array([1, 2, 3]))).toBeUndefined();
  });
});

describe("inside generateText", () => {
  it("sends the screenshot to the model as an image file part", async () => {
    const { fetch } = mockFetch(() => new Response(PNG, { headers: { "Content-Type": "image/png" } }));
    const usage = {
      inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 1, text: 1, reasoning: 0 },
    };
    const model = new MockLanguageModelV4({
      doGenerate: [
        {
          content: [
            {
              type: "tool-call",
              toolCallId: "call-1",
              toolName: "takeScreenshot",
              input: JSON.stringify({ url: "https://example.com", format: "png" }),
            },
          ],
          finishReason: { unified: "tool-calls", raw: "tool_use" },
          usage,
          warnings: [],
        },
        {
          content: [{ type: "text", text: "It shows Example Domain." }],
          finishReason: { unified: "stop", raw: "end_turn" },
          usage,
          warnings: [],
        },
      ],
    });

    const result = await generateText({
      model,
      prompt: "What does example.com show?",
      tools: snaprenderTools({ apiKey: "k", fetch }),
      stopWhen: isStepCount(3),
    });

    expect(result.text).toBe("It shows Example Domain.");
    const secondCall = model.doGenerateCalls[1];
    const toolMessage = secondCall.prompt.find((m) => m.role === "tool");
    const part = (toolMessage!.content as Array<{ type: string; output?: unknown }>).find((p) => p.type === "tool-result");
    const output = part!.output as { type: string; value: Array<Record<string, unknown>> };
    expect(output.type).toBe("content");
    expect(output.value[0]).toMatchObject({ type: "text" });
    expect(output.value[1]).toMatchObject({ type: "file", mediaType: "image/png" });
  });
});
