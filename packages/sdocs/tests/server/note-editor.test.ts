/**
 * Editing a `.sdoc` from the browser rewrites the file the author is reading,
 * so the edit has to be surgical: the `notes` attribute and nothing else.
 * These lock that — every case asserts the whole file, not just the opener.
 */

import { describe, expect, it } from 'vitest';
import { writeNotes, NoteTargetError } from '../../src/lib/server/note-editor.js';
import { parseSdoc } from '../../src/lib/language/parser.js';

const DOC = ['[DOC title="Guides / Intro"]', '', '\tHello.', '', '[/DOC]', ''].join('\n');

const SHOWCASE = [
	'<script>',
	"\timport Badge from './Badge.svelte';",
	'</script>',
	'',
	'[SHOWCASE title="Display / Badge" description="A badge."]',
	'',
	'\t[component component={Badge}]',
	'\t\t<Badge />',
	'\t[/component]',
	'',
	'\t[example title="Plain"]',
	'\t\t<Badge />',
	'\t[/example]',
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
	it('adds an attribute to a single-line opener', () => {
		const out = writeNotes(DOC, { entitySlug: 'guides-intro' }, [
			{ note: 'Being rewritten.', intent: 'warning' },
		]);
		expect(out.split('\n')[0]).toBe(
			`[DOC title="Guides / Intro" notes={[{ note: 'Being rewritten.', intent: 'warning' }]}]`,
		);
		expect(notesOf(out)).toEqual([{ note: 'Being rewritten.', intent: 'warning' }]);
	});

	it('leaves every other byte alone', () => {
		const out = writeNotes(DOC, { entitySlug: 'guides-intro' }, [{ note: 'Hi' }]);
		expect(out.split('\n').slice(1)).toEqual(DOC.split('\n').slice(1));
	});

	it('replaces an attribute that is already there', () => {
		const once = writeNotes(DOC, { entitySlug: 'guides-intro' }, [{ note: 'First' }]);
		const twice = writeNotes(once, { entitySlug: 'guides-intro' }, [
			{ note: 'Second', intent: 'danger' },
		]);
		expect(notesOf(twice)).toEqual([{ note: 'Second', intent: 'danger' }]);
		expect(twice.match(/notes=/g)).toHaveLength(1);
	});

	it('removes the attribute when the last note goes', () => {
		const once = writeNotes(DOC, { entitySlug: 'guides-intro' }, [{ note: 'First' }]);
		const gone = writeNotes(once, { entitySlug: 'guides-intro' }, []);
		expect(gone).toBe(DOC);
	});

	it('wraps a list of several, indented from the opener', () => {
		const out = writeNotes(DOC, { entitySlug: 'guides-intro' }, [
			{ note: 'One', intent: 'danger' },
			{ note: 'Two' },
		]);
		// The opener sits at column 0, so the entries take one tab and the
		// bracket closes back at the opener's own indentation.
		expect(out.split('\n').slice(0, 4)).toEqual([
			`[DOC title="Guides / Intro" notes={[`,
			`\t{ note: 'One', intent: 'danger' },`,
			`\t{ note: 'Two' },`,
			`]}]`,
		]);
		expect(notesOf(out)).toEqual([
			{ note: 'One', intent: 'danger' },
			{ note: 'Two', intent: null },
		]);
	});

	it('indents from the attribute when the opener is already wrapped', () => {
		const wrapped = [
			'[DOC',
			'\ttitle="Guides / Intro"',
			']',
			'',
			'\tHello.',
			'',
			'[/DOC]',
			'',
		].join('\n');
		const out = writeNotes(wrapped, { entitySlug: 'guides-intro' }, [
			{ note: 'One' },
			{ note: 'Two' },
		]);
		expect(out.split('\n').slice(0, 6)).toEqual([
			'[DOC',
			'\ttitle="Guides / Intro"',
			'\tnotes={[',
			"\t\t{ note: 'One' },",
			"\t\t{ note: 'Two' },",
			'\t]}',
		]);
		expect(notesOf(out)).toEqual([
			{ note: 'One', intent: null },
			{ note: 'Two', intent: null },
		]);
	});

	it('edits an example without touching its entity', () => {
		const out = writeNotes(
			SHOWCASE,
			{ entitySlug: 'display-badge', exampleTitle: 'Plain' },
			[{ note: 'Contrast unverified.', intent: 'danger' }],
		);
		const doc = parseSdoc(out);
		expect(doc.diagnostics).toEqual([]);
		const showcase = doc.entities[0] as { notes: unknown[]; examples: { notes: unknown[] }[] };
		expect(showcase.notes).toEqual([]);
		expect(showcase.examples[0].notes).toEqual([
			{ note: 'Contrast unverified.', intent: 'danger' },
		]);
	});

	it('keeps quotes and backslashes intact', () => {
		const text = `it's a \\ backslash and 'quotes'`;
		const out = writeNotes(DOC, { entitySlug: 'guides-intro' }, [{ note: text }]);
		expect(notesOf(out)).toEqual([{ note: text, intent: null }]);
	});

	it('survives a round trip through its own output', () => {
		let source = DOC;
		for (const note of ['One', 'Two', 'Three']) {
			source = writeNotes(source, { entitySlug: 'guides-intro' }, [{ note }]);
		}
		expect(notesOf(source)).toEqual([{ note: 'Three', intent: null }]);
	});

	it('refuses a target it cannot find', () => {
		expect(() => writeNotes(DOC, { entitySlug: 'nope' }, [])).toThrow(NoteTargetError);
		expect(() =>
			writeNotes(SHOWCASE, { entitySlug: 'display-badge', exampleTitle: 'Missing' }, []),
		).toThrow(NoteTargetError);
	});
});
