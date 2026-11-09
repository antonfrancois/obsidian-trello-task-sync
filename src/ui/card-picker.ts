import { App, FuzzySuggestModal } from 'obsidian';
import type { TrelloClient } from '../trello';

export interface CardChoice {
	name: string;
	shortUrl: string;
	board: string;
	list: string;
}

/** All open cards of all open boards, except mirrors, link cards and separators. */
export async function loadCards(client: TrelloClient): Promise<CardChoice[]> {
	const choices: CardChoice[] = [];
	for (const board of await client.boards()) {
		const lists = new Map(board.lists.map((l) => [l.id, l.name]));
		for (const card of await client.boardCards(board.id)) {
			if (!card.cardRole) {
				choices.push({
					name: card.name,
					shortUrl: card.shortUrl,
					board: board.name,
					list: lists.get(card.idList) ?? '?',
				});
			}
		}
	}
	return choices;
}

export class CardPickerModal extends FuzzySuggestModal<CardChoice> {
	constructor(
		app: App,
		private readonly cards: CardChoice[],
		private readonly onPick: (card: CardChoice) => void,
	) {
		super(app);
		this.setPlaceholder('Search a Trello card by name, board or list');
	}

	getItems(): CardChoice[] {
		return this.cards;
	}

	getItemText(card: CardChoice): string {
		return `${card.name}  ·  ${card.board} › ${card.list}`;
	}

	onChooseItem(card: CardChoice): void {
		this.onPick(card);
	}
}
