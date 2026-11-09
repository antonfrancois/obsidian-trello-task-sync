import { describe, expect, it } from 'vitest';
import { extractTasks, isDone, ListItemLike, setTaskDone } from '../src/tasks';

const item = (line: number, task?: string): ListItemLike => ({ task, position: { start: { line } } });

describe('isDone', () => {
	it.each([
		['x', true],
		['X', true],
		['-', true], // cancelled counts as done
		[' ', false],
		['/', false], // in progress counts as open
		['?', false],
	])('%j -> %s', (status, done) => {
		expect(isDone(status)).toBe(done);
	});
});

describe('extractTasks', () => {
	const content = [
		'# Title', // 0
		'- [ ] First task', // 1
		'- [x] Done task ^t-7k2q', // 2
		'- not a task', // 3
		'    - [ ] Nested task', // 4
		'1. [/] Numbered in progress', // 5
		'> - [-] Quoted cancelled', // 6
		'* [ ]   ', // 7: empty task
	].join('\n');

	it('reads text and state, strips prefix and block id, skips non-tasks and empty tasks', () => {
		const items = [item(1, ' '), item(2, 'x'), item(3), item(4, ' '), item(5, '/'), item(6, '-'), item(7, ' ')];
		expect(extractTasks(content, items)).toEqual([
			{ text: 'First task', done: false, line: 1 },
			{ text: 'Done task', done: true, line: 2 },
			{ text: 'Nested task', done: false, line: 4 },
			{ text: 'Numbered in progress', done: false, line: 5 },
			{ text: 'Quoted cancelled', done: true, line: 6 },
		]);
	});

	it('handles Windows line endings', () => {
		expect(extractTasks('a\r\n- [ ] Task\r\n', [item(1, ' ')])).toEqual([{ text: 'Task', done: false, line: 1 }]);
	});
});

describe('setTaskDone', () => {
	const note = ['# T', '- [ ] Send the minutes', '    * [/] Nested ^t-1', '> - [-] Quoted'].join('\n');

	it('ticks and unticks the task on the line', () => {
		expect(setTaskDone(note, 1, 'Send the minutes', true)).toBe(note.replace('- [ ] Send', '- [x] Send'));
		expect(setTaskDone(note, 2, 'Nested', true)).toBe(note.replace('* [/] Nested', '* [x] Nested'));
		expect(setTaskDone(note, 3, 'Quoted', false)).toBe(note.replace('> - [-] Quoted', '> - [ ] Quoted'));
	});

	it('changes nothing if the line no longer holds that task', () => {
		expect(setTaskDone(note, 1, 'Other text', true)).toBeNull();
		expect(setTaskDone(note, 0, '# T', true)).toBeNull();
		expect(setTaskDone(note, 99, 'Send the minutes', true)).toBeNull();
	});

	it('keeps Windows line endings', () => {
		expect(setTaskDone('a\r\n- [ ] T\r\n', 1, 'T', true)).toBe('a\r\n- [x] T\r\n');
	});
});
