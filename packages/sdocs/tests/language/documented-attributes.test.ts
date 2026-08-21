/**
 * Every attribute the parser accepts has to appear in the reference.
 *
 * The tables are hand-written and the rules are code, so they drift in one
 * direction: an attribute ships, the table is not touched, and the only way to
 * discover the attribute is to read the source. `status` and `minHeight` sat
 * undocumented on `[COMPONENT]` for exactly that reason — `status` even had a
 * section of its own further down the same page, just not a row in the table.
 *
 * The check is one-directional on purpose: a table may carry extra rows the
 * rules do not (a bare flag explained twice, a combined `a` / `b` row), but it
 * may not be missing one.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { attributeRules } from '../../src/lib/language/parser.js';

const DOCS = resolve(__dirname, '../../../../apps/docs/src/docs/language');

/** Which reference page documents which block kinds. */
const PAGES: { file: string; kinds: string[] }[] = [
	{ file: 'component-docs.sdoc', kinds: ['SHOWCASE', 'preview'] },
	{ file: 'doc-pages.sdoc', kinds: ['DOC', 'example'] },
	{ file: 'svelte-pages.sdoc', kinds: ['PAGE'] },
	{ file: 'layout-docs.sdoc', kinds: ['LAYOUT'] },
];

/** Attribute names in `| \`name\` |` cells, combined `\`a\` / \`b\`` rows included. */
function documented(source: string): Set<string> {
	const names = new Set<string>();
	for (const [, cell] of source.matchAll(/^\s*\|\s*((?:`[A-Za-z]+`\s*\/?\s*)+)\|/gm)) {
		for (const [, name] of cell.matchAll(/`([A-Za-z]+)`/g)) names.add(name);
	}
	return names;
}

describe('the language reference documents every attribute', () => {
	for (const { file, kinds } of PAGES) {
		it(`${file} covers ${kinds.join(' and ')}`, () => {
			const names = documented(readFileSync(resolve(DOCS, file), 'utf-8'));
			expect(names.size, 'no attribute table found').toBeGreaterThan(3);
			const missing = kinds.flatMap((kind) =>
				Object.keys(attributeRules(kind))
					.filter((attr) => !names.has(attr))
					.map((attr) => `${kind}.${attr}`),
			);
			expect(missing).toEqual([]);
		});
	}
});
