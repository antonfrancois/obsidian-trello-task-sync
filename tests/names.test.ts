import { describe, expect, it } from 'vitest';
import { checklistTitle, obsidianUrl } from '../src/names';

describe('checklistTitle', () => {
	const note = { path: 'Projects/Alpha/Notes.md', cardRef: 'abc' };

	it('uses the note name', () => {
		expect(checklistTitle(note, [])).toBe('📝 Notes');
		expect(checklistTitle({ path: 'Top.md', cardRef: 'abc' }, [])).toBe('📝 Top');
	});

	it('adds the folder when another note on the same card has the same name', () => {
		const other = { path: 'Projects/Beta/Notes.md', cardRef: 'abc' };
		expect(checklistTitle(note, [other])).toBe('📝 Projects/Alpha/Notes');
		expect(checklistTitle(other, [note])).toBe('📝 Projects/Beta/Notes');
	});

	it('ignores same-named notes on other cards, and the note itself', () => {
		expect(checklistTitle(note, [{ path: 'Other/Notes.md', cardRef: 'xyz' }, note])).toBe('📝 Notes');
	});
});

describe('obsidianUrl', () => {
	it('encodes vault and path, without .md', () => {
		expect(obsidianUrl('test-vault', 'Project alpha.md')).toBe(
			'obsidian://open?vault=test-vault&file=Project%20alpha',
		);
		expect(obsidianUrl('My Vault', 'A/B é.md')).toBe('obsidian://open?vault=My%20Vault&file=A%2FB%20%C3%A9');
	});
});
