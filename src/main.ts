import { Notice, Platform, Plugin, requestUrl, TFile } from 'obsidian';
import { registerCommands } from './commands';
import { SyncService } from './service';
import { DEFAULT_SETTINGS, TrelloTaskSyncSettings, TrelloTaskSyncSettingTab } from './settings';
import { Http, TrelloClient } from './trello';

// Per device (not in data.json, which travels with the vault).
const AUTO_SYNC_KEY = 'trello-task-sync-auto';

const http: Http = async (request) => {
	const response = await requestUrl({ ...request, throw: false });
	return {
		status: response.status,
		headers: response.headers,
		text: response.text,
		// json throws on an empty or non-JSON body; the client only reads it for non-empty text
		get json(): unknown {
			return response.json as unknown;
		},
	};
};

export default class TrelloTaskSyncPlugin extends Plugin {
	settings!: TrelloTaskSyncSettings;
	private service!: SyncService;
	private timer: number | null = null;

	async onload() {
		const saved = (await this.loadData()) as Partial<TrelloTaskSyncSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...saved, notes: { ...saved?.notes } };
		this.service = new SyncService(this);
		this.addSettingTab(new TrelloTaskSyncSettingTab(this.app, this));

		registerCommands(this, this.service);

		this.registerEvent(
			this.app.metadataCache.on('changed', (file) => {
				// An emptied "trello" is not forgotten right away: it may be a card switch in
				// progress (URL cleared, then the new one pasted). Full syncs clean up.
				if (this.autoSyncEnabled() && this.service.isLinked(file)) {
					this.service.scheduleFile(file);
				}
			}),
		);
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				if (file instanceof TFile) {
					void this.service.renamed(file, oldPath);
				}
			}),
		);
		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (file instanceof TFile) {
					void this.service.detach(file.path);
				}
			}),
		);
		this.register(() => this.service.cancelScheduled());
		this.register(() => this.stopTimer());

		this.app.workspace.onLayoutReady(() => {
			if (this.autoSyncEnabled()) {
				void this.service.syncAll('auto'); // catch up with changes made while closed
			}
			this.restartTimer();
		});
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/** On by default on desktop, off on mobile (decision: sync from one desktop only). */
	autoSyncEnabled(): boolean {
		const stored: unknown = this.app.loadLocalStorage(AUTO_SYNC_KEY);
		return typeof stored === 'boolean' ? stored : !Platform.isMobile;
	}

	setAutoSync(enabled: boolean) {
		this.app.saveLocalStorage(AUTO_SYNC_KEY, enabled);
		this.restartTimer();
	}

	restartTimer() {
		this.stopTimer();
		const minutes = this.settings.intervalMinutes;
		if (this.autoSyncEnabled() && minutes > 0) {
			this.timer = window.setInterval(() => void this.service.syncAll('auto'), minutes * 60_000);
		}
	}

	private stopTimer() {
		if (this.timer !== null) {
			window.clearInterval(this.timer);
			this.timer = null;
		}
	}

	/** A client built from the secrets, or null if they are not set (with a notice if asked). */
	client(notify: boolean): TrelloClient | null {
		const secrets = this.app.secretStorage;
		const key = this.settings.keySecret ? secrets.getSecret(this.settings.keySecret) : null;
		const token = this.settings.tokenSecret ? secrets.getSecret(this.settings.tokenSecret) : null;
		if (!key || !token) {
			if (notify) {
				new Notice('Set your Trello API key and token in the plugin settings.');
			}
			return null;
		}
		return new TrelloClient(http, key, token);
	}
}
