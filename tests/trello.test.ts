import { describe, expect, it } from 'vitest';
import { HttpRequest, HttpResponse, TrelloClient, TrelloError } from '../src/trello';

const ok = (body: unknown): HttpResponse => ({ status: 200, headers: {}, text: JSON.stringify(body), json: body });
const fail = (status: number, headers: Record<string, string> = {}): HttpResponse => ({
	status,
	headers,
	text: 'boom',
	json: null,
});

function client(...responses: (HttpResponse | Error)[]) {
	const requests: HttpRequest[] = [];
	const sleeps: number[] = [];
	const http = (request: HttpRequest) => {
		requests.push(request);
		const next = responses.shift();
		return next instanceof Error ? Promise.reject(next) : Promise.resolve(next as HttpResponse);
	};
	const c = new TrelloClient(http, 'KEY', 'TOKEN', (ms) => {
		sleeps.push(ms);
		return Promise.resolve();
	}, 2);
	return { c, requests, sleeps };
}

describe('TrelloClient', () => {
	it('sends credentials in the header, never in the URL', async () => {
		const { c, requests } = client(ok({ id: 'x' }));
		await c.request('GET', '/cards/abc', { fields: 'name' });
		expect(requests[0]?.url).toBe('https://api.trello.com/1/cards/abc?fields=name');
		expect(requests[0]?.headers.Authorization).toBe('OAuth oauth_consumer_key="KEY", oauth_token="TOKEN"');
	});

	it('retries 429 with Retry-After, then succeeds', async () => {
		const { c, sleeps } = client(fail(429, { 'retry-after': '3' }), ok([]));
		expect(await c.request('GET', '/x')).toEqual([]);
		expect(sleeps).toEqual([3000]);
	});

	it('retries network errors with backoff, then reports without secrets', async () => {
		const { c, sleeps } = client(new Error('down'), new Error('down'), new Error('down'));
		const error = await c.request('GET', '/x').catch((e: unknown) => e);
		expect(error).toBeInstanceOf(TrelloError);
		expect((error as TrelloError).status).toBeNull();
		expect((error as TrelloError).message).not.toContain('TOKEN');
		expect(sleeps).toEqual([1000, 2000]);
	});

	it('does not retry 4xx', async () => {
		const { c, sleeps } = client(fail(401));
		await expect(c.request('GET', '/x')).rejects.toMatchObject({ status: 401 });
		expect(sleeps).toEqual([]);
	});

	it('returns null for an empty body', async () => {
		const { c } = client({ status: 200, headers: {}, text: '', json: null });
		expect(await c.request('DELETE', '/x')).toBeNull();
	});

	it('builds the check item calls', async () => {
		const { c, requests } = client(ok({}), ok({}), ok({}));
		await c.createCheckItem('CL', 'Do X & Y', true);
		await c.setCheckItemState('CARD', 'IT', false);
		await c.deleteCheckItem('CL', 'IT');
		expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([
			'POST https://api.trello.com/1/checklists/CL/checkItems?name=Do+X+%26+Y&checked=true&pos=bottom',
			'PUT https://api.trello.com/1/cards/CARD/checkItem/IT?state=incomplete',
			'DELETE https://api.trello.com/1/checklists/CL/checkItems/IT',
		]);
	});
});
