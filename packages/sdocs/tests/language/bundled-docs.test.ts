/**
 * The package bundles its own `.sdoc` files into `dist`, so they ship. They
 * went stale once — 14 of them kept the pre-0.0.67 `[preview]` tag long after
 * the parser stopped accepting it, and nothing said so, because nothing here
 * read them. This does.
 *
 * Then it happened again, one level down. The samples *inside* ` ```sdoc `
 * fences — in the docs site, in the READMEs — are the first sdoc anybody sees,
 * and nothing parsed them either: the 0.0.139 casing sweep left five of them
 * opening a block lowercase and closing it uppercase, which is a hard parse
 * error, and the published Getting Started page taught it for a day. A sample
 * nobody parses is a sample that rots, so this reads the fences too.
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

	// Every ` ```sdoc ` fence that contains a whole entity, wherever it lives —
	// .sdoc bodies and .md alike. A fence carrying only a fragment (a lone
	// attribute, a block with no entity around it) is not a document and is
	// skipped; anything with an entity opener is meant to be copy-pasteable.
	it('every sdoc sample in a fence parses — docs site and READMEs included', () => {
		const repo = resolve(__dirname, '../../../..');
		const roots = [
			resolve(repo, 'apps/docs/src'),
			resolve(repo, 'packages/sdocs/src'),
			resolve(repo, 'packages/sdocs/README.md'),
		];
		const broken: string[] = [];
		for (const root of roots) {
			const files = statSync(root).isDirectory()
				? walkAll(root).filter((f) => f.endsWith('.sdoc') || f.endsWith('.md'))
				: [root];
			for (const file of files) {
				const source = readFileSync(file, 'utf-8');
				for (const { body, line } of sdocFences(source)) {
					if (!/\[(SHOWCASE|DOC|PAGE|LAYOUT)\b/.test(body)) continue;
					const doc = parseSdoc(body);
					if (doc.diagnostics.length) {
						broken.push(
							`${file.slice(repo.length + 1)}:${line} — ${doc.diagnostics[0].message}`,
						);
					}
				}
			}
		}
		expect(broken).toEqual([]);
	});
});

/** Every file under `dir`, whatever the extension. */
function walkAll(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? walkAll(path) : [path];
	});
}

/**
 * The ` ```sdoc ` fences in a source, de-indented to their own column.
 *
 * A fence inside a `.sdoc` body is indented one tab into its entity; parsing it
 * with that indent still works, but the closing fence has to be matched at the
 * same indent or a fence swallows the rest of the file.
 */
function sdocFences(source: string): { body: string; line: number }[] {
	const out: { body: string; line: number }[] = [];
	const re = /^([ \t]*)```sdoc[ \t]*\n([\s\S]*?)^\1```[ \t]*$/gm;
	let m: RegExpExecArray | null;
	while ((m = re.exec(source))) {
		const indent = m[1];
		const body = m[2]
			.split('\n')
			.map((l) => (l.startsWith(indent) ? l.slice(indent.length) : l))
			.join('\n');
		out.push({ body, line: source.slice(0, m.index).split('\n').length });
	}
	return out;
}
