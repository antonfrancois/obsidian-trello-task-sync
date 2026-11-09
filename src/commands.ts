// Commands: sync, link / unlink / open the linked card.

import { Notice, TFile } from 'obsidian';
import { parseTrelloLink } from './link';
import type TrelloTaskSyncPlugin from './main';
import type { SyncService } from './service';
import { CardChoice, CardPickerModal, loadCards } from './ui/card-picker';

const CARDS_CACHE_MS = 5 * 60 * 1000;

export function registerCommands(plugin: TrelloTaskSyncPlugin, service: SyncService) {
	const { app } = plugin;
	let cache: { at: number; cards: CardChoice[] } | null = null;

	/** Adds a command that needs the active Markdown note. */
	const noteCommand = (id: string, name: string, run: (file: TFile) => void | Promise<void>) =>
		plugin.addCommand({
			id,
			name,
			checkCallback: (checking) => {
				const file = app.workspace.getActiveFile();
				if (!file || file.extension !== 'md') {
					return false;
				}
				if (!checking) {
					void run(file);
				}
				return true;
			},
		});

	const linkOf = (file: TFile) => parseTrelloLink(app.metadataCache.getFileCache(file)?.frontmatter?.trello);

	/** Resolves once Obsidian has re-read the note's properties (or after 3 s). */
	const cacheUpdated = (file: TFile) =>
		new Promise<void>((resolve) => {
			const ref = app.metadataCache.on('changed', (changed) => {
				if (changed.path === file.path) {
					done();
				}
			});
			const timeout = window.setTimeout(() => done(), 3000);
			const done = () => {
				app.metadataCache.offref(ref);
				window.clearTimeout(timeout);
				resolve();
			};
		});

	noteCommand('sync-current-note', 'Sync current note now', (file) => service.syncFile(file, 'manual'));

	plugin.addCommand({
		id: 'sync-all-notes',
		name: 'Sync all linked notes now',
		callback: () => void service.syncAll('manual'),
	});

	noteCommand('link-card', 'Link to Trello card', async (file) => {
		const client = plugin.client(true);
		if (!client) {
			return;
		}
		if (!cache || Date.now() - cache.at > CARDS_CACHE_MS) {
			const loading = new Notice('Loading Trello cards…', 0);
			try {
				cache = { at: Date.now(), cards: await loadCards(client) };
			} catch (e) {
				new Notice(`Could not load Trello cards: ${(e as Error).message}`);
				return;
			} finally {
				loading.hide();
			}
		}
		new CardPickerModal(app, cache.cards, (card) => {
			void (async () => {
				const current = linkOf(file);
				if (current.kind === 'card' && card.shortUrl.endsWith(`/${current.cardRef}`)) {
					new Notice(`"${file.basename}" is already linked to "${card.name}".`);
					return;
				}
				const updated = cacheUpdated(file);
				await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
					fm.trello = card.shortUrl; // replacing a link = card switch
				});
				await updated;
				await service.syncFile(file, 'manual');
			})();
		}).open();
	});

	noteCommand('unlink-card', 'Unlink Trello card', async (file) => {
		if (linkOf(file).kind === 'none') {
			new Notice('This note is not linked to a Trello card.');
			return;
		}
		const cardName = plugin.settings.notes[file.path]?.cardName;
		await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			delete fm.trello;
		});
		await service.forget(file.path);
		new Notice(`Unlinked${cardName ? ` from "${cardName}"` : ''}. The card is left as it is.`);
	});

	noteCommand('open-card', 'Open linked Trello card', (file) => {
		const link = linkOf(file);
		if (link.kind !== 'card') {
			new Notice('This note is not linked to a Trello card.');
			return;
		}
		window.open(`https://trello.com/c/${link.cardRef}`);
	});
}
