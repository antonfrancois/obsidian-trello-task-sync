// Tasks of a note, from Obsidian's parsed list items (code blocks are already excluded).

export interface Task {
	text: string;
	done: boolean;
	line: number;
}

/** The part of Obsidian's ListItemCache this module needs. */
export interface ListItemLike {
	task?: string | undefined;
	position: { start: { line: number } };
}

// "- [ ] ", "* [x] ", "1. [/] ", also inside blockquotes ("> - [ ] ")
const TASK_PREFIX = /^\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[.\]\s?/;
const CHECKBOX = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[).(\])/;
const BLOCK_ID = /\s+\^[A-Za-z0-9-]+\s*$/;

/** The text of a task line, without the list marker, checkbox and block id. */
export function taskText(line: string): string {
	return line.replace(TASK_PREFIX, '').replace(BLOCK_ID, '').trim();
}

/** `x` / `X` = done, `-` = cancelled (counts as done); anything else (` `, `/`, …) = open. */
export function isDone(status: string): boolean {
	return status === 'x' || status === 'X' || status === '-';
}

/** Nested tasks are flattened, in note order. Only the first line of a task is used. */
export function extractTasks(content: string, items: readonly ListItemLike[]): Task[] {
	const lines = content.split(/\r?\n/);
	const tasks: Task[] = [];
	for (const item of items) {
		if (item.task === undefined) {
			continue;
		}
		const line = item.position.start.line;
		const text = taskText(lines[line] ?? '');
		if (text !== '') {
			tasks.push({ text, done: isDone(item.task), line });
		}
	}
	return tasks;
}

/**
 * Ticks (`[x]`) or unticks (`[ ]`) the task on `line`. Returns null, changing nothing, if that
 * line is no longer the task with this text (the note changed in the meantime).
 */
export function setTaskDone(content: string, line: number, text: string, done: boolean): string | null {
	const eol = content.includes('\r\n') ? '\r\n' : '\n';
	const lines = content.split(/\r?\n/);
	const current = lines[line];
	if (current === undefined || !CHECKBOX.test(current) || taskText(current) !== text) {
		return null;
	}
	lines[line] = current.replace(CHECKBOX, `$1${done ? 'x' : ' '}$2`);
	return lines.join(eol);
}
