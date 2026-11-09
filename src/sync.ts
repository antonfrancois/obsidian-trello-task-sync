// Sync one note with the checklist of its linked card, both ways for ticks (see plan.ts).

import type { App, TFile } from 'obsidian';
import { parseTrelloLink } from './link';
import { checklistTitle, NoteRef, obsidianUrl, PREFIX } from './names';
import { planSync, splitFrozen, SyncedTask } from './plan';
import { extractTasks, setTaskDone, Task } from './tasks';
import type { TrelloClient } from './trello';

/** What the plugin remembers about a linked note between syncs (kept in data.json). */
export interface NoteState {
	cardRef: string;
	cardId: string;
	cardName: string;
	checklistId: string | null;
	linkUrl: string | null; // the obsidian:// attachment already added to the card
	tasks: SyncedTask[];
	frozen?: string[]; // done tasks left with the previous card at a card switch
}

export type SyncResult =
	| { kind: 'not-linked' }
	| { kind: 'invalid-link'; message: string }
	| {
			kind: 'synced';
			cardName: string;
			created: number;
			updated: number;
			deleted: number;
			ticked: number; // tasks ticked / unticked in the note (from Trello)
			duplicates: string[]; // task texts present more than once in the note
			switchedFrom: string | null; // name of the previous card, on a card switch
			frozen: number; // done tasks kept with the previous card
	  };

function duplicates(tasks: readonly Task[]): string[] {
	const seen = new Set<string>();
	const dup = new Set<string>();
	for (const t of tasks) {
		(seen.has(t.text) ? dup : seen).add(t.text);
	}
	return [...dup];
}

/**
 * Returns the result and the state to remember. The state is null when nothing should be
 * remembered: not linked, or a tick could not be written into the note (retried next sync).
 */
export async function syncFile(
	app: App,
	client: TrelloClient,
	file: TFile,
	previous: NoteState | undefined,
	others: readonly NoteRef[], // the other linked notes, to name checklists uniquely
): Promise<{ result: SyncResult; state: NoteState | null }> {
	const cache = app.metadataCache.getFileCache(file);
	const link = parseTrelloLink(cache?.frontmatter?.trello);
	if (link.kind === 'none') {
		return { result: { kind: 'not-linked' }, state: null };
	}
	if (link.kind === 'error') {
		return { result: { kind: 'invalid-link', message: link.message }, state: null };
	}

	// Same card as last time: skip fetching it again. Another card: the note switched cards,
	// the previous card is left as it is.
	const known = previous?.cardRef === link.cardRef ? previous : undefined;
	const switchedFrom = previous && !known ? previous.cardName : null;
	const card = known
		? { id: known.cardId, name: known.cardName }
		: await client.card(link.cardRef);

	const content = await app.vault.cachedRead(file);
	const allTasks = extractTasks(content, cache?.listItems ?? []);
	const frozenBefore = switchedFrom !== null
		? allTasks.filter((t) => t.done).map((t) => t.text)
		: (known?.frozen ?? []);

	// The note's checklist: the one remembered (survives renames), else found by name.
	const name = checklistTitle({ path: file.path, cardRef: link.cardRef }, others);
	const checklists = await client.checklists(card.id);
	let checklist =
		checklists.find((c) => c.id === known?.checklistId) ?? checklists.find((c) => c.name === name);
	if (checklist && checklist.name !== name) {
		await client.renameChecklist(checklist.id, name); // note renamed or moved, or a name clash
	}
	const { tasks, items, frozen } = splitFrozen(allTasks, checklist?.checkItems ?? [], frozenBefore);
	if (!checklist && tasks.length > 0) {
		checklist = { ...(await client.createChecklist(card.id, name)), checkItems: [] };
	}

	const plan = planSync(tasks, items, known?.tasks ?? []);
	const counts = { created: 0, updated: 0, deleted: 0, ticked: 0 };
	if (checklist) {
		for (const op of plan.trello) {
			if (op.kind === 'create') {
				await client.createCheckItem(checklist.id, op.text, op.done);
				counts.created++;
			} else if (op.kind === 'update') {
				await client.setCheckItemState(card.id, op.itemId, op.done);
				counts.updated++;
			} else {
				await client.deleteCheckItem(checklist.id, op.itemId);
				counts.deleted++;
			}
		}
	}

	let allTicksWritten = true;
	if (plan.note.length > 0) {
		await app.vault.process(file, (data) => {
			let out = data;
			for (const op of plan.note) {
				const next = setTaskDone(out, op.line, op.text, op.done);
				if (next === null) {
					allTicksWritten = false;
				} else {
					out = next;
					counts.ticked++;
				}
			}
			return out;
		});
	}

	// The card lists the note as a link that opens it in Obsidian. After a rename or move, the
	// old link is replaced.
	const url = obsidianUrl(app.vault.getName(), file.path);
	if (known?.linkUrl !== url) {
		const attachments = await client.attachments(card.id);
		for (const old of attachments.filter((a) => known?.linkUrl && a.url === known.linkUrl)) {
			await client.deleteAttachment(card.id, old.id);
		}
		if (!attachments.some((a) => a.url === url)) {
			await client.addLinkAttachment(card.id, PREFIX + file.basename, url);
		}
	}

	const result: SyncResult = {
		kind: 'synced',
		cardName: card.name,
		...counts,
		duplicates: duplicates(allTasks),
		switchedFrom,
		frozen: frozen.length,
	};
	const state: NoteState = {
		cardRef: link.cardRef,
		cardId: card.id,
		cardName: card.name,
		checklistId: checklist?.id ?? null,
		linkUrl: url,
		tasks: plan.synced,
		frozen,
	};
	return { result, state: allTicksWritten ? state : null };
}
