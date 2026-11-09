import { describe, expect, it } from 'vitest';
import { parseTrelloLink } from '../src/link';

describe('parseTrelloLink', () => {
	it.each([undefined, null, '', '   ', [], [null, '']])('no link: %j', (value) => {
		expect(parseTrelloLink(value)).toEqual({ kind: 'none' });
	});

	it.each([
		['https://trello.com/c/abcD1234', 'abcD1234'],
		['https://trello.com/c/abcD1234/12-some-card-title', 'abcD1234'],
		['  abcD1234  ', 'abcD1234'],
		['6abd85cbd87587dfbb79fa34', '6abd85cbd87587dfbb79fa34'],
		[['https://trello.com/c/abcD1234'], 'abcD1234'], // a one-item list is fine
	])('card: %j', (value, cardRef) => {
		expect(parseTrelloLink(value)).toEqual({ kind: 'card', cardRef });
	});

	it('refuses several cards for one note', () => {
		const result = parseTrelloLink(['https://trello.com/c/abcD1234', 'efgH5678']);
		expect(result.kind).toBe('error');
	});

	it.each(['https://example.com', 'not a card', 42, { url: 'x' }])('invalid: %j', (value) => {
		expect(parseTrelloLink(value).kind).toBe('error');
	});
});
