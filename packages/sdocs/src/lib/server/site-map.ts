import { readFile } from 'node:fs/promises';
import { discoverDocFiles } from './discovery.js';
import { parseSdoc } from '../language/index.js';
import { planEntitySnippets } from './doc-model.js';
import { buildSections } from '../explorer/tree-builder.js';
import type { DocEntry, ResolvedSdocsConfig } from '../types.js';

/**
 * The site's section/route map, derived from the doc files exactly as the
 * Explorer derives it.
 *
 * One validation, three consumers: `build` refuses to deploy a broken
 * structure, `check` reports the same problems without building, and the
 * Explorer routes with it at runtime. Structure errors used to be visible
 * only to `build`, so `check` — the command CI is told to gate on — passed a
 * site that could not be built.
 */
export async function buildSiteMap(config: ResolvedSdocsConfig, cwd: string) {
	const files = await discoverDocFiles(config.include, cwd);
	const stubs: DocEntry[] = [];
	for (const filePath of files) {
		const doc = parseSdoc(await readFile(filePath, 'utf-8'));
		for (const entity of doc.entities) {
			stubs.push({
				kind:
					entity.kind === 'SHOWCASE'
						? 'component'
						: entity.kind === 'DOC'
							? 'doc'
							: entity.kind === 'PAGE'
								? 'page'
								: 'layout',
				filePath,
				entitySlug: entity.slug,
				meta: {
					title: entity.title,
					...(entity.kind === 'SHOWCASE' && entity.description
						? { description: entity.description }
						: {}),
				},
				previews: [],
				prose: [],
				examples:
					entity.kind === 'SHOWCASE'
						? planEntitySnippets(entity)
								.filter((s) => s.role === 'example')
								.map((s) => ({ name: s.name, slug: s.slug, role: s.role, body: '' }))
						: [],
				content: null,
				routeSlug: entity.routeSlug ?? undefined,
				hide: entity.hide,
			});
		}
	}
	return buildSections(stubs, {
		sections: config.sectionsDeclared ? config.sections : undefined,
		home: config.home,
	});
}
