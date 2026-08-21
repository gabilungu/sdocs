/**
 * Editing a `.sdoc` from the browser rewrites the file the author is reading,
 * so the edit has to be surgical: the `notes` attribute and nothing else.
 * These lock that — every case asserts the whole file, not just the opener.
 */

import { describe, expect, it } from 'vitest';
import { writeNotes, toggleTodo, NoteTargetError } from '../../src/lib/server/note-editor.js';
import { parseSdoc } from '../../src/lib/language/parser.js';

const DOC = ['[DOC title="Guides / Intro"]', '', '\tHello.', '', '[/DOC]', ''].join('\n');

const SHOWCASE = [
	'<script>',
	"\timport Badge from './Badge.svelte';",
	'</script>',
	'',
	'[SHOWCASE title="Display / Badge" description="A badge."]',
	'',
	'\t[COMPONENT component={Badge}]',
	'\t\t<Badge />',
	'\t[/COMPONENT]',
	'',
	'\t[EXAMPLE title="Plain"]',
	'\t\t<Badge />',
	'\t[/EXAMPLE]',
	'',
	'[/SHOWCASE]',
	'',
].join('\n');

/** What the parser makes of the result — the real check that an edit landed. */
function notesOf(source: string, index = 0) {
	const doc = parseSdoc(source);
	expect(doc.diagnostics).toEqual([]);
	return doc.entities[index].notes;
}

describe('writeNotes', () => {
	it('opens a [NOTES] block under the entity opener', () => {
		const out = writeNotes(DOC, { entitySlug: 'guides-intro' }, [
			{ note: 'Being rewritten.', type: 'wip' },
		]);
		expect(out.split('\n').slice(0, 4)).toEqual([
			'[DOC title="Guides / Intro"]',
			'',
			'\t[NOTES]',
			'\t\t- wip: Being rewritten.',
		]);
		expect(notesOf(out)).toEqual([{ note: 'Being rewritten.', type: 'wip' }]);
	});

	it('writes a plain remark with no type', () => {
		const out = writeNotes(DOC, { entitySlug: 'guides-intro' }, [{ note: 'Just so you know' }]);
		expect(out).toContain('\t\t- Just so you know');
		expect(notesOf(out)).toEqual([{ note: 'Just so you know', type: null }]);
	});

	it('replaces the block that is already there', () => {
		const once = writeNotes(DOC, { entitySlug: 'guides-intro' }, [{ note: 'First' }]);
		const twice = writeNotes(once, { entitySlug: 'guides-intro' }, [
			{ note: 'Second', type: 'bug' },
		]);
		expect(notesOf(twice)).toEqual([{ note: 'Second', type: 'bug' }]);
		expect(twice.match(/\[NOTES\]/g)).toHaveLength(1);
	});

	it('removes the block when the last note goes', () => {
		const once = writeNotes(DOC, { entitySlug: 'guides-intro' }, [{ note: 'First' }]);
		const gone = writeNotes(once, { entitySlug: 'guides-intro' }, []);
		expect(gone).toBe(DOC);
	});

	it('keeps the rest of the document byte-identical', () => {
		const out = writeNotes(DOC, { entitySlug: 'guides-intro' }, [{ note: 'Hi' }]);
		// Everything that was there is still there, in order.
		for (const line of DOC.split('\n').filter((l) => l.trim())) {
			expect(out).toContain(line);
		}
	});

	it('writes an example\'s notes inside the example', () => {
		const out = writeNotes(
			SHOWCASE,
			{ entitySlug: 'display-badge', exampleTitle: 'Plain' },
			[{ note: 'Contrast unverified.', type: 'bug' }],
		);
		const doc = parseSdoc(out);
		expect(doc.diagnostics).toEqual([]);
		const showcase = doc.entities[0] as { notes: unknown[]; examples: { notes: unknown[] }[] };
		// The entity keeps none of its own; the example carries them.
		expect(showcase.notes).toEqual([]);
		expect(showcase.examples[0].notes).toEqual([
			{ note: 'Contrast unverified.', type: 'bug' },
		]);
	});

	it('flattens a newline rather than splitting one note into two', () => {
		// The block is one note per line, so a pasted paragraph has to collapse.
		const out = writeNotes(DOC, { entitySlug: 'guides-intro' }, [
			{ note: 'First line\nsecond line' },
		]);
		expect(notesOf(out)).toEqual([{ note: 'First line second line', type: null }]);
	});

	it('survives a round trip through its own output', () => {
		let source = DOC;
		for (const note of ['One', 'Two', 'Three']) {
			source = writeNotes(source, { entitySlug: 'guides-intro' }, [{ note }]);
		}
		expect(notesOf(source)).toEqual([{ note: 'Three', type: null }]);
	});

	it('refuses a target it cannot find', () => {
		expect(() => writeNotes(DOC, { entitySlug: 'nope' }, [])).toThrow(NoteTargetError);
		expect(() =>
			writeNotes(SHOWCASE, { entitySlug: 'display-badge', exampleTitle: 'Missing' }, []),
		).toThrow(NoteTargetError);
	});
});

