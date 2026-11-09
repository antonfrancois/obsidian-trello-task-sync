// Note tasks vs checklist items vs last synced state -> operations. Pure: no API calls.
// Tasks and items are matched by exact text (no block IDs); duplicates one to one, in order.

import type { Task } from './tasks';

export interface CheckItem {
	id: string;
	name: string;
	state: 'complete' | 'incomplete';
}

/** One task as it was at the end of the last successful sync. */
export interface SyncedTask {
	text: string;
	done: boolean;
}

export type TrelloOp =
	| { kind: 'create'; text: string; done: boolean }
	| { kind: 'update'; itemId: string; text: string; done: boolean }
	| { kind: 'delete'; itemId: string; text: string };

/** Tick or untick the task on `line` of the note (a tick made in Trello). */
export interface NoteOp {
	line: number;
	text: string;
	done: boolean;
}

export interface SyncPlan {
	trello: TrelloOp[];
	note: NoteOp[];
	/** The state to remember once every operation has been applied. */
	synced: SyncedTask[];
}

function pools<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
	const map = new Map<string, T[]>();
	for (const item of items) {
		const k = key(item);
		map.set(k, [...(map.get(k) ?? []), item]);
	}
	return map;
}

/**
 * The note wins, except for one case: the done state changed in Trello only (the note still
 * has the last synced state), then the note is ticked / unticked. Without a last synced state
 * (first sync, memory lost), the note wins.
 */
export function planSync(
	tasks: readonly Task[],
	items: readonly CheckItem[],
	last: readonly SyncedTask[],
): SyncPlan {
	const itemsByName = pools(items, (i) => i.name.trim());
	const lastByText = pools(last, (t) => t.text);
	const plan: SyncPlan = { trello: [], note: [], synced: [] };

	for (const task of tasks) {
		const item = itemsByName.get(task.text)?.shift();
		const before = lastByText.get(task.text)?.shift();
		let done = task.done;
		if (!item) {
			plan.trello.push({ kind: 'create', text: task.text, done });
		} else {
			const itemDone = item.state === 'complete';
			if (itemDone !== task.done) {
				const changedInTrelloOnly = before !== undefined && before.done === task.done;
				if (changedInTrelloOnly) {
					done = itemDone;
					plan.note.push({ line: task.line, text: task.text, done });
				} else {
					plan.trello.push({ kind: 'update', itemId: item.id, text: task.text, done });
				}
			}
		}
		plan.synced.push({ text: task.text, done });
	}

	for (const left of itemsByName.values()) {
		for (const item of left) {
			plan.trello.push({ kind: 'delete', itemId: item.id, text: item.name });
		}
	}
	return plan;
}

/**
 * After a switch to a new card, the tasks that were done at the switch stay with the old card
 * ("frozen"): they are not sent to the new card, and same-named items on it are left alone.
 * A frozen task that is unticked (or also present as an open task) is unfrozen for good.
 */
export function splitFrozen(
	tasks: readonly Task[],
	items: readonly CheckItem[],
	frozen: readonly string[],
): { tasks: Task[]; items: CheckItem[]; frozen: string[] } {
	const open = new Set(tasks.filter((t) => !t.done).map((t) => t.text));
	const still = new Set(tasks.filter((t) => t.done && frozen.includes(t.text) && !open.has(t.text)).map((t) => t.text));
	return {
		tasks: tasks.filter((t) => !still.has(t.text)),
		items: items.filter((i) => !still.has(i.name.trim())),
		frozen: [...still],
	};
}
