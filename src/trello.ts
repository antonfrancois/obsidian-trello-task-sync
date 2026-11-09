// Thin Trello REST client. HTTP goes through an injected function (Obsidian's requestUrl in
// the plugin, a fake in tests). Credentials are sent in the Authorization header, never in
// the URL, so they cannot leak into error messages.

import type { CheckItem } from './plan';

const API = 'https://api.trello.com/1';

export interface HttpRequest {
	url: string;
	method: string;
	headers: Record<string, string>;
}

export interface HttpResponse {
	status: number;
	headers: Record<string, string>;
	text: string;
	json: unknown;
}

export type Http = (request: HttpRequest) => Promise<HttpResponse>;

export class TrelloError extends Error {
	constructor(
		readonly status: number | null,
		message: string,
	) {
		super(message);
	}
}

export interface Card {
	id: string;
	name: string;
	shortUrl: string;
	closed: boolean;
}

export interface Attachment {
	id: string;
	name: string;
	url: string;
}

export interface BoardWithLists {
	id: string;
	name: string;
	lists: { id: string; name: string }[];
}

export interface BoardCard {
	id: string;
	name: string;
	shortUrl: string;
	idList: string;
	cardRole: string | null;
}

export interface Checklist {
	id: string;
	name: string;
	checkItems: CheckItem[];
}

type Params = Record<string, string>;

export class TrelloClient {
	constructor(
		private readonly http: Http,
		private readonly key: string,
		private readonly token: string,
		private readonly sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms)),
		private readonly maxRetries = 4,
	) {}

	/** Retries HTTP 429, 5xx and network errors with backoff. */
	async request<T>(method: string, path: string, params: Params = {}): Promise<T> {
		const query = new URLSearchParams(params).toString();
		const request: HttpRequest = {
			url: `${API}${path}${query ? `?${query}` : ''}`,
			method,
			headers: {
				Authorization: `OAuth oauth_consumer_key="${this.key}", oauth_token="${this.token}"`,
			},
		};
		for (let attempt = 0; ; attempt++) {
			const last = attempt >= this.maxRetries;
			let response: HttpResponse;
			try {
				response = await this.http(request);
			} catch {
				if (last) {
					throw new TrelloError(null, `${method} ${path}: network error`);
				}
				await this.sleep(1000 * 2 ** attempt);
				continue;
			}
			const { status } = response;
			if ((status === 429 || status >= 500) && !last) {
				const retryAfter = Number(response.headers['retry-after'] ?? response.headers['Retry-After']);
				await this.sleep(retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt);
				continue;
			}
			if (status >= 400) {
				throw new TrelloError(status, `${method} ${path}: HTTP ${status} ${response.text.slice(0, 200)}`);
			}
			return (response.text ? response.json : null) as T;
		}
	}

	me(): Promise<{ username: string; fullName: string }> {
		return this.request('GET', '/members/me', { fields: 'username,fullName' });
	}

	card(ref: string): Promise<Card> {
		return this.request('GET', `/cards/${ref}`, { fields: 'name,shortUrl,closed' });
	}

	checklists(cardId: string): Promise<Checklist[]> {
		return this.request('GET', `/cards/${cardId}/checklists`, {
			fields: 'name',
			checkItem_fields: 'name,state',
		});
	}

	createChecklist(cardId: string, name: string): Promise<Checklist> {
		return this.request('POST', `/cards/${cardId}/checklists`, { name, pos: 'bottom' });
	}

	createCheckItem(checklistId: string, name: string, done: boolean): Promise<CheckItem> {
		return this.request('POST', `/checklists/${checklistId}/checkItems`, {
			name,
			checked: String(done),
			pos: 'bottom',
		});
	}

	setCheckItemState(cardId: string, itemId: string, done: boolean): Promise<CheckItem> {
		return this.request('PUT', `/cards/${cardId}/checkItem/${itemId}`, {
			state: done ? 'complete' : 'incomplete',
		});
	}

	attachments(cardId: string): Promise<Attachment[]> {
		return this.request('GET', `/cards/${cardId}/attachments`, { fields: 'name,url' });
	}

	addLinkAttachment(cardId: string, name: string, url: string): Promise<Attachment> {
		return this.request('POST', `/cards/${cardId}/attachments`, { name, url });
	}

	deleteAttachment(cardId: string, attachmentId: string): Promise<null> {
		return this.request('DELETE', `/cards/${cardId}/attachments/${attachmentId}`);
	}

	renameChecklist(checklistId: string, name: string): Promise<Checklist> {
		return this.request('PUT', `/checklists/${checklistId}`, { name });
	}

	/** Open boards with their open lists. */
	boards(): Promise<BoardWithLists[]> {
		return this.request('GET', '/members/me/boards', {
			filter: 'open',
			fields: 'name',
			lists: 'open',
			list_fields: 'name',
		});
	}

	/** Open cards of a board (cardRole is set for mirrors, link cards, separators). */
	boardCards(boardId: string): Promise<BoardCard[]> {
		return this.request('GET', `/boards/${boardId}/cards`, { fields: 'name,shortUrl,idList,cardRole' });
	}

	deleteCheckItem(checklistId: string, itemId: string): Promise<null> {
		return this.request('DELETE', `/checklists/${checklistId}/checkItems/${itemId}`);
	}
}
