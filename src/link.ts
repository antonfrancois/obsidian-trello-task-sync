// Reads the `trello` frontmatter key: one card per note, as a card URL or a shortLink.

export type LinkResult =
	| { kind: 'none' }
	| { kind: 'card'; cardRef: string }
	| { kind: 'error'; message: string };

const CARD_URL = /trello\.com\/c\/([A-Za-z0-9]+)/;
const SHORT_LINK = /^[A-Za-z0-9]{8}$/;
const CARD_ID = /^[0-9a-f]{24}$/;

function isEmpty(value: unknown): boolean {
	return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

export function parseTrelloLink(value: unknown): LinkResult {
	if (Array.isArray(value)) {
		const filled = value.filter((v) => !isEmpty(v));
		if (filled.length > 1) {
			return {
				kind: 'error',
				message: 'A note can be linked to one Trello card only, but "trello" lists several.',
			};
		}
		value = filled[0];
	}
	if (isEmpty(value)) {
		return { kind: 'none' };
	}
	if (typeof value !== 'string') {
		return { kind: 'error', message: '"trello" must be a card URL or a card shortLink.' };
	}
	const text = value.trim();
	const url = CARD_URL.exec(text);
	if (url?.[1]) {
		return { kind: 'card', cardRef: url[1] };
	}
	if (SHORT_LINK.test(text) || CARD_ID.test(text)) {
		return { kind: 'card', cardRef: text };
	}
	return { kind: 'error', message: `"${text}" is not a Trello card URL or shortLink.` };
}
