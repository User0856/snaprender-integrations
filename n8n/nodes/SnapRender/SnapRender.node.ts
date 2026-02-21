import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

export class SnapRender implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SnapRender',
		name: 'snapRender',
		icon: 'file:snaprender.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Capture website screenshots as PNG, JPEG, WebP, or PDF',
		defaults: { name: 'SnapRender' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'snapRenderApi',
				required: true,
			},
		],
		requestDefaults: {
			baseURL: 'https://app.snap-render.com',
		},
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Take Screenshot',
						value: 'screenshot',
						description: 'Capture a screenshot of a website',
						action: 'Capture a screenshot of a website',
					},
					{
						name: 'Check Cache',
						value: 'checkCache',
						description: 'Check if a screenshot is cached (free, no quota cost)',
						action: 'Check if a screenshot is cached',
					},
					{
						name: 'Get Usage',
						value: 'getUsage',
						description: 'Get current month screenshot usage statistics',
						action: 'Get usage statistics',
					},
				],
				default: 'screenshot',
			},

			// --- Screenshot & Cache Check params ---
			{
				displayName: 'URL',
				name: 'url',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'https://example.com',
				description: 'URL of the website to capture',
				displayOptions: {
					show: { operation: ['screenshot', 'checkCache'] },
				},
			},
			{
				displayName: 'Format',
				name: 'format',
				type: 'options',
				options: [
					{ name: 'PNG', value: 'png' },
					{ name: 'JPEG', value: 'jpeg' },
					{ name: 'WebP', value: 'webp' },
					{ name: 'PDF', value: 'pdf' },
				],
				default: 'png',
				description: 'Output image format',
				displayOptions: {
					show: { operation: ['screenshot', 'checkCache'] },
				},
			},

			// --- Screenshot-only params ---
			{
				displayName: 'Full Page',
				name: 'fullPage',
				type: 'boolean',
				default: false,
				description: 'Whether to capture the entire scrollable page',
				displayOptions: { show: { operation: ['screenshot'] } },
			},
			{
				displayName: 'Device',
				name: 'device',
				type: 'options',
				options: [
					{ name: 'Desktop (Default)', value: '' },
					{ name: 'iPhone 14', value: 'iphone_14' },
					{ name: 'iPhone 15 Pro', value: 'iphone_15_pro' },
					{ name: 'Pixel 7', value: 'pixel_7' },
					{ name: 'iPad Pro', value: 'ipad_pro' },
					{ name: 'MacBook Pro', value: 'macbook_pro' },
				],
				default: '',
				description: 'Device preset for viewport emulation',
				displayOptions: { show: { operation: ['screenshot'] } },
			},
			{
				displayName: 'Dark Mode',
				name: 'darkMode',
				type: 'boolean',
				default: false,
				description: 'Whether to enable dark mode CSS emulation',
				displayOptions: { show: { operation: ['screenshot'] } },
			},
			{
				displayName: 'Block Ads',
				name: 'blockAds',
				type: 'boolean',
				default: true,
				description: 'Whether to block advertisements and trackers',
				displayOptions: { show: { operation: ['screenshot'] } },
			},
			{
				displayName: 'Block Cookie Banners',
				name: 'blockCookieBanners',
				type: 'boolean',
				default: true,
				description: 'Whether to remove cookie consent banners',
				displayOptions: { show: { operation: ['screenshot'] } },
			},
			{
				displayName: 'Additional Options',
				name: 'additionalOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: { show: { operation: ['screenshot'] } },
				options: [
					{
						displayName: 'Width',
						name: 'width',
						type: 'number',
						default: 1280,
						description: 'Viewport width in pixels (320-3840)',
						typeOptions: { minValue: 320, maxValue: 3840 },
					},
					{
						displayName: 'Height',
						name: 'height',
						type: 'number',
						default: 800,
						description: 'Viewport height in pixels (200-10000)',
						typeOptions: { minValue: 200, maxValue: 10000 },
					},
					{
						displayName: 'Quality',
						name: 'quality',
						type: 'number',
						default: 90,
						description: 'Image quality for JPEG/WebP (1-100)',
						typeOptions: { minValue: 1, maxValue: 100 },
					},
					{
						displayName: 'Delay',
						name: 'delay',
						type: 'number',
						default: 0,
						description: 'Milliseconds to wait after page load (0-10000)',
						typeOptions: { minValue: 0, maxValue: 10000 },
					},
					{
						displayName: 'Hide Selectors',
						name: 'hideSelectors',
						type: 'string',
						default: '',
						description: 'Comma-separated CSS selectors to hide before capture',
					},
					{
						displayName: 'Click Selector',
						name: 'clickSelector',
						type: 'string',
						default: '',
						description: 'CSS selector to click before capture',
					},
				],
			},

			// --- Output option ---
			{
				displayName: 'Output',
				name: 'output',
				type: 'options',
				options: [
					{ name: 'Binary (Image File)', value: 'binary' },
					{ name: 'JSON (Base64 Data URI)', value: 'json' },
				],
				default: 'binary',
				description: 'How to return the screenshot',
				displayOptions: { show: { operation: ['screenshot'] } },
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;

				if (operation === 'getUsage') {
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'snapRenderApi',
						{
							method: 'GET',
							url: 'https://app.snap-render.com/v1/usage',
							json: true,
						},
					);
					returnData.push({ json: response as IDataObject });
				} else if (operation === 'checkCache') {
					const url = this.getNodeParameter('url', i) as string;
					const format = this.getNodeParameter('format', i) as string;
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'snapRenderApi',
						{
							method: 'GET',
							url: 'https://app.snap-render.com/v1/screenshot/info',
							qs: { url, format },
							json: true,
						},
					);
					returnData.push({ json: response as IDataObject });
				} else if (operation === 'screenshot') {
					const url = this.getNodeParameter('url', i) as string;
					const format = this.getNodeParameter('format', i) as string;
					const fullPage = this.getNodeParameter('fullPage', i) as boolean;
					const device = this.getNodeParameter('device', i) as string;
					const darkMode = this.getNodeParameter('darkMode', i) as boolean;
					const blockAds = this.getNodeParameter('blockAds', i) as boolean;
					const blockCookieBanners = this.getNodeParameter('blockCookieBanners', i) as boolean;
					const output = this.getNodeParameter('output', i) as string;
					const additionalOptions = this.getNodeParameter('additionalOptions', i) as IDataObject;

					const qs: Record<string, string | number | boolean> = {
						url,
						format,
						full_page: fullPage,
						dark_mode: darkMode,
						block_ads: blockAds,
						block_cookie_banners: blockCookieBanners,
					};

					if (device) qs.device = device;
					if (additionalOptions.width) qs.width = additionalOptions.width as number;
					if (additionalOptions.height) qs.height = additionalOptions.height as number;
					if (additionalOptions.quality) qs.quality = additionalOptions.quality as number;
					if (additionalOptions.delay) qs.delay = additionalOptions.delay as number;
					if (additionalOptions.hideSelectors)
						qs.hide_selectors = additionalOptions.hideSelectors as string;
					if (additionalOptions.clickSelector)
						qs.click_selector = additionalOptions.clickSelector as string;

					if (output === 'json') {
						qs.response_type = 'json';
						const response = await this.helpers.httpRequestWithAuthentication.call(
							this,
							'snapRenderApi',
							{
								method: 'GET',
								url: 'https://app.snap-render.com/v1/screenshot',
								qs,
								json: true,
							},
						);
						returnData.push({ json: response as IDataObject });
					} else {
						const response = await this.helpers.httpRequestWithAuthentication.call(
							this,
							'snapRenderApi',
							{
								method: 'GET',
								url: 'https://app.snap-render.com/v1/screenshot',
								qs,
								encoding: 'arraybuffer',
								returnFullResponse: true,
							},
						);

						const mimeTypes: Record<string, string> = {
							png: 'image/png',
							jpeg: 'image/jpeg',
							webp: 'image/webp',
							pdf: 'application/pdf',
						};

						const binaryData = await this.helpers.prepareBinaryData(
							Buffer.from((response as { body: Buffer }).body),
							`screenshot.${format === 'jpeg' ? 'jpg' : format}`,
							mimeTypes[format] || 'image/png',
						);

						returnData.push({
							json: {
								url,
								format,
								success: true,
							},
							binary: { data: binaryData },
						});
					}
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message } });
				} else {
					throw error;
				}
			}
		}

		return [returnData];
	}
}
