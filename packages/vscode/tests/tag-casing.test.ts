/**
 * Sub-block tags went uppercase in sdocs 0.0.139, and nothing rewrites old
 * files on release — the formatter is the migration. Both spellings parse
 * forever, so this only ever changes how a document looks.
 *
 * The third case is the one worth guarding: our own docs show the old
 * lowercase syntax inside prose fences, and rewriting those would corrupt the
 * very pages explaining the change.
 */

import { describe, expect, it } from 'vitest';
import { formatSdoc } from '../src/server/formatting';
import { sdocTagHover } from '../src/server/tagHover';

const OPTIONS = { tabSize: 4, insertSpaces: false };

const LOWER = [
	'[SHOWCASE title="X"]',
	'',
	'\t[component component={B}]',
	'\t\t<B />',
	'\t[/component]',
	'',
	'\t[example title="One"]',
	'\t\t<B />',
	'\t[/example]',
	'',
	'[/SHOWCASE]',
	'',
].join('\n');

describe('formatting migrates tag casing', () => {
	it('capitalizes sub-block openers and closers', async () => {
		const out = (await formatSdoc(LOWER, OPTIONS)) ?? LOWER;
		expect(out).toContain('[COMPONENT component={B}]');
		expect(out).toContain('[/COMPONENT]');
		expect(out).toContain('[EXAMPLE title="One"]');
		expect(out).toContain('[/EXAMPLE]');
		expect(out).not.toContain('[component');
		expect(out).not.toContain('[/example]');
	});

	it('is idempotent — a capitalized document is left alone', async () => {
		const once = (await formatSdoc(LOWER, OPTIONS)) ?? LOWER;
		const twice = (await formatSdoc(once, OPTIONS)) ?? once;
		expect(twice).toBe(once);
	});

	it('leaves a lowercase tag inside a prose fence alone', async () => {
		// The docs show old syntax on purpose; rewriting it would corrupt them.
		const doc = [
			'[DOC title="Guide"]',
			'',
			'\tBefore 0.0.139 you wrote:',
			'',
			'\t```sdoc',
			'\t[component component={B}]',
			'\t[/component]',
			'\t```',
			'',
			'[/DOC]',
			'',
		].join('\n');
		const out = (await formatSdoc(doc, OPTIONS)) ?? doc;
		expect(out).toContain('[component component={B}]');
		expect(out).not.toContain('[COMPONENT');
	});
});

/**
 * The blocks added in 0.0.139. Two of them the formatter deliberately does not
 * touch: a `[TODO]`'s nesting *is* its indentation, so normalizing the body
 * would change what the checklist means.
 */
describe('the text blocks and [COMPONENTS]', () => {
	it('indents the blocks inside a [COMPONENTS] one level deeper', async () => {
		const source = [
			'[SHOWCASE title="Nav / Tabs"]',
			'',
			'[COMPONENTS]',
			'[COMPONENT component={Tabs}]',
			'<Tabs />',
			'[/COMPONENT]',
			'[/COMPONENTS]',
			'',
			'[/SHOWCASE]',
			'',
		].join('\n');
		const out = (await formatSdoc(source, OPTIONS)) ?? source;
		expect(out).toContain('\t\t[COMPONENT component={Tabs}]');
		expect(out).toContain('\t\t[/COMPONENT]');
	});

	it('leaves a [TODO] body exactly as written', async () => {
		const source = [
			'[SHOWCASE title="Nav / Tabs"]',
			'',
			'\t[TODO]',
			'\t\t- [ ] Parent',
			'\t\t\t\t- [x] Deeply nested on purpose',
			'\t[/TODO]',
			'',
			'\t[COMPONENT component={Tabs}]',
			'\t\t<Tabs />',
			'\t[/COMPONENT]',
			'',
			'[/SHOWCASE]',
			'',
		].join('\n');
		const out = (await formatSdoc(source, OPTIONS)) ?? source;
		expect(out).toContain('\t\t\t\t- [x] Deeply nested on purpose');
	});

	it('formats a [PROSE] body as markdown', async () => {
		const source = [
			'[SHOWCASE title="Nav / Tabs"]',
			'',
			'\t[PROSE]',
			'\t\tA    paragraph   with loose spacing.',
			'\t[/PROSE]',
			'',
			'\t[COMPONENT component={Tabs}]',
			'\t\t<Tabs />',
			'\t[/COMPONENT]',
			'',
			'[/SHOWCASE]',
			'',
		].join('\n');
		const out = (await formatSdoc(source, OPTIONS)) ?? source;
		expect(out).toContain('A paragraph with loose spacing.');
	});
});

/** The hover shares the parser's collision rule: uppercase-only for the text
 * blocks, so prose that opens with a markdown link is left alone. */
describe('tag hover', () => {
	const at = (line: string, character: number) => sdocTagHover(line, { line: 0, character });

	it('describes the new blocks in either position', () => {
		expect(at('\t[NOTES]', 3)?.contents).toBeTruthy();
		expect(at('\t[/TODO]', 4)?.contents).toBeTruthy();
		expect(at('\t[COMPONENTS]', 4)?.contents).toBeTruthy();
	});

	it('still describes both casings of the older blocks', () => {
		expect(at('\t[COMPONENT component={B}]', 4)?.contents).toBeTruthy();
		expect(at('\t[component component={B}]', 4)?.contents).toBeTruthy();
	});

	it('leaves a markdown link alone', () => {
		expect(at('See [notes](/language/overview#notes) for details.', 6)).toBeNull();
	});
});
