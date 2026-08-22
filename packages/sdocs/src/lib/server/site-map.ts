import { readFile } from 'node:fs/promises';
import { relative } from 'node:path';
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
						: entity.kind === 'PATTERNS'
							? 'pattern'
							: entity.kind === 'DOC'
								? 'doc'
								: entity.kind === 'PAGE'
									? 'page'
									: 'layout',
				filePath,
				entitySlug: entity.slug,
				meta: {
					title: entity.title,
					...((entity.kind === 'SHOWCASE' || entity.kind === 'PATTERNS') && entity.description
						? { description: entity.description }
						: {}),
				},
				previews: [],
				prose: [],
				examples:
					// A pattern's states are addressable exactly as a showcase's
					// are — that is what puts them in the sidebar under it.
					entity.kind === 'SHOWCASE' || entity.kind === 'PATTERNS'
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

/**
 * Grammar diagnostics across the project, as `file:line — message`.
 *
 * `sdocs check` treats every one of these as an error and exits 1. `build`
 * used to see none of them: it validates the site structure and then lets Vite
 * compile, and a bad note type or an attribute that does not exist compiles
 * perfectly well. So a project whose CI ran only `build` deployed a site whose
 * notes rendered untyped and whose attributes were quietly ignored, with a
 * green pipeline.
 */
export async function collectGrammarErrors(
	config: ResolvedSdocsConfig,
	cwd: string,
): Promise<string[]> {
	const files = await discoverDocFiles(config.include, cwd);
	const problems: string[] = [];
	for (const filePath of files) {
		const source = await readFile(filePath, 'utf-8');
		const rel = relative(cwd, filePath);
		for (const d of parseSdoc(source).diagnostics) {
			const line = source.slice(0, d.span.start).split('\n').length;
			problems.push(`${rel}:${line} — ${d.message}`);
		}
	}
	return problems;
}
