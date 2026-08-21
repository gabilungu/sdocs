/**
 * Which opener the cursor is in, and which attributes are already written.
 *
 * This used to be decided by matching `/^\s*\[(SHOWCASE|DOC|…)\b/` against the
 * cursor's line. Inside a wrapped opener the cursor's line is `\ttitle="…"` or
 * a bare `]`, so nothing matched and completion returned before it ever
 * reached the rules — on exactly the openers long enough that the extension's
 * own formatter had wrapped them.
 */

import { describe, expect, it } from 'vitest';
import { openerAt, hostEntityAt } from '../src/blockCompletionCore.js';

/** Offset of the `|` marker, with the marker removed from the text. */
function at(marked: string): [string, number] {
	const offset = marked.indexOf('|');
	if (offset === -1) throw new Error('no cursor marker in fixture');
	return [marked.slice(0, offset) + marked.slice(offset + 1), offset];
}

const call = (marked: string) => openerAt(...at(marked));

describe('openerAt', () => {
	it('finds a single-line entity opener', () => {
		const ctx = call('[SHOWCASE title="Button" |]\n[/SHOWCASE]\n');
		expect(ctx?.kind).toBe('SHOWCASE');
		expect([...(ctx?.present ?? [])]).toContain('title');
	});

	it('finds a WRAPPED entity opener from a continuation line', () => {
		const ctx = call(
			'[SHOWCASE\n\ttitle="Button"\n\tdescription="Long."\n\t|\n]\n[/SHOWCASE]\n',
		);
		expect(ctx?.kind).toBe('SHOWCASE');
		// And it knows both attributes are taken, so neither is re-offered.
		expect([...(ctx?.present ?? [])].sort()).toEqual(['description', 'title']);
	});

	it('finds a WRAPPED sub-block opener, not its entity', () => {
		const ctx = call(
			'[SHOWCASE title="B"]\n\n\t[COMPONENT\n\t\tcomponent={B}\n\t\t|\n\t]\n\t\t<B />\n\t[/COMPONENT]\n\n[/SHOWCASE]\n',
		);
		expect(ctx?.kind).toBe('COMPONENT');
		expect([...(ctx?.present ?? [])]).toContain('component');
	});

	it('keeps the tag as written, so lowercase still resolves', () => {
		const ctx = call('[SHOWCASE title="B"]\n\n\t[component\n\t\tcomponent={B}\n\t\t|\n\t]\n\t\t<B />\n\t[/component]\n\n[/SHOWCASE]\n');
		expect(ctx?.kind).toBe('component');
	});

	it('offers nothing before the tag name is finished', () => {
		expect(call('[SHOW|\n')).toBeNull();
	});

	it('offers nothing inside a quoted value', () => {
		expect(call('[SHOWCASE title="Bu|tton"]\n[/SHOWCASE]\n')).toBeNull();
	});

	it('offers nothing inside a multi-line expression value', () => {
		// The old guard counted braces on one line and could not see this.
		expect(
			call('[SHOWCASE title="B"]\n\n\t[COMPONENT component={B} args={{\n\t\tlabel: |\n\t}}]\n\t\t<B />\n\t[/COMPONENT]\n\n[/SHOWCASE]\n'),
		).toBeNull();
	});

	it('offers nothing in a body', () => {
		expect(call('[DOC title="G"]\n\n\tsome |prose\n\n[/DOC]\n')).toBeNull();
	});
});

describe('hostEntityAt', () => {
	it('names the entity whose body the cursor is in', () => {
		const [text, offset] = at('[SHOWCASE title="B"]\n\n\t|\n\n[/SHOWCASE]\n');
		expect(hostEntityAt(text, offset)).toBe('SHOWCASE');
	});

	it('is null outside every entity', () => {
		const [text, offset] = at('[SHOWCASE title="B"]\n[/SHOWCASE]\n\n|\n');
		expect(hostEntityAt(text, offset)).toBeNull();
	});
});
