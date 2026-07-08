/**
 * Format-on-save must be stable: formatting an already-formatted document a
 * second time changes nothing. prettier-plugin-svelte is not always
 * idempotent (with htmlWhitespaceSensitivity 'ignore' some fragments settle
 * only on a second pass — Disclosure.sdoc and welcome.sdoc regressed), so
 * fragments format to a fixpoint; this drives the whole docs corpus through
 * the formatting module to hold that line.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatSdoc } from '../src/server/formatting';
import { DOCS } from './helpers/lsp';

const OPTIONS = { tabSize: 4, insertSpaces: false };

const corpus: string[] = [];
for (const dir of ['src/ui', 'src/pages', 'src/docs']) {
	const abs = resolve(DOCS, dir);
	let entries: string[] = [];
	try {
		entries = readdirSync(abs, { recursive: true, encoding: 'utf-8' });
	} catch {
		continue;
	}
	for (const entry of entries) {
		if (entry.endsWith('.sdoc')) corpus.push(resolve(abs, entry));
	}
}

describe('formatting is idempotent over the docs corpus', () => {
	it('found the corpus', () => {
		expect(corpus.length).toBeGreaterThan(5);
	});

	it.each(corpus.map((file) => [file.slice(DOCS.length + 1), file]))(
		'%s formats to a fixpoint',
		async (_name, file) => {
			const source = readFileSync(file, 'utf-8');
			const once = (await formatSdoc(source, OPTIONS, undefined, file)) ?? source;
			const twice = (await formatSdoc(once, OPTIONS, undefined, file)) ?? once;
			expect(twice).toBe(once);
		},
	);
});
