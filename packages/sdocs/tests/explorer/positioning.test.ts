/**
 * An absolutely-positioned element resolves its offsets against the nearest
 * positioned ancestor, and if nobody in the chain is positioned that is the
 * app root — the whole viewport.
 *
 * The dev note control learned this the hard way. Its "corner" variant is a
 * 120×52 hover zone at `top: 0; right: 12px`, meant for the top-right of the
 * doc's own content column. Nothing between it and `.sdocs-app` was
 * positioned, so it landed over the top bar instead, where it swallowed every
 * click meant for fullscreen and the kebab menu on any [DOC] page whose body
 * supplies its own heading. It looked like nothing at all: the zone is
 * invisible, so the buttons simply stopped working.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../src/lib/explorer/views');
const read = (name: string) => readFileSync(resolve(root, name), 'utf-8');

/** The body of one CSS rule in a `<style>` block, by selector. */
function rule(source: string, selector: string): string {
	const at = source.indexOf(selector);
	if (at === -1) return '';
	const open = source.indexOf('{', at);
	return source.slice(open + 1, source.indexOf('}', open));
}

describe('the corner note control has a containing block', () => {
	it('is positioned absolutely', () => {
		expect(rule(read('NoteControl.svelte'), ".sdocs-note-control[data-variant='corner']")).toContain(
			'position: absolute',
		);
	});

	it('and the column it sits in is positioned, so it lands there', () => {
		// DocView renders the corner variant; `.sdocs-page-main` is the element
		// it is a descendant of and the one whose corner it is meant to take.
		expect(rule(read('DocView.svelte'), '.sdocs-page-main')).toContain('position: relative');
	});
});
