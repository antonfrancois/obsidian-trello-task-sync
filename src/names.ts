// Names and links the plugin puts on a card for a note. Pure.

/** The plugin only ever touches checklists and attachments with this prefix. */
export const PREFIX = '📝 ';

export interface NoteRef {
	path: string; // vault path, e.g. "Projects/Alpha/Notes.md"
	cardRef: string;
}

function withoutExtension(path: string): string {
	return path.replace(/\.md$/, '');
}

function basename(path: string): string {
	return withoutExtension(path).split('/').pop() ?? path;
}

/**
 * `📝 <note name>`, or `📝 <folder>/<note name>` when another note linked to the same card has
 * the same name (decision 5).
 */
export function checklistTitle(note: NoteRef, others: readonly NoteRef[]): string {
	const clash = others.some(
		(o) => o.path !== note.path && o.cardRef === note.cardRef && basename(o.path) === basename(note.path),
	);
	return PREFIX + (clash ? withoutExtension(note.path) : basename(note.path));
}

/** A link that opens the note in Obsidian (desktop and mobile). */
export function obsidianUrl(vault: string, path: string): string {
	return `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(withoutExtension(path))}`;
}
