/**
 * The package bundles its own `.sdoc` files into `dist`, so they ship. They
 * went stale once — 14 of them kept the pre-0.0.67 `[preview]` tag long after
 * the parser stopped accepting it, and nothing said so, because nothing here
 * read them. This does.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseSdoc } from '../../src/lib/language/parser.js';

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return walk(path);
		return name.endsWith('.sdoc') ? [path] : [];
	});
}

describe('the package ships parseable docs', () => {
	it('every bundled .sdoc parses without a diagnostic', () => {
		const root = resolve(__dirname, '../../src/lib/ui');
		const broken: string[] = [];
		for (const file of walk(root)) {
			const doc = parseSdoc(readFileSync(file, 'utf-8'));
			if (doc.diagnostics.length) {
				broken.push(`${file.slice(root.length + 1)}: ${doc.diagnostics[0].message}`);
			}
		}
		expect(broken).toEqual([]);
	});
});
