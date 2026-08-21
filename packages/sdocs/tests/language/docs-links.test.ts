/**
 * Internal links on the docs site have to point at routes that exist.
 *
 * A dead one does not 404 — the Explorer resolves an unknown route to the
 * About screen with HTTP 200 — so a broken link looks like a working link that
 * goes somewhere odd. Three of them (`/cli`, `/extension`, twice) sat on the
 * Explorer overview page until an audit went looking.
 *
 * Routes come from the section builder, the same code the site itself routes
 * with, so this cannot drift from what is actually served.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseSdoc } from '../../src/lib/language/parser.js';
import { buildSections } from '../../src/lib/explorer/tree-builder.js';
import type { DocEntry } from '../../src/lib/types.js';

const DOCS = resolve(__dirname, '../../../../apps/docs/src');

function sdocFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return sdocFiles(path);
		return name.endsWith('.sdoc') ? [path] : [];
	});
}

/** Links written in prose, minus the ones that are deliberately illustrative:
 * a `![alt](/hero.png)` showing how `static` works, or the `/some/link` in the
 * markdown-collision explanation. Neither is a route and neither claims to be. */
const ILLUSTRATIVE = /\.(png|jpe?g|svg|gif|webp)$|^\/some\/link$|^\/llms\.txt$/;

describe('the docs site links to routes that exist', () => {
	it('has no dead internal link', async () => {
		const files = sdocFiles(DOCS);
		const entries: DocEntry[] = [];
		for (const file of files) {
			for (const entity of parseSdoc(readFileSync(file, 'utf-8')).entities) {
				entries.push({
					kind:
						entity.kind === 'SHOWCASE'
							? 'component'
							: entity.kind === 'DOC'
								? 'doc'
								: entity.kind === 'PAGE'
									? 'page'
									: 'layout',
					filePath: file,
					entitySlug: entity.slug,
					routeSlug: entity.routeSlug ?? undefined,
					hide: entity.hide,
					meta: { title: entity.title },
					prose: [],
					previews: [],
					examples: 'examples' in entity ? entity.examples.map((x) => ({ name: x.title })) : [],
					content: null,
				} as unknown as DocEntry);
			}
		}
		// Import the real config rather than parsing it: it is an ES module with
		// comments in it, and a regex that reads it is a second parser to keep
		// in step with the first.
		const config = (await import(resolve(DOCS, '../sdocs.config.js'))).default as {
			sections?: unknown[];
			home?: string;
		};
		const map = buildSections(entries, {
			sections: config.sections as never,
			home: config.home,
		});
		// Every route the site serves, plus the two pages sdocs always adds.
		const routes = new Set(['/', '/about', '/changelog', ...[...map.routes.keys()].map((k) => `/${k}`)]);

		const dead: string[] = [];
		for (const file of files) {
			const source = readFileSync(file, 'utf-8');
			for (const m of source.matchAll(/\]\((\/[^)#\s]*)(#[^)\s]*)?\)/g)) {
				const href = m[1];
				if (ILLUSTRATIVE.test(href)) continue;
				const route = href.replace(/\/$/, '') || '/';
				if (!routes.has(route)) {
					dead.push(`${file.slice(DOCS.length + 1)} → ${href}`);
				}
			}
		}
		expect(dead).toEqual([]);
	});
});
