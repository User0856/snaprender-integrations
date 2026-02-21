import { StructuredTool } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";
import { z } from "zod";
import SnapRender from "snaprender";

function getClient(apiKey?: string): SnapRender {
	const key = apiKey ?? process.env.SNAPRENDER_API_KEY;
	if (!key) {
		throw new Error(
			"SNAPRENDER_API_KEY environment variable is required. " +
				"Get a free key at https://app.snap-render.com/auth/signup",
		);
	}
	return new SnapRender({ apiKey: key });
}

// --- Screenshot Tool ---

const screenshotSchema = z.object({
	url: z.string().describe("URL to capture (must start with http:// or https://)"),
	format: z
		.enum(["png", "jpeg", "webp", "pdf"])
		.optional()
		.default("png")
		.describe("Output format"),
	full_page: z
		.boolean()
		.optional()
		.default(false)
		.describe("Capture entire scrollable page"),
	dark_mode: z
		.boolean()
		.optional()
		.default(false)
		.describe("Enable dark mode CSS emulation"),
	block_ads: z
		.boolean()
		.optional()
		.default(true)
		.describe("Block advertisements"),
	block_cookie_banners: z
		.boolean()
		.optional()
		.default(true)
		.describe("Remove cookie consent banners"),
	device: z
		.enum(["iphone_14", "iphone_15_pro", "pixel_7", "ipad_pro", "macbook_pro"])
		.optional()
		.describe("Device preset for viewport emulation"),
	width: z.number().optional().describe("Viewport width in pixels (320-3840)"),
	height: z.number().optional().describe("Viewport height in pixels (200-10000)"),
});

export interface SnapRenderToolParams {
	apiKey?: string;
}

export class SnapRenderScreenshot extends StructuredTool {
	static lc_name() {
		return "SnapRenderScreenshot";
	}

	name = "take_screenshot";

	description =
		"Capture a screenshot of any website as PNG, JPEG, WebP, or PDF. " +
		"Supports device emulation, dark mode, ad blocking, and full-page capture.";

	schema = screenshotSchema;

	private apiKey?: string;

	constructor(params: SnapRenderToolParams = {}) {
		super();
		this.apiKey = params.apiKey;
	}

	async _call(
		input: z.output<typeof screenshotSchema>,
		_runManager?: CallbackManagerForToolRun,
	): Promise<string> {
		const client = getClient(this.apiKey);
		const result = await client.capture({
			url: input.url,
			format: input.format,
			fullPage: input.full_page,
			darkMode: input.dark_mode,
			blockAds: input.block_ads,
			blockCookieBanners: input.block_cookie_banners,
			device: input.device,
			width: input.width,
			height: input.height,
			responseType: "json",
		});

		return [
			`URL: ${result.url}`,
			`Format: ${result.format}`,
			`Size: ${result.size.toLocaleString()} bytes`,
			`Dimensions: ${result.width}x${result.height}`,
			`Cache: ${result.cache}`,
			`Response time: ${result.responseTime}`,
			`Remaining credits: ${result.remainingCredits}`,
			`Image: data:image/${result.format};base64,${result.image.split(",").pop()}`,
		].join("\n");
	}
}

// --- Cache Check Tool ---

const cacheSchema = z.object({
	url: z.string().describe("URL to check"),
	format: z
		.enum(["png", "jpeg", "webp", "pdf"])
		.optional()
		.default("png")
		.describe("Output format"),
});

export class SnapRenderCacheCheck extends StructuredTool {
	static lc_name() {
		return "SnapRenderCacheCheck";
	}

	name = "check_screenshot_cache";

	description =
		"Check if a screenshot is already cached without capturing a new one. " +
		"Free, does not count against quota.";

	schema = cacheSchema;

	private apiKey?: string;

	constructor(params: SnapRenderToolParams = {}) {
		super();
		this.apiKey = params.apiKey;
	}

	async _call(
		input: z.output<typeof cacheSchema>,
		_runManager?: CallbackManagerForToolRun,
	): Promise<string> {
		const client = getClient(this.apiKey);
		const info = await client.info({ url: input.url, format: input.format });

		if (info.cached) {
			return [
				`Cached: YES`,
				`URL: ${info.url}`,
				`Cached at: ${info.cachedAt ?? "unknown"}`,
				`Expires at: ${info.expiresAt ?? "unknown"}`,
				`Content type: ${info.contentType ?? "unknown"}`,
			].join("\n");
		}
		return `Cached: NO\nURL: ${info.url}`;
	}
}

// --- Usage Tool ---

const usageSchema = z.object({});

export class SnapRenderUsage extends StructuredTool {
	static lc_name() {
		return "SnapRenderUsage";
	}

	name = "get_screenshot_usage";

	description =
		"Get current month's screenshot usage statistics including plan, used, limit, and remaining credits.";

	schema = usageSchema;

	private apiKey?: string;

	constructor(params: SnapRenderToolParams = {}) {
		super();
		this.apiKey = params.apiKey;
	}

	async _call(
		_input: z.output<typeof usageSchema>,
		_runManager?: CallbackManagerForToolRun,
	): Promise<string> {
		const client = getClient(this.apiKey);
		const usage = await client.usage();

		return [
			`Plan: ${usage.plan}`,
			`Used: ${usage.used}`,
			`Limit: ${usage.limit}`,
			`Remaining: ${usage.remaining}`,
			`Period: ${usage.period.start} to ${usage.period.end}`,
		].join("\n");
	}
}
