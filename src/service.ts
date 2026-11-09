// Runs syncs one at a time, debounces edits, and reports results.

import { Notice, TFile } from 'obsidian';
import type TrelloTaskSyncPlugin from './main';
import { syncFile, SyncResult } from './sync';

export type Mode = 'manual' | 'auto';

const EDIT_DELAY_MS = 3000; // wait this long after the last edit before syncing a note
const AUTO_ERROR_NOTICE_EVERY_MS = 10 * 60 * 1000;

export class SyncService {
	private queue: Promise<unknown> = Promise.resolve();
	private timers = new Map<string, number>();
	private lastAutoNotice = new Map<string, number>(); // message -> time shown

	constructor(private readonly plugin: TrelloTaskSyncPlugin) {}

	isLinked(file: TFile): boolean {
		const trello: unknown = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter?.trello;
		return trello !== undefined && trello !== null && trello !== '';
	}

	/** Sync a note a few seconds after its last edit. */
	scheduleFile(file: TFile) {
		window.clearTimeout(this.timers.get(file.path));
		this.timers.set(
			file.path,
			window.setTimeout(() => {
				this.timers.delete(file.path);
				void this.syncFile(file, 'auto');
			}, EDIT_DELAY_MS),
		);
	}

	cancelScheduled() {
		this.timers.forEach((id) => window.clearTimeout(id));
		this.timers.clear();
	}

	syncFile(file: TFile, mode: Mode): Promise<void> {
		return this.enqueue(() => this.run(file, mode));
	}

	async syncAll(mode: Mode): Promise<void> {
		const files = this.plugin.app.vault.getMarkdownFiles().filter((f) => this.isLinked(f));
		for (const file of files) {
			await this.syncFile(file, 'auto'); // per-note messages only on problems
		}
		// Notes whose "trello" was emptied by hand are unlinked: forgotten, card left as it is.
		const linked = new Set(files.map((f) => f.path));
		for (const path of Object.keys(this.plugin.settings.notes)) {
			if (!linked.has(path)) {
				await this.forget(path);
			}
		}
		if (mode === 'manual') {
			new Notice(`Synced ${files.length} linked note(s) with Trello.`);
		}
	}

	/** A linked note was renamed or moved: its memory follows it, the card is updated at sync. */
	async renamed(file: TFile, oldPath: string) {
		const notes = this.plugin.settings.notes;
		const state = notes[oldPath];
		if (!state) {
			return;
		}
		delete notes[oldPath];
		notes[file.path] = state;
		await this.plugin.saveSettings();
		if (this.plugin.autoSyncEnabled()) {
			this.scheduleFile(file);
		}
	}

	/** The note is no longer linked: forget it. The card is left as it is (decision). */
	async forget(path: string) {
		if (this.plugin.settings.notes[path]) {
			delete this.plugin.settings.notes[path];
			await this.plugin.saveSettings();
		}
	}

	/**
	 * A linked note was deleted: forget it and remove its 📝 link (which would open nothing)
	 * from the card. Its checklist stays on the card as a record (decision 2026-10-12).
	 */
	detach(path: string): Promise<void> {
		return this.enqueue(async () => {
			const state = this.plugin.settings.notes[path];
			if (!state) {
				return;
			}
			await this.forget(path);
			const client = this.plugin.client(false);
			if (!client || !state.linkUrl) {
				return;
			}
			try {
				const attachments = await client.attachments(state.cardId);
				for (const a of attachments.filter((x) => x.url === state.linkUrl)) {
					await client.deleteAttachment(state.cardId, a.id);
				}
			} catch (e) {
				this.notify(`Could not remove a note's link from its Trello card: ${(e as Error).message}`, 'auto');
			}
		});
	}

	private enqueue(job: () => Promise<void>): Promise<void> {
		const run = this.queue.then(job, job);
		this.queue = run.catch(() => undefined);
		return run;
	}

	private async run(file: TFile, mode: Mode) {
		const client = this.plugin.client(mode === 'manual');
		if (!client) {
			return;
		}
		const notes = this.plugin.settings.notes;
		const others = Object.entries(notes)
			.filter(([path]) => path !== file.path)
			.map(([path, state]) => ({ path, cardRef: state.cardRef }));
		try {
			const { result, state } = await syncFile(this.plugin.app, client, file, notes[file.path], others);
			if (state) {
				notes[file.path] = state;
				await this.plugin.saveSettings();
			}
			this.report(file, result, mode);
		} catch (e) {
			this.notify(`Trello sync of "${file.basename}" failed: ${(e as Error).message}`, mode);
		}
	}

	private report(file: TFile, result: SyncResult, mode: Mode) {
		if (result.kind === 'not-linked') {
			if (mode === 'manual') {
				new Notice('This note is not linked to a Trello card yet.');
			}
			return;
		}
		if (result.kind === 'invalid-link') {
			this.notify(`"${file.basename}" not synced: ${result.message}`, mode);
			return;
		}
		if (result.switchedFrom !== null) {
			new Notice(
				`"${file.basename}" is now linked to "${result.cardName}" (was "${result.switchedFrom}"). ` +
					`${result.frozen} done task(s) stay on the previous card, which is left as it is.`,
			);
		}
		if (result.duplicates.length > 0) {
			this.notify(
				`"${file.basename}" has the same task more than once (${result.duplicates.join(', ')}). ` +
					'Ticks made in Trello may land on the wrong copy: make each task text unique.',
				mode,
			);
		}
		if (mode === 'manual') {
			const { created, updated, deleted, ticked } = result;
			new Notice(
				`Synced with "${result.cardName}": ${created} added, ${updated} updated, ` +
					`${deleted} removed, ${ticked} ticked from Trello.`,
			);
		}
	}

	/** Manual: always shown. Automatic: the same message at most every 10 minutes. */
	private notify(message: string, mode: Mode) {
		if (mode === 'auto') {
			const now = Date.now();
			if (now - (this.lastAutoNotice.get(message) ?? 0) < AUTO_ERROR_NOTICE_EVERY_MS) {
				return;
			}
			this.lastAutoNotice.set(message, now);
		}
		new Notice(message);
	}
}
