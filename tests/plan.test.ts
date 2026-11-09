import { describe, expect, it } from 'vitest';
import { CheckItem, planSync, splitFrozen, SyncedTask } from '../src/plan';
import { Task } from '../src/tasks';

let line = 0;
const task = (text: string, done = false): Task => ({ text, done, line: line++ });
const ci = (id: string, name: string, complete = false): CheckItem => ({
	id,
	name,
	state: complete ? 'complete' : 'incomplete',
});
const was = (text: string, done = false): SyncedTask => ({ text, done });

describe('planSync: note -> Trello', () => {
	it('creates items for new tasks', () => {
		const plan = planSync([task('A'), task('B', true)], [], []);
		expect(plan.trello).toEqual([
			{ kind: 'create', text: 'A', done: false },
			{ kind: 'create', text: 'B', done: true },
		]);
		expect(plan.note).toEqual([]);
		expect(plan.synced).toEqual([was('A'), was('B', true)]);
	});

	it('does nothing when in sync', () => {
		const plan = planSync([task('A'), task('B', true)], [ci('1', 'A'), ci('2', 'B', true)], []);
		expect(plan.trello).toEqual([]);
		expect(plan.note).toEqual([]);
	});

	it('ticked in the note -> ticked in Trello', () => {
		const plan = planSync([task('A', true)], [ci('1', 'A')], [was('A')]);
		expect(plan.trello).toEqual([{ kind: 'update', itemId: '1', text: 'A', done: true }]);
		expect(plan.note).toEqual([]);
	});

	it('deletes items whose task is gone (decision 1)', () => {
		const plan = planSync([task('A')], [ci('1', 'A'), ci('2', 'Old')], [was('A'), was('Old')]);
		expect(plan.trello).toEqual([{ kind: 'delete', itemId: '2', text: 'Old' }]);
	});

	it('a renamed task recreates its item (text identity)', () => {
		const plan = planSync([task('New name')], [ci('1', 'Old name')], [was('Old name')]);
		expect(plan.trello).toEqual([
			{ kind: 'create', text: 'New name', done: false },
			{ kind: 'delete', itemId: '1', text: 'Old name' },
		]);
	});

	it('ignores surrounding spaces in item names', () => {
		expect(planSync([task('A')], [ci('1', ' A ')], []).trello).toEqual([]);
	});
});

describe('planSync: Trello ticks -> note', () => {
	it('ticked in Trello only -> ticked in the note', () => {
		const a = task('A');
		const plan = planSync([a], [ci('1', 'A', true)], [was('A')]);
		expect(plan.trello).toEqual([]);
		expect(plan.note).toEqual([{ line: a.line, text: 'A', done: true }]);
		expect(plan.synced).toEqual([was('A', true)]);
	});

	it('unticked in Trello only -> unticked in the note', () => {
		const a = task('A', true);
		const plan = planSync([a], [ci('1', 'A')], [was('A', true)]);
		expect(plan.note).toEqual([{ line: a.line, text: 'A', done: false }]);
	});

	it('changed in both places differently -> the note wins', () => {
		// last synced: done; note: unticked; Trello: still done -> the note changed, Trello did not
		const plan = planSync([task('A')], [ci('1', 'A', true)], [was('A', true)]);
		expect(plan.trello).toEqual([{ kind: 'update', itemId: '1', text: 'A', done: false }]);
		expect(plan.note).toEqual([]);
	});

	it('without memory (first sync, memory lost) -> the note wins', () => {
		const plan = planSync([task('A')], [ci('1', 'A', true)], []);
		expect(plan.trello).toEqual([{ kind: 'update', itemId: '1', text: 'A', done: false }]);
		expect(plan.note).toEqual([]);
	});

	it('a new task with the same text as an old Trello item: the note wins', () => {
		const plan = planSync([task('A')], [ci('1', 'A', true)], [was('B')]);
		expect(plan.note).toEqual([]);
		expect(plan.trello).toEqual([{ kind: 'update', itemId: '1', text: 'A', done: false }]);
	});
});

describe('planSync: duplicated texts', () => {
	it('are matched one to one, in order', () => {
		const plan = planSync([task('A'), task('A', true)], [ci('1', 'A'), ci('2', 'A'), ci('3', 'A')], []);
		expect(plan.trello).toEqual([
			{ kind: 'update', itemId: '2', text: 'A', done: true },
			{ kind: 'delete', itemId: '3', text: 'A' },
		]);
	});
});

describe('splitFrozen (card switch)', () => {
	it('done tasks at the switch stay with the old card, open ones go on', () => {
		const tasks = [task('Old done', true), task('Still open')];
		const r = splitFrozen(tasks, [ci('9', 'Old done', true)], ['Old done']);
		expect(r.tasks.map((t) => t.text)).toEqual(['Still open']);
		expect(r.items).toEqual([]); // same-named items on the new card are left alone
		expect(r.frozen).toEqual(['Old done']);
	});

	it('an unticked frozen task is unfrozen and joins the new card', () => {
		const r = splitFrozen([task('Old done', false)], [], ['Old done']);
		expect(r.tasks.map((t) => t.text)).toEqual(['Old done']);
		expect(r.frozen).toEqual([]);
	});

	it('a deleted frozen task is forgotten', () => {
		expect(splitFrozen([task('Other')], [], ['Old done']).frozen).toEqual([]);
	});

	it('a frozen text that also exists as an open task is unfrozen (no duplicate creation)', () => {
		const tasks = [task('Send minutes', true), task('Send minutes')];
		const r = splitFrozen(tasks, [ci('1', 'Send minutes')], ['Send minutes']);
		expect(r.frozen).toEqual([]);
		expect(r.tasks).toHaveLength(2);
		expect(r.items).toHaveLength(1);
	});

	it('nothing frozen: everything passes through', () => {
		const tasks = [task('A', true), task('B')];
		const items = [ci('1', 'A', true)];
		expect(splitFrozen(tasks, items, [])).toEqual({ tasks, items, frozen: [] });
	});
});
