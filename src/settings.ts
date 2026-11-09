import { App, Notice, PluginSettingTab, SecretComponent, Setting } from 'obsidian';
import type TrelloTaskSyncPlugin from './main';
import type { NoteState } from './sync';

/**
 * Stored in data.json (inside the vault). Only the *names* of the secrets: the key and token
 * themselves live in Obsidian's secret storage, outside the vault.
 */
export interface TrelloTaskSyncSettings {
	keySecret: string;
	tokenSecret: string;
	intervalMinutes: number; // periodic sync of all linked notes; 0 = off
	notes: Record<string, NoteState>; // per note path: what was last synced
}

export const DEFAULT_SETTINGS: TrelloTaskSyncSettings = {
	keySecret: '',
	tokenSecret: '',
	intervalMinutes: 5,
	notes: {},
};

export class TrelloTaskSyncSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: TrelloTaskSyncPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Trello API key')
			.setDesc('Found in the Trello developer portal, under API key.')
			.addComponent((el) =>
				new SecretComponent(this.app, el)
					.setValue(this.plugin.settings.keySecret)
					.onChange(async (value) => {
						this.plugin.settings.keySecret = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Trello token')
			.setDesc('From the token link next to the API key (read and write access).')
			.addComponent((el) =>
				new SecretComponent(this.app, el)
					.setValue(this.plugin.settings.tokenSecret)
					.onChange(async (value) => {
						this.plugin.settings.tokenSecret = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Test connection')
			.setDesc('Checks the key and token with Trello.')
			.addButton((button) =>
				button.setButtonText('Test').onClick(async () => {
					const client = this.plugin.client(true);
					if (!client) {
						return;
					}
					try {
						const me = await client.me();
						new Notice(`Connected to Trello as ${me.fullName || me.username}.`);
					} catch (e) {
						new Notice(`Trello connection failed: ${(e as Error).message}`);
					}
				}),
			);

		new Setting(containerEl)
			.setName('Sync automatically on this device')
			.setDesc(
				'After each edit, at startup and periodically. Turn it on for one computer only: ' +
					'two devices ticking the same notes can create sync conflicts.',
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.autoSyncEnabled()).onChange((value) => {
					this.plugin.setAutoSync(value);
				}),
			);

		new Setting(containerEl)
			.setName('Periodic sync (minutes)')
			.setDesc('Brings in the ticks made in Trello while Obsidian is open. Use 0 to turn it off.')
			.addText((text) =>
				text.setValue(String(this.plugin.settings.intervalMinutes)).onChange(async (value) => {
					const minutes = Number(value);
					if (Number.isInteger(minutes) && minutes >= 0) {
						this.plugin.settings.intervalMinutes = minutes;
						await this.plugin.saveSettings();
						this.plugin.restartTimer();
					}
				}),
			);
	}
}
