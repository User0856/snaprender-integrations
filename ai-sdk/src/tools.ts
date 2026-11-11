import { tool, type Tool } from "ai";
import { z } from "zod/v4";
import { compact, snaprenderRequest, type SnapRenderOptions } from "./client.js";
import { imageSize, toBase64 } from "./image.js";

export const DEVICES = ["iphone_14", "iphone_15_pro", "pixel_7", "ipad_pro", "macbook_pro"] as const;
export const EXTRACT_TYPES = ["markdown", "text", "html", "article", "links", "metadata"] as const;

export interface ScreenshotToolOptions extends SnapRenderOptions {
  /**
   * Largest image (in bytes) sent to the model. Bigger captures come back as a
   * text note instead, so one tall page cannot break the request. Default 5 MB.
   */
  maxImageBytes?: number;
  /**
   * Largest width or height (in pixels) sent to the model. Default 8000, the
   * limit several vision models enforce. Captures render at 2x device scale,
   * so a 1280 px wide viewport is 2560 px wide in the file.
   */
  maxImageDimension?: number;
}

const screenshotInput = z
  .object({
    url: z
      .string()
      .describe("Public http or https URL to capture. Use this or html, not both.")
      .optional(),
    html: z
      .string()
      .describe("Raw HTML to render instead of a URL (max 2 MB). Use this or url, not both.")
      .optional(),
    format: z
      .enum(["jpeg", "png", "webp"])
      .describe("Image format. Default jpeg (smallest file for the model).")
      .optional(),
    full_page: z
      .boolean()
      .describe("Capture the whole scrollable page instead of the first screen. Default false.")
      .optional(),
    lazy_load: z
      .boolean()
      .describe("With full_page, scroll first so lazy-loaded images below the fold appear. Slower.")
      .optional(),
    device: z
      .enum(DEVICES)
      .describe("Emulate a phone, tablet or laptop (viewport, user agent, scale). Omit for desktop.")
      .optional(),
    width: z.number().int().min(320).max(3840).describe("Viewport width in CSS pixels. Default 1280.").optional(),
    height: z.number().int().min(200).max(10000).describe("Viewport height in CSS pixels. Default 800.").optional(),
    dark_mode: z.boolean().describe("Emulate prefers-color-scheme: dark.").optional(),
    delay: z
      .number()
      .int()
      .min(0)
      .max(10000)
      .describe("Extra wait in milliseconds after load, for animations or late content.")
      .optional(),
    quality: z.number().int().min(1).max(100).describe("JPEG or WebP quality, 1-100.").optional(),
    hide_selectors: z
      .string()
      .describe("Comma-separated CSS selectors to hide before capture, e.g. '.chat-widget,#promo'.")
      .optional(),
    click_selector: z.string().describe("CSS selector to click before capture, e.g. to open a tab.").optional(),
    block_ads: z.boolean().describe("Block ads and trackers. Default true.").optional(),
    block_cookie_banners: z.boolean().describe("Remove cookie consent banners. Default true.").optional(),
    cache: z
      .boolean()
      .describe("Accept a cached copy from the last 24 hours (free). Default false: render now.")
      .optional(),
  })
  .refine((v) => Boolean(v.url) !== Boolean(v.html), {
    message: "Pass exactly one of url or html.",
  });

export type ScreenshotInput = z.infer<typeof screenshotInput>;

export interface ScreenshotResult {
  /** The page that was captured (or "html" for raw HTML). */
  source: string;
  mediaType: string;
  bytes: number;
  width?: number;
  height?: number;
  /** HIT when served from cache (free), MISS when rendered now. */
  cache: string;
  responseTime?: string;
  remainingCredits?: number;
  /** Base64 image data. Absent when the image was too large to send to the model. */
  image?: string;
  /** Why the image was left out, when it was. */
  note?: string;
}

const MEDIA_TYPES: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * AI SDK tool that captures a web page (or raw HTML) in a real browser and
 * returns the image to the model, so it can see the page.
 */
