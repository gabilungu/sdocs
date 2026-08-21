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