/**
 * Ticking a todo is the other write the Explorer makes. It has to be even
 * smaller than a note edit — one character between the brackets — because the
 * checklist is the author's own text and a tick is not an invitation to
 * reformat it.
 */
describe('toggleTodo', () => {
	const WITH_TODO = [
		'[DOC title="Guides / Intro"]',
		'',
		'\t[TODO]',
		'\t\t- [ ] Write the intro',
		'\t\t\t- [x] Outline   it',
		'\t\t\t- [ ] Fill it in',
		'\t\t- [ ] Ship',
		'\t[/TODO]',
		'',
		'\tHello.',
		'',
		'[/DOC]',
		'',
	].join('\n');

	it('ticks a root item and changes nothing else', () => {
		const out = toggleTodo(WITH_TODO, { entitySlug: 'guides-intro' }, [1], true);
		expect(out).toBe(WITH_TODO.replace('- [ ] Ship', '- [x] Ship'));
	});

	it('addresses a nested item by path', () => {
		const out = toggleTodo(WITH_TODO, { entitySlug: 'guides-intro' }, [0, 1], true);
		expect(out).toBe(WITH_TODO.replace('- [ ] Fill it in', '- [x] Fill it in'));
	});

	// The author's spacing inside the line is theirs; only the mark moves.
	it('unticks without touching the text', () => {
		const out = toggleTodo(WITH_TODO, { entitySlug: 'guides-intro' }, [0, 0], false);
		expect(out).toBe(WITH_TODO.replace('- [x] Outline   it', '- [ ] Outline   it'));
		expect(out).toContain('Outline   it');
	});

	it('ticks a todo inside an example', () => {
		const source = [
			'[SHOWCASE title="Display / Badge"]',
			'',
			'\t[EXAMPLE title="Plain"]',
			'\t\t[TODO]',
			'\t\t\t- [ ] Check the dark theme',
			'\t\t[/TODO]',
			'\t\t<Badge />',
			'\t[/EXAMPLE]',
			'',
			'[/SHOWCASE]',
			'',
		].join('\n');
		const out = toggleTodo(source, { entitySlug: 'display-badge', exampleTitle: 'Plain' }, [0], true);
		expect(out).toBe(source.replace('- [ ]', '- [x]'));
	});

	it('refuses a path that addresses nothing', () => {
		expect(() => toggleTodo(WITH_TODO, { entitySlug: 'guides-intro' }, [9], true)).toThrow(
			NoteTargetError,
		);
	});

	it('refuses an entity with no [TODO] block', () => {
		expect(() => toggleTodo(DOC, { entitySlug: 'guides-intro' }, [0], true)).toThrow(
			NoteTargetError,
		);
	});
});
