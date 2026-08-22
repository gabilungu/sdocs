/**
 * Internal links on the docs site have to point at routes and anchors that
 * exist.
 *
 * Three dead routes (`/cli`, `/extension`, twice) sat on the Explorer overview
 * page until an audit went looking, and a `#outdir` anchor pointed at a
 * section that had never been written. Neither breaks loudly: the route lands
 * on the not-found page, and a dead anchor just quietly doesn't scroll.
 *
 * Both sides come from the code the site itself uses — the section builder for
 * routes, the markdown renderer's own TOC for anchors — so this cannot drift
 * from what is actually served.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseSdoc } from '../../src/lib/language/parser.js';
import { buildSections } from '../../src/lib/explorer/tree-builder.js';
import { renderPageMarkdown } from '../../src/lib/server/page-markdown.js';
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
							: entity.kind === 'PATTERN'
								? 'pattern'
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

		// Anchors a route actually offers, keyed by route. Only [DOC] bodies
		// generate headings, and their ids come from the renderer's own TOC.
		const anchors = new Map<string, Set<string>>();
		for (const file of files) {
			for (const entity of parseSdoc(readFileSync(file, 'utf-8')).entities) {
				if (entity.kind !== 'DOC') continue;
				const target = [...map.routes.entries()].find(
					([, t]) => t.doc.entitySlug === entity.slug,
				);
				if (!target) continue;
				const body = 'body' in entity ? String(entity.body ?? '') : '';
				const { toc } = await renderPageMarkdown(body);
				anchors.set(`/${target[0]}`, new Set(toc.map((h) => h.id)));
			}
		}

		const dead: string[] = [];
		for (const file of files) {
			const source = readFileSync(file, 'utf-8');
			for (const m of source.matchAll(/\]\((\/[^)#\s]*)(#[^)\s]*)?\)/g)) {
				const href = m[1];
				if (ILLUSTRATIVE.test(href)) continue;
				const route = href.replace(/\/$/, '') || '/';
				const where = `${file.slice(DOCS.length + 1)} → ${href}${m[2] ?? ''}`;
				if (!routes.has(route)) {
					dead.push(where);
					continue;
				}
				const fragment = m[2]?.slice(1);
				// A route with no headings of its own (a [PAGE], a showcase)
				// has nothing to anchor into, so only check where we know.
				if (fragment && anchors.has(route) && !anchors.get(route)!.has(fragment)) {
					dead.push(where);
				}
			}
		}
		expect(dead).toEqual([]);
	});
});