export function takeScreenshot(options: ScreenshotToolOptions = {}): Tool<ScreenshotInput, ScreenshotResult> {
  const maxBytes = options.maxImageBytes ?? 5_000_000;
  const maxDimension = options.maxImageDimension ?? 8000;

  return tool({
    description:
      "Capture a screenshot of a public web page (or raw HTML) in a real Chrome browser and look at it. " +
      "Use it to check layout, visuals, a phone view (device) or a whole page (full_page). " +
      "Ads and cookie banners are removed by default. Cannot reach localhost, private networks or pages behind a login.",
    inputSchema: screenshotInput,
    execute: async (input, { abortSignal }): Promise<ScreenshotResult> => {
      const format = input.format ?? "jpeg";
      const body = compact({
        ...input,
        format,
        quality: input.quality ?? (format === "png" ? undefined : 80),
        response_type: "binary",
      });
      const { response, bytes } = await snaprenderRequest(options, "/v1/screenshot", body, abortSignal);

      const mediaType = response.headers.get("Content-Type")?.split(";")[0] || MEDIA_TYPES[format];
      const size = imageSize(bytes);
      const remaining = Number(response.headers.get("X-Remaining-Credits"));
      const result: ScreenshotResult = {
        source: input.url ?? "html",
        mediaType,
        bytes: bytes.byteLength,
        width: size?.width,
        height: size?.height,
        cache: response.headers.get("X-Cache") ?? "MISS",
        responseTime: response.headers.get("X-Response-Time") ?? undefined,
        remainingCredits: Number.isFinite(remaining) ? remaining : undefined,
      };

      if (bytes.byteLength > maxBytes) {
        result.note = `Image is ${bytes.byteLength} bytes, over the ${maxBytes} byte limit for the model. Try full_page false, a smaller viewport, or format jpeg with lower quality.`;
      } else if (size && Math.max(size.width, size.height) > maxDimension) {
        result.note = `Image is ${size.width}x${size.height} px, over the ${maxDimension} px limit for the model. Try full_page false or a shorter viewport.`;
      } else {
        result.image = toBase64(bytes);
      }
      return result;
    },
    toModelOutput: ({ output }) => {
      const summary =
        `Screenshot of ${output.source}` +
        (output.width ? ` (${output.width}x${output.height} px` : " (") +
        `, ${output.bytes} bytes, cache ${output.cache}` +
        (output.remainingCredits !== undefined ? `, ${output.remainingCredits} captures left this period` : "") +
        ")." +
        (output.note ? ` ${output.note}` : "");
      if (!output.image) return { type: "text", value: summary };
      return {
        type: "content",
        value: [
          { type: "text", text: summary },
          { type: "file", mediaType: output.mediaType, data: { type: "data", data: output.image } },
        ],
      };
    },
  });
}

const extractInput = z.object({
  url: z.string().describe("Public http or https URL to read."),
  type: z
    .enum(EXTRACT_TYPES)
    .describe(
      "What to return: markdown (default, full page), article (main text only), text, html, links (list of links) or metadata (title, description, Open Graph).",
    )
    .optional(),
  selector: z.string().describe("CSS selector to read only part of the page, e.g. 'main' or '#pricing'.").optional(),
  max_length: z
    .number()
    .int()
    .min(1)
    .max(500000)
    .describe("Maximum characters to return. Default 100000.")
    .optional(),
  delay: z.number().int().min(0).max(10000).describe("Extra wait in milliseconds after load.").optional(),
  block_ads: z.boolean().describe("Block ads and trackers. Default true.").optional(),
  block_cookie_banners: z.boolean().describe("Remove cookie consent banners. Default true.").optional(),
  cache: z.boolean().describe("Accept a cached result from the last 24 hours. Default false.").optional(),
});

export type ExtractInput = z.infer<typeof extractInput>;

export interface ExtractResult {
  url: string;
  type: string;
  /** A string for markdown, text, html and article; JSON for links and metadata. */
  content: unknown;
  wordCount?: number;
  processingTimeMs?: number;
}

/**
 * AI SDK tool that renders a page in a real browser (JavaScript runs) and
 * returns its content as markdown, text, links or metadata.
 */
export function extractContent(options: SnapRenderOptions = {}): Tool<ExtractInput, ExtractResult> {
  return tool({
    description:
      "Read a public web page after it renders in a real browser (JavaScript runs, cookie banners removed) " +
      "and return its content as markdown, main article text, plain text, links or metadata. " +
      "Use it to read pages that plain HTTP fetches get wrong.",
    inputSchema: extractInput,
    execute: async (input, { abortSignal }): Promise<ExtractResult> => {
      const { bytes } = await snaprenderRequest(options, "/v1/extract", compact({ ...input }), abortSignal);
      return JSON.parse(new TextDecoder().decode(bytes)) as ExtractResult;
    },
    toModelOutput: ({ output }) => {
      const content =
        typeof output.content === "string" ? output.content : JSON.stringify(output.content, null, 2);
      const meta = [`type ${output.type}`];
      if (output.wordCount) meta.push(`${output.wordCount} words`);
      return { type: "text", value: `${content}\n\n---\nSource: ${output.url} (${meta.join(", ")})` };
    },
  });
}

/** Both SnapRender tools, ready to pass as `tools` to generateText, streamText or an Agent. */
export function snaprenderTools(options: ScreenshotToolOptions = {}) {
  return {
    takeScreenshot: takeScreenshot(options),
    extractContent: extractContent(options),
  };
}
