import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class SnapRenderApi implements ICredentialType {
	name = 'snapRenderApi';
	displayName = 'SnapRender API';
	documentationUrl = 'https://snap-render.com';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			placeholder: 'sk_live_...',
			description:
				'Your SnapRender API key. Get a free key at https://app.snap-render.com/auth/signup',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-API-Key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://app.snap-render.com',
			url: '/v1/usage',
			method: 'GET',
		},
	};
}
